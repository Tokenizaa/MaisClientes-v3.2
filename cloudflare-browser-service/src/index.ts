import { DurableObject } from "cloudflare:workers";
import { isValidSessionId, parseSessionTtl } from "./validation";

export interface Env {
	CLOUDFLARE_ACCOUNT_ID: string;
	CLOUDFLARE_API_TOKEN: string;
	BROWSER_SERVICE_API_KEYS: string;
	BROWSER_RUN_API_BASE?: string;
	DEFAULT_SESSION_TTL_MS?: string;
	MAX_SESSION_TTL_MS?: string;
	SESSION_PROXY: DurableObjectNamespace;
	ASSETS: Fetcher;
	/** Backend Express origin (ex: https://<tunnel>.trycloudflare.com) para rotas /api/* */
	BACKEND_URL?: string;
}

function json(data: unknown, status = 200): Response {
	return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function digest(value: string): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function equalSecret(a: string, b: string): Promise<boolean> {
	const [left, right] = await Promise.all([digest(a), digest(b)]);
	let diff = left.length ^ right.length;
	for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
		diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
	}
	return diff === 0;
}

async function authorized(request: Request, env: Env): Promise<boolean> {
	const supplied = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
	if (!supplied || supplied.length < 24) return false;
	const configured = (env.BROWSER_SERVICE_API_KEYS ?? "").split(",").map((key) => key.trim()).filter(Boolean);
	for (const key of configured) if (await equalSecret(supplied, key)) return true;
	return false;
}

function cloudflareUrl(env: Env, path: string): string {
	const base = env.BROWSER_RUN_API_BASE || "https://api.cloudflare.com/client/v4";
	return `${base}/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/browser-run${path}`;
}

async function cloudflareRequest(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
	return fetch(cloudflareUrl(env, path), {
		...init,
		headers: {
			Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
			...(init.headers || {}),
		},
	});
}

