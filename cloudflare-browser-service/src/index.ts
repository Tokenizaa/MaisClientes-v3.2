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

// ============================================================================
// CDP Client: envia comandos Chrome DevTools Protocol através de uma conexão
// WebSocket mantida pelo Durable Object BrowserSessionProxy.
// ============================================================================

interface CDPMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
}

interface CDPResponse {
  id: number;
  result?: unknown;
  error?: unknown;
}

class CDPSession {
  private ws: WebSocket;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (err: unknown) => void }>;
  private nextId = 1;

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (event) => {
      const text = event.data as string;
      try {
        const parsed = JSON.parse(text) as CDPResponse;
        if (parsed.id !== undefined && this.pending.has(parsed.id)) {
          const { resolve, reject } = this.pending.get(parsed.id)!;
          this.pending.delete(parsed.id);
          if (parsed.error) reject(parsed.error);
          else resolve(parsed.result);
        }
      } catch {
        // ignorar mensagens não-JSON
      }
    });
    ws.addEventListener("close", () => {
      for (const [, { reject }] of this.pending) {
        reject(new Error("WebSocket closed"));
      }
      this.pending.clear();
    });
    ws.addEventListener("error", () => {
      for (const [, { reject }] of this.pending) {
        reject(new Error("WebSocket error"));
      }
      this.pending.clear();
    });
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      const msg: CDPMessage = { id, method, params };
      this.ws.send(JSON.stringify(msg));
    });
  }
}