function upstreamError(status: number): Response {
	const safeStatus = status >= 400 && status <= 599 ? status : 502;
	return json({ error: "Browser Run request failed.", upstreamStatus: safeStatus }, safeStatus);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const isApiPath = url.pathname.startsWith("/v1/sessions") || url.pathname === "/health";

		// Proxy de rotas /api/* para o backend Express (rodando em Cloudflare via tunnel nomeado).
		// Nada depende de localhost: o usuário acessa o domínio e o worker encaminha para o backend origin.
		if (url.pathname.startsWith("/api/")) {
			const backendUrl = env.BACKEND_URL;
			if (!backendUrl) {
				return json({ error: "Backend não configurado: defina BACKEND_URL no worker." }, 502);
			}
			const target = new URL(url.pathname + url.search, backendUrl.replace(/\/$/, ""));

			// Construir headers do upstream (evitar passar Headers bruto do request).
			const upstreamHeaders: Record<string, string> = {};
			request.headers.forEach((value, key) => {
				if (!/^(host|connection)$/i.test(key)) upstreamHeaders[key] = value;
			});

			let body: BodyInit | undefined = undefined;
			if (request.method !== "GET" && request.method !== "HEAD") {
				body = await request.text();
				if (!upstreamHeaders["content-type"]) upstreamHeaders["content-type"] = "application/json";
			}

			const init: RequestInit = {
				method: request.method,
				headers: upstreamHeaders,
				body,
				redirect: "manual",
			};

			try {
				const upstream = await fetch(target.toString(), init);
				const responseHeaders: Record<string, string> = {};
				upstream.headers.forEach((value, key) => {
					if (!/^(content-length|connection)$/i.test(key)) responseHeaders[key] = value;
				});
				responseHeaders["cache-control"] = "no-store";
				const upstreamBody = await upstream.text();
				return new Response(upstreamBody, {
					status: upstream.status,
					statusText: upstream.statusText,
					headers: responseHeaders,
				});
			} catch (error) {
				return json({ error: "Backend indisponível.", detail: error instanceof Error ? error.message : String(error) }, 502);
			}
		}

		// Servir frontend React via ASSETS binding para rotas que não são da API
		if (!isApiPath) {
			return env.ASSETS.fetch(request);
		}

		// Rotas da API do Browser Service (existentes)

		// Health check - sem autenticação
		if (request.method === "GET" && url.pathname === "/health") {
			return json({ status: "ok", service: "nettos-browser-service", provider: "cloudflare-browser-run" });
		}

		// Autenticação requerida para rotas da API
		if (!(await authorized(request, env))) {
			return json({ error: "Unauthorized" }, 401);
		}

		// Criar sessão
		if (request.method === "POST" && url.pathname === "/v1/sessions") {
			let body: { keepAliveMs?: unknown } = {};
			try {
				body = await request.json() as typeof body;
			} catch {
				return json({ error: "Request body must be valid JSON." }, 400);
			}

			let keepAliveMs: number;
			try {
				keepAliveMs = parseSessionTtl(body.keepAliveMs);
			} catch (error) {
				return json({ error: error instanceof Error ? error.message : "Invalid session TTL." }, 400);
			}

			const upstream = await cloudflareRequest(
				env,
				`/devtools/browser?keep_alive=${keepAliveMs}`,
				{ method: "POST" },
			);
			if (!upstream.ok) return upstreamError(upstream.status);

			const payload = await upstream.json() as { sessionId?: string; webSocketDebuggerUrl?: string };
			if (!payload.sessionId || !isValidSessionId(payload.sessionId)) {
				return json({ error: "Cloudflare returned an invalid session identifier." }, 502);
			}

			return json({
				sessionId: payload.sessionId,
				connectUrl: `${url.origin}/v1/sessions/${payload.sessionId}/connect`,
				keepAliveMs,
				provider: "cloudflare-browser-run",
			}, 201);
		}

		// Matchar rota /v1/sessions/:sessionId/connect ou /v1/sessions/:sessionId
		const match = url.pathname.match(/^\/v1\/sessions\/([^/]+)(?:\/(connect))?$/);
		if (!match || !isValidSessionId(match[1])) {
			return json({ error: "Route not found." }, 404);
		}

		const sessionId = match[1];

		// Conectar via WebSocket
		if (match[2] === "connect") {
			if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
				return json({ error: "A WebSocket upgrade is required." }, 426);
			}
			const id = env.SESSION_PROXY.idFromName(sessionId);
			return env.SESSION_PROXY.get(id).fetch("https://session-proxy.internal/connect", {
				headers: { Upgrade: "websocket", "X-Browser-Session-Id": sessionId },
			});
		}

		// Encerrar sessão
		if (request.method === "DELETE") {
			const upstream = await cloudflareRequest(env, `/devtools/browser/${sessionId}`, { method: "DELETE" });
			if (!upstream.ok) return upstreamError(upstream.status);
			return json({ sessionId, status: "closing" });
		}

		return json({ error: "Method not allowed." }, 405);
	}
};

export class BrowserSessionProxy extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return new Response("WebSocket upgrade required", { status: 226 });
		}

		const sessionId = request.headers.get("X-Browser-Session-Id");
		if (!sessionId || !isValidSessionId(sessionId)) {
			return new Response("Invalid session", { status: 400 });
		}

		const upstreamUrl = cloudflareUrl(this.env, `/devtools/browser/${sessionId}`).replace(/^https:/, "https:");
		let upstream: Response;
		try {
			upstream = await fetch(upstreamUrl, {
				headers: {
					Authorization: `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
					Upgrade: "websocket",
				},
			});
		} catch {
			return new Response("Unable to connect to Browser Run.", { status: 502 });
		}

		if (upstream.status !== 101 || !upstream.webSocket) {
			return new Response("Browser Run rejected the WebSocket connection.", { status: 502 });
		}

		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];
		const remote = upstream.webSocket;
		server.accept();
		remote.accept();

		const relay = (source: WebSocket, destination: WebSocket) => {
			source.addEventListener("message", (event) => {
				if (destination.readyState === WebSocket.OPEN) destination.send(event.data);
			});
			source.addEventListener("close", (event) => {
				try { destination.close(event.code, event.reason); } catch { /* already closed */ }
			});
			source.addEventListener("error", () => {
				try { destination.close(1011, "WebSocket relay error"); } catch { /* already closed */ }
			});
		};

		relay(server, remote);
		relay(remote, server);
		return new Response(null, { status: 101, webSocket: client });
	}
}