async function scrapeGoogleMapsCDP(
  cdp: CDPSession,
  segment: string,
  location: string,
  limit: number,
  jobId: string
): Promise<any[]> {
  const searchQuery = `${segment} ${location}`;
  const now = new Date().toISOString();

  // 1. Abrir uma nova aba
  await cdp.send("Target.createTarget", { url: "about:blank" });

  // 2. Navegar para o Google Maps
  await cdp.send("Page.navigate", {
    url: `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`,
  });

  // 3. Aguardar carregar
  await new Promise((r) => setTimeout(r, 6000));

  // 4. Extrair dados dos resultados visíveis
  const extractScript = `
    (() => {
      const results = [];
      const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
      for (const link of links.slice(0, ${limit})) {
        const href = link.getAttribute('href') || '';
        const parent = link.closest('[role="feed"]') || link.parentElement;
        const containerText = parent ? parent.innerText : '';
        const lines = containerText.split('\\n').filter(l => l.trim());
        const name = lines[0] || link.textContent || 'Estabelecimento';
        let phone = '';
        let rating = '';
        let reviewCount = '';
        const phoneMatch = containerText.match(/(\\+?\\d[\\d\\s\\-]{7,}\\d)/);
        if (phoneMatch) phone = phoneMatch[1].trim();
        const ratingMatch = containerText.match(/(\\d[.,]\\d)/);
        if (ratingMatch) rating = ratingMatch[1];
        results.push({
          id: 'place_' + Date.now() + '_' + Math.random().toString(36).substring(2,7),
          job_id: '${jobId}',
          name: name,
          category: '${segment}',
          address: '${location}, Brasil',
          phone: phone,
          website: '',
          rating: rating,
          review_count: reviewCount,
          city: '${location.split(",")[0]}',
          state: 'SP',
          collected_at: '${now}',
          source_url: href,
          maps_url: href,
        });
      }
      return results;
    })()
  `;

  const extractResult = await cdp.send("Runtime.evaluate", {
    expression: extractScript,
    returnByValue: true,
  });

  const places: any[] = [];
  if (extractResult && typeof extractResult === "object" && "result" in extractResult) {
    const value = (extractResult as any).result?.value;
    if (Array.isArray(value)) {
      for (const p of value) {
        places.push({
          id: p.id || `place_${Date.now()}`,
          job_id: p.job_id || jobId,
          name: p.name || "Estabelecimento",
          category: p.category || segment,
          address: p.address || `${location}, Brasil`,
          phone: p.phone || "",
          website: p.website || "",
          rating: p.rating || "",
          review_count: p.review_count || "",
          city: p.city || location.split(",")[0],
          state: p.state || "SP",
          collected_at: p.collected_at || now,
          source_url: p.source_url || "",
          maps_url: p.maps_url || "",
        });
      }
    }
  }

  return places;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const method = request.method;
		const path = url.pathname;
		const isApiPath = url.pathname.startsWith("/v1/sessions") || url.pathname === "/health" || url.pathname === "/v1/scrape/start" || url.pathname === "/v1/scrape/extract";

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

		// Scraping etapa 1: criar sessão e navegar para o Google Maps
		if (method === "POST" && path === "/v1/scrape/start") {
		  let body: { segment?: string; location?: string; limit?: number; jobId?: string } = {};
		  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
		  if (!body.segment || !body.location) return json({ error: "Segmento e Localização são obrigatórios." }, 400);

		  const limit = Math.max(1, Math.min(50, Number.parseInt(String(body.limit ?? "10"), 10) || 10));
		  const jobId = body.jobId || `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

		  try {
		    // Chamar o Durable Object para executar o scraping completo
		    const doId = env.SESSION_PROXY.idFromName(jobId);
		    const doStub = env.SESSION_PROXY.get(doId);
		    const startResp = await doStub.fetch("https://scraper.internal/scrape/start", {
		      method: "POST",
		      headers: { "Content-Type": "application/json" },
		      body: JSON.stringify({
		        jobId,
		        segment: body.segment,
		        location: body.location,
		        limit,
		      }),
		    });

		    if (!startResp.ok) {
		      const errText = await startResp.text();
		      return json({ error: `Falha ao iniciar scraping: ${errText}` }, 502);
		    }

		    return json(await startResp.json());
	

		    // Scraping etapa 2: extrair dados do Google Maps
		    if (method === "POST" && path === "/v1/scrape/extract") {
		    	let body: { jobId?: string } = {};
		    	try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
		    	if (!body.jobId) return json({ error: "jobId é obrigatório." }, 400);

		    	try {
		    		const doId = env.SESSION_PROXY.idFromName(body.jobId);
		    		const doStub = env.SESSION_PROXY.get(doId);
		    		const extractResp = await doStub.fetch("https://scraper.internal/scrape/extract", {
		    			method: "POST",
		    			headers: { "Content-Type": "application/json" },
		    			body: JSON.stringify({ jobId: body.jobId }),
		    		});

		    		if (!extractResp.ok) {
		    			const errText = await extractResp.text();
		    			return json({ error: `Falha ao extrair dados: ${errText}` }, 502);
		    		}

		    		return json(await extractResp.json());
		    	} catch (error: any) {
		    		return json({ error: error instanceof Error ? error.message : String(error) }, 500);
		    	}
		    }

		    // Matchar rota /v1/sessions/:sessionId/connect ou /v1/sessions/:sessionId





		
		
		
		

		
		    const cdpResp = await doStub.fetch("https://scraper.internal/cdp", {
		      method: "POST",
		      headers: { "Content-Type": "application/json" },
		      body: JSON.stringify({ method: "Target.createTarget", params: { url: "about:blank" } }),
		    });

		    if (!cdpResp.ok) {
		      const errText = await cdpResp.text();
		      return json({ error: `Falha no CDP: ${errText}` }, 502);
		    }

		    // Navegar para o Google Maps
		    await doStub.fetch("https://scraper.internal/cdp", {
		      method: "POST",
		      headers: { "Content-Type": "application/json" },
		      body: JSON.stringify({ method: "Page.navigate", params: { url: `https://www.google.com/maps/search/${encodeURIComponent(body.segment + " " + body.location)}` } }),
		    });

		    // Aguardar carregar
		    await new Promise((r) => setTimeout(r, 6000));

		    // Extrair dados
		    const extractScript = `
		      (() => {
		        const results = [];
		        const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
		        for (const link of links.slice(0, ${limit})) {
		          const href = link.getAttribute('href') || '';
		          const parent = link.closest('[role="feed"]') || link.parentElement;
		          const containerText = parent ? parent.innerText : '';
		          const lines = containerText.split('\\n').filter(l => l.trim());
		          const name = lines[0] || link.textContent || 'Estabelecimento';
		          let phone = '';
		          let rating = '';
		          const phoneMatch = containerText.match(/(\\+?\\d[\\d\\s\\-]{7,}\\d)/);
		          if (phoneMatch) phone = phoneMatch[1].trim();
		          const ratingMatch = containerText.match(/(\\d[.,]\\d)/);
		          if (ratingMatch) rating = ratingMatch[1];
		          results.push({
		            id: 'place_' + Date.now() + '_' + Math.random().toString(36).substring(2,7),
		            job_id: '${jobId}',
		            name: name,
		            category: '${body.segment}',
		            address: '${body.location}, Brasil',
		            phone: phone,
		            website: '',
		            rating: rating,
		            review_count: '',
		            city: '${body.location.split(",")[0]}',
		            state: 'SP',
		            collected_at: '${now}',
		            source_url: href,
		            maps_url: href,
		          });
		        }
		        return results;
		      })()
		    `;

		    const extractResp = await doStub.fetch("https://scraper.internal/cdp", {
		      method: "POST",
		      headers: { "Content-Type": "application/json" },
		      body: JSON.stringify({ method: "Runtime.evaluate", params: { expression: extractScript, returnByValue: true } }),
		    });

		    if (!extractResp.ok) {
		      const errText = await extractResp.text();
		      return json({ error: `Falha na extração: ${errText}` }, 502);
		    }

		    const extractResult = await extractResp.json();
		    const places: any[] = [];
		    if (extractResult && extractResult.result && extractResult.result.value && Array.isArray(extractResult.result.value)) {
		      for (const p of extractResult.result.value) {
		        places.push({
		          id: p.id || `place_${Date.now()}`,
		          job_id: p.job_id || jobId,
		          name: p.name || "Estabelecimento",
		          category: p.category || body.segment,
		          address: p.address || `${body.location}, Brasil`,
		          phone: p.phone || "",
		          website: p.website || "",
		          rating: p.rating || "",
		          review_count: p.review_count || "",
		          city: p.city || body.location.split(",")[0],
		          state: p.state || "SP",
		          collected_at: p.collected_at || now,
		          source_url: p.source_url || "",
		          maps_url: p.maps_url || "",
		        });
		      }
		    }

		    // Fechar sessão do navegador
		    try {
		      await cloudflareRequest(env, `/devtools/browser/${session.sessionId}`, { method: "DELETE" });
		    } catch {}

		    return json({
		      jobId,
		      segment: body.segment,
		      location: body.location,
		      total_collected: places.length,
		      places,
		    });
		  } catch (error: any) {
		    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
		  }
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
  private wsRemote: WebSocket | null = null;
  private cdp: CDPSession | null = null;
  private segment = "";
  private location = "";
  private limit = 10;
  private jobId = "";
  private sessionId = "";

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Endpoint etapa 1: criar sessão e navegar para o Google Maps
   if (request.method === "POST" && url.pathname === "/scrape/start") {
     let body: { jobId?: string; segment?: string; location?: string; limit?: number } = {};
     try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
     if (!body.jobId || !body.segment || !body.location) {
       return json({ error: "jobId, segment e location são obrigatórios." }, 400);
     }

     try {
       const keepAliveMs = this.env.MAX_SESSION_TTL_MS || 600000;
       const sessionResp = await cloudflareRequest(this.env, `/devtools/browser?keep_alive=${keepAliveMs}`, { method: "POST" });
       if (!sessionResp.ok) {
         return json({ error: "Falha ao criar sessão de navegador." }, 502);
       }
       const session = await sessionResp.json() as { sessionId?: string };
       if (!session.sessionId) {
         return json({ error: "Sessão inválida." }, 502);
       }

       const upstreamUrl = cloudflareUrl(this.env, `/devtools/browser/${session.sessionId}`).replace(/^https:/, "https:");
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

       this.wsRemote = remote;
       this.cdp = new CDPSession(remote);

       const relay = (source: WebSocket, destination: WebSocket) => {
         source.addEventListener("message", (event) => {
           if (destination.readyState === WebSocket.OPEN) destination.send(event.data);
         });
         source.addEventListener("close", (event) => {
           try { destination.close(event.code, event.reason); } catch { /* ok */ }
         });
         source.addEventListener("error", () => {
           try { destination.close(1011, "WebSocket relay error"); } catch { /* ok */ }
         });
       };
       relay(server, remote);
       relay(remote, server);

       await this.cdp.send("Target.createTarget", { url: "about:blank" });
       await this.cdp.send("Page.navigate", {
         url: `https://www.google.com/maps/search/${encodeURIComponent(`${body.segment} ${body.location}`)}`,
       });
       await new Promise((r) => setTimeout(r, 8000));

       this.segment = body.segment;
       this.location = body.location;
       this.limit = body.limit ?? 10;
       this.jobId = body.jobId;
       this.sessionId = session.sessionId;

       return json({
         jobId: body.jobId,
         segment: body.segment,
         location: body.location,
         limit: body.limit,
         status: "browser_ready",
       });
     } catch (err: any) {
       return json({ error: err instanceof Error ? err.message : String(err) }, 500);
     }
   }

   // Endpoint etapa 2: extrair dados do Google Maps
   if (request.method === "POST" && url.pathname === "/scrape/extract") {
     let body: { jobId?: string } = {};
     try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
     if (!body.jobId) {
       return json({ error: "jobId é obrigatório." }, 400);
     }

     if (!this.cdp) {
       return json({ error: "Navegador não conectado. Chame /scrape/start primeiro." }, 400);
     }

     try {
       const places = await scrapeGoogleMapsCDP(this.cdp, this.segment, this.location, this.limit, this.jobId);

       try {
         await cloudflareRequest(this.env, `/devtools/browser/${this.sessionId}`, { method: "DELETE" });
       } catch {}

       return json({
         jobId: this.jobId,
         segment: this.segment,
         location: this.location,
         total_collected: places.length,
         places,
       });
     } catch (err: any) {
       return json({ error: err instanceof Error ? err.message : String(err) }, 500);
     }
   }

   // Endpoint HTTP para enviar comandos CDP através da WebSocket do navegador
    if (request.method === "POST" && url.pathname === "/cdp") {
      if (!this.cdp) {
        return json({ error: "CDP session não inicializada. Conecte o WebSocket primeiro." }, 503);
      }
      let body: { method: string; params?: Record<string, unknown> } = {};
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
      if (!body.method) return json({ error: "method é obrigatório." }, 400);

      try {
        const result = await this.cdp.send(body.method, body.params);
        return json({ result });
      } catch (err: any) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // Conectar WebSocket ao navegador Cloudflare
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

    // Manter referência ao WebSocket remoto (navegador Cloudflare)
    this.wsRemote = remote;
    this.cdp = new CDPSession(remote);

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