import { DurableObject } from "cloudflare:workers";
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Tipos
// ============================================================================

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  BROWSER_WS_ENDPOINT?: string;
  BROWSER_SERVICE_URL?: string;
  MAPSCRAPE_API_KEY?: string;
  SESSION_PROXY: DurableObjectNamespace;
}

interface ScrapeJob {
  id: string;
  user_id: string;
  segment: string;
  location: string;
  limit_requested: number;
  status: string;
  status_message: string;
  completion_reason?: string;
  total_found: number;
  total_collected: number;
  total_duplicates: number;
  total_errors: number;
  current_step?: string;
  heartbeat_at?: string;
  created_at: string;
  completed_at?: string;
  project_id?: string;
  category_id?: string;
  source?: 'remote' | 'browser_extension';
}

interface PlaceRecord {
  id: string;
  job_id: string;
  name: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  rating: string;
  review_count: string;
  city?: string;
  state?: string;
  collected_at: string;
  [key: string]: unknown;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  created_at: string;
}

// ============================================================================
// Supabase (singleton por request do worker principal)
// ============================================================================

let supabase: SupabaseClient | null = null;

function getDb(env: Env): SupabaseClient {
  if (!supabase) {
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  }
  return supabase;
}

// ============================================================================
// Utilitários
// ============================================================================

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

function error(message: string, status = 500, code?: string): Response {
  return json({ error: message, ...(code ? { code } : {}) }, status);
}

async function readBody(req: Request): Promise<unknown> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return req.json();
  if (ct.includes('text/plain')) return req.text();
  return req.formData();
}

function requireAuth(req: Request, env: Env): { user: UserProfile } | Response {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return error('Autenticação necessária.', 401);

  const userId = token.startsWith('sess_') ? token.slice(5) : null;
  if (!userId) return error('Token inválido.', 401);

  return { user: { id: userId, email: '', name: '', role: 'user', created_at: '' } };
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================================
// CDP Session: conexão WebSocket ao navegador remoto via CDP
// ============================================================================

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
      } catch { /* ignore non-JSON frames */ }
    });
    ws.addEventListener("close", () => {
      for (const [, { reject }] of this.pending) reject(new Error("WebSocket closed"));
      this.pending.clear();
    });
    ws.addEventListener("error", () => {
      for (const [, { reject }] of this.pending) reject(new Error("WebSocket error"));
      this.pending.clear();
    });
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

// ============================================================================
// Durable Object: ScraperSession
// Executa o loop de scraping real mantendo sessão do navegador aberta
// ============================================================================

export class ScraperSession extends DurableObject {
  private env: Env;
  private ctx: DurableObjectState;
  private supabase: SupabaseClient;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/start' && request.method === 'POST') {
      return this.handleStart(request);
    }
    if (path === '/stop' && request.method === 'POST') {
      return this.handleStop();
    }
    if (path === '/status' && request.method === 'GET') {
      return this.handleStatus();
    }
    return new Response('Not found', { status: 404 });
  }

  private async handleStart(request: Request): Promise<Response> {
    const body = await request.json() as {
      jobId: string;
      userId: string;
      segment: string;
      location: string;
      limit: number;
      browserWsEndpoint?: string;
    };

    const browserWsEndpoint = body.browserWsEndpoint || this.env.BROWSER_WS_ENDPOINT || '';

    await this.updateJob(body.jobId, 'running', 'Conectando ao navegador...', 0, 0, 0);

    try {
      if (!browserWsEndpoint) {
        await this.updateJob(body.jobId, 'failed', 'Navegador remoto não configurado.', 0, 0, 0);
        return json({ error: 'BROWSER_WS_ENDPOINT não configurado.' }, 500);
      }

      await this.updateJob(body.jobId, 'running', 'Navegador conectado. Coletando resultados...', 0, 0, 0);

      // Executar loop de scraping real via CDP
      await this.runScrapingLoop(body.jobId, body.segment, body.location, body.limit, browserWsEndpoint);

      return json({ jobId: body.jobId, status: 'running', message: 'Scraping iniciado.' });
    } catch (err: any) {
      await this.updateJob(body.jobId, 'failed', err.message || 'Erro desconhecido.', 0, 0, 0);
      return json({ error: err.message }, 500);
    }
  }

  private async handleStop(): Promise<Response> {
    await this.ctx.storage.put('stopRequested', true);
    return json({ success: true });
  }

  private async handleStatus(): Promise<Response> {
    const stopRequested = await this.ctx.storage.get('stopRequested');
    return json({ stopRequested });
  }

  private async runScrapingLoop(
    jobId: string,
    segment: string,
    location: string,
    limit: number,
    browserWsEndpoint: string = ''
  ): Promise<void> {
    console.info(`[Scraper DO] Job ${jobId}: ${segment} em ${location}, limite ${limit}`);

    const wsEndpoint = browserWsEndpoint || this.env.BROWSER_WS_ENDPOINT;
    if (!wsEndpoint) {
      await this.updateJob(jobId, 'failed', 'BROWSER_WS_ENDPOINT não configurado.', 0, 0, 0);
      return;
    }

    // Converter https:// para wss:// para o WebSocket CDP
    const cdpWsBaseUrl = wsEndpoint.replace(/^https:/, 'wss:').replace(/\/$/, '');
    console.info(`[Scraper DO] Conectando ao CDP: ${cdpWsBaseUrl}`);

    // 1. Obter o webSocketDebuggerUrl do Chrome via HTTP (através do túnel)
    let webSocketDebuggerUrl: string;
    try {
      const versionResp = await fetch(`${wsEndpoint.replace(/^wss:/, 'https:')}/json/version`);
      if (!versionResp.ok) {
        throw new Error(`Falha ao obter versão do Chrome: HTTP ${versionResp.status}`);
      }
      const versionData = await versionResp.json() as { webSocketDebuggerUrl?: string };
      if (!versionData.webSocketDebuggerUrl) {
        throw new Error('Chrome não retornou webSocketDebuggerUrl.');
      }
      webSocketDebuggerUrl = versionData.webSocketDebuggerUrl;
      console.info(`[Scraper DO] WebSocket debugger URL: ${webSocketDebuggerUrl}`);
    } catch (err: any) {
      await this.updateJob(jobId, 'failed', `Não foi obter WebSocket debugger URL: ${err.message}`, 0, 0, 0);
      return;
    }

    // 2. Converter para wss:// se necessário e conectar
    const cdpWsUrl = webSocketDebuggerUrl.replace(/^ws:/, 'wss:');
    let ws: WebSocket;
    try {
      ws = new WebSocket(cdpWsUrl);
    } catch (err: any) {
      await this.updateJob(jobId, 'failed', `Não foi possível criar WebSocket: ${err.message}`, 0, 0, 0);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', (err) => reject(err));
      ws.addEventListener('close', () => reject(new Error('WebSocket fechado antes de abrir')));
    });

    const cdp = new CDPSession(ws);

    try {
      // 1. Criar nova aba/target
      await cdp.send('Target.createTarget', { url: 'about:blank' });
      await new Promise((r) => setTimeout(r, 1000));

      // 2. Navegar para o Google Maps
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${segment} ${location}`)}`;
      await cdp.send('Page.navigate', { url: searchUrl });
      await new Promise((r) => setTimeout(r, 8000));

      const collected: PlaceRecord[] = [];
      const seenUrls = new Set<string>();
      const now = new Date().toISOString();

      // Loop de extração com rolagem
      for (let round = 0; round < Math.ceil(limit / 10); round++) {
        const stopRequested = await this.ctx.storage.get('stopRequested');
        if (stopRequested) {
          await this.updateJob(jobId, 'stopped', 'Coleta interrompida pelo usuário.', collected.length, 0, 0);
          return;
        }

        // Extrair links de resultados visíveis
        const extractScript = `
          (() => {
            const results = [];
            const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
            for (const link of links) {
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
                name,
                category: '${segment}',
                address: '${location}, Brasil',
                phone,
                website: '',
                rating,
                review_count: '',
                city: '${location.split(',')[0]}',
                state: 'SP',
                source_url: href,
                maps_url: href,
              });
            }
            return results;
          })()
        `;

        const extractResult = await cdp.send('Runtime.evaluate', {
          expression: extractScript,
          returnByValue: true,
        });

        const placesFromPage: any[] = [];
        if (extractResult && typeof extractResult === 'object' && 'result' in extractResult) {
          const value = (extractResult as any).result?.value;
          if (Array.isArray(value)) {
            for (const p of value) {
              if (seenUrls.has(p.maps_url || p.source_url)) continue;
              seenUrls.add(p.maps_url || p.source_url);
              placesFromPage.push(p);
              if (placesFromPage.length >= limit - collected.length) break;
            }
          }
        }

        // Salvar lugares desta página
        for (const p of placesFromPage) {
          const place: PlaceRecord = {
            id: `place_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            job_id: jobId,
            name: p.name || 'Estabelecimento',
            category: p.category || segment,
            address: p.address || `${location}, Brasil`,
            phone: p.phone || '',
            website: p.website || '',
            rating: p.rating || '',
            review_count: p.review_count || '',
            city: p.city || location.split(',')[0],
            state: p.state || 'SP',
            collected_at: now,
            source_url: p.source_url || '',
            maps_url: p.maps_url || '',
          };
          await this.savePlace(place);
          collected.push(place);

          await this.updateJob(
            jobId,
            'running',
            `Extraindo ${collected.length} de ${limit}...`,
            collected.length,
            0,
            0
          );

          if (collected.length >= limit) break;
        }

        if (collected.length >= limit) break;

        // Rolar para carregar mais resultados
        try {
          await cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: 500,
            y: 500,
            deltaX: 0,
            deltaY: 1000,
          });
        } catch {}
        await new Promise((r) => setTimeout(r, 4000));
      }

      await this.updateJob(
        jobId,
        'completed',
        `Coleta concluída: ${collected.length} estabelecimento(s).`,
        collected.length,
        0,
        0
      );
    } catch (err: any) {
      console.error(`[Scraper DO] Erro no job ${jobId}:`, err);
      await this.updateJob(jobId, 'failed', err.message || 'Erro desconhecido.', 0, 0, 0);
    } finally {
      try { ws.close(); } catch {}
    }
  }

  private async updateJob(
    jobId: string,
    status: string,
    statusMessage: string,
    collected: number,
    duplicates: number,
    errors: number
  ): Promise<void> {
    try {
      await this.supabase
        .from('scrape_jobs')
        .update({
          status,
          status_message: statusMessage,
          total_collected: collected,
          total_duplicates: duplicates,
          total_errors: errors,
          heartbeat_at: new Date().toISOString(),
          ...(status !== 'running' ? { completed_at: new Date().toISOString() } : {}),
        })
        .eq('id', jobId);
    } catch (err) {
      console.error('[Scraper DO] Falha ao atualizar job:', err);
    }
  }

  private async savePlace(place: PlaceRecord): Promise<void> {
    try {
      await this.supabase.from('places').insert({
        id: place.id,
        job_id: place.job_id,
        name: place.name,
        category: place.category,
        address: place.address,
        phone: place.phone,
        website: place.website,
        rating: place.rating,
        review_count: place.review_count,
        city: place.city,
        state: place.state,
        collected_at: place.collected_at,
      });
    } catch (err) {
      console.error('[Scraper DO] Falha ao salvar place:', err);
    }
  }
}

// ============================================================================
// Worker entry point
// ============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Health (público)
    if (path === '/api/v1/health' && method === 'GET') {
      try {
        const db = getDb(env);
        const { error } = await db.from('app_state').select('id').eq('id', 'main').maybeSingle();
        if (error) return error('Database indisponível', 503);
        return json({ status: 'ok', service: 'maisclientes-api', database: 'connected' });
      } catch (err: any) {
        return error(err.message, 503);
      }
    }

    // Auth login (público)
    if (path === '/api/auth/login' && method === 'POST') {
      try {
        const body = (await readBody(request)) as { email?: string; password?: string };
        if (!body.email || !body.password) return error('Informe e-mail e senha.', 400);

        const db = getDb(env);
        const { data, error: dbError } = await db
          .from('app_users')
          .select('*')
          .eq('email', String(body.email).trim().toLowerCase())
          .single();

        if (dbError || !data) return error('Conta não encontrada.', 401);

        const storedHash = String(data.password_hash || '');
        const inputHash = await sha256(String(body.password) + '_mapscrape_salt');
        if (!storedHash || storedHash !== inputHash) return error('Senha incorreta.', 401);

        const token = `sess_${data.id}`;
        return json({
          token,
          user: {
            id: data.id,
            email: data.email,
            name: data.name || data.email,
            role: data.role,
            created_at: data.created_at,
          },
        });
      } catch (err: any) {
        return error(err.message, 500);
      }
    }

    // Auth me
    if (path === '/api/auth/me' && method === 'GET') {
      const auth = requireAuth(request, env);
      if (auth instanceof Response) return auth;
      try {
        const db = getDb(env);
        const { data, error: dbError } = await db
          .from('app_users')
          .select('*')
          .eq('id', auth.user.id)
          .single();
        if (dbError || !data) return error('Usuário não encontrado.', 404);
        return json({
          user: {
            id: data.id,
            email: data.email,
            name: data.name || data.email,
            role: data.role,
            created_at: data.created_at,
          },
        });
      } catch (err: any) {
        return error(err.message, 500);
      }
    }

    // Jobs list
    if (path === '/api/v1/jobs' && method === 'GET') {
      const auth = requireAuth(request, env);
      if (auth instanceof Response) return auth;
      try {
        const db = getDb(env);
        const { data, error: dbError } = await db
          .from('scrape_jobs')
          .select('*')
          .eq('user_id', auth.user.id)
          .order('created_at', { ascending: false });
        if (dbError) return error(dbError.message, 500);
        return json({ data: data || [], total: (data || []).length });
      } catch (err: any) {
        return error(err.message, 500);
      }
    }

    // Create job - usa a origem solicitada (navegador do usuário ou engine remoto).
    if (path === '/api/v1/jobs' && method === 'POST') {
      const auth = requireAuth(request, env);
      if (auth instanceof Response) return auth;
      try {
        const body = (await readBody(request)) as { segment?: string; location?: string; limit?: number; projectName?: string; categoryName?: string; source?: 'remote' | 'browser_extension' };
        if (!body.segment || !body.location) return error('Segmento e Localização são obrigatórios.', 400);

        const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const numLimit = Math.max(1, Math.min(100, Number.parseInt(String(body.limit ?? '20'), 10) || 20));
        const now = new Date().toISOString();

        const job: ScrapeJob = {
          id: jobId,
          user_id: auth.user.id,
          segment: body.segment,
          location: body.location,
          limit_requested: numLimit,
          status: 'running',
          status_message: 'Iniciando sessão do navegador...',
          total_found: 0,
          total_collected: 0,
          total_duplicates: 0,
          total_errors: 0,
          current_step: 'Conectando ao navegador...',
          heartbeat_at: now,
          created_at: now,
          project_id: undefined,
          category_id: undefined,
          source: body.source || 'remote',
        };

        const db = getDb(env);
        const { error: dbError } = await db.from('scrape_jobs').insert({
          id: job.id,
          user_id: job.user_id,
          segment: job.segment,
          location: job.location,
          limit_requested: job.limit_requested,
          status: job.status,
          status_message: job.status_message,
          total_found: job.total_found,
          total_collected: job.total_collected,
          total_duplicates: job.total_duplicates,
          total_errors: job.total_errors,
          current_step: job.current_step,
          heartbeat_at: job.heartbeat_at,
          created_at: job.created_at,
          source: job.source,
        });
        if (dbError) return error(dbError.message, 500);

        // Coletas executadas no navegador do usuário não iniciam sessão remota.
        // O navegador envia os resultados via POST /api/v1/scrape/collect.
        if (job.source === 'browser_extension') {
          await db.from('scrape_jobs').update({
            status: 'running',
            status_message: 'Aguardando coleta no navegador do usuário...',
            current_step: 'Pronto para receber resultados do navegador.', 
          }).eq('id', job.id);
          return json({
            jobId: job.id,
            id: job.id,
            status: 'running',
            message: 'Job criado. Inicie a coleta no navegador do usuário.',
          }, 201);
        }

        // Executar scraping real via Durable Object ScraperSession (CDP direto)
        try {
          const browserWsEndpoint = env.BROWSER_WS_ENDPOINT || '';
          const doId = env.SESSION_PROXY.idFromName(job.id);
          const doStub = env.SESSION_PROXY.get(doId);
          const startResp = await doStub.fetch('https://scraper.internal/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId: job.id,
              userId: job.user_id,
              segment: body.segment,
              location: body.location,
              limit: numLimit,
            }),
          });

          if (!startResp.ok) {
            const errText = await startResp.text();
            await db.from('scrape_jobs').update({
              status: 'failed',
              status_message: `Falha ao iniciar scraping: ${errText.slice(0,200)}`,
              completed_at: new Date().toISOString(),
            }).eq('id', job.id);
            return error(`Falha ao iniciar scraping: ${errText.slice(0,200)}`, 502);
          }

          const startResult = await startResp.json();

          // Aguardar o scraping completar (polling de status)
          let completed = false;
          for (let poll = 0; poll < 60; poll++) {
            await new Promise((r) => setTimeout(r, 5000));
            const statusResp = await doStub.fetch('https://scraper.internal/status', {
              method: 'GET',
            });
            if (statusResp.ok) {
              const statusData = await statusResp.json();
              if (statusData.stopRequested) {
                await db.from('scrape_jobs').update({
                  status: 'stopped',
                  status_message: 'Coleta interrompida.',
                  completed_at: new Date().toISOString(),
                }).eq('id', job.id);
                return json({ jobId: job.id, id: job.id, status: 'stopped', message: 'Coleta interrompida pelo usuário.' }, 200);
              }
            }

            // Verificar status no banco
            const { data: jobStatus } = await db.from('scrape_jobs').select('status,total_collected,status_message').eq('id', job.id).single();
            if (jobStatus && (jobStatus.status === 'completed' || jobStatus.status === 'failed' || jobStatus.status === 'stopped')) {
              completed = true;
              break;
            }
          }

          // Buscar lugares coletados
          const { data: places } = await db.from('places').select('*').eq('job_id', job.id).order('collected_at', { ascending: false });

          return json({
            jobId: job.id,
            id: job.id,
            status: 'completed',
            message: `Coleta concluída: ${places?.length || 0} estabelecimento(s).`,
            places: places || [],
          }, 201);
        } catch (err: any) {
          await db.from('scrape_jobs').update({
            status: 'failed',
            status_message: err instanceof Error ? err.message : 'Erro desconhecido.',
            completed_at: new Date().toISOString(),
          }).eq('id', job.id);
          return error(err instanceof Error ? err.message : String(err), 500);
        }


    } catch (err: any) {
      await db.from('scrape_jobs').update({
        status: 'failed',
        status_message: err instanceof Error ? err.message : 'Erro desconhecido.',
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);
      return error(err instanceof Error ? err.message : String(err), 500);
    }

    // Update job status (usado pela extensão do navegador para reportar progresso)
    const jobPatchMatch = path.match(/^\/api\/v1\/jobs\/([^/]+)$/);
    if (jobPatchMatch && method === 'PATCH') {
      const auth = requireAuth(request, env);
      if (auth instanceof Response) return auth;
      try {
        const body = (await readBody(request)) as { status?: string; status_message?: string; total_collected?: number; total_duplicates?: number; total_errors?: number; };
        const jobId = jobPatchMatch[1];
        const db = getDb(env);
        const updateData: Record<string, unknown> = {};
        if (body.status !== undefined) updateData.status = body.status;
        if (body.status_message !== undefined) updateData.status_message = body.status_message;
        if (body.total_collected !== undefined) updateData.total_collected = body.total_collected;
        if (body.total_duplicates !== undefined) updateData.total_duplicates = body.total_duplicates;
        if (body.total_errors !== undefined) updateData.total_errors = body.total_errors;
        updateData.heartbeat_at = new Date().toISOString();
        if (body.status && body.status !== 'running') {
          updateData.completed_at = new Date().toISOString();
        }
        const { error: dbError } = await db.from('scrape_jobs').update(updateData).eq('id', jobId).eq('user_id', auth.user.id);
        if (dbError) return error(dbError.message, 500);
        return json({ success: true, jobId });
      } catch (err: any) {
        return error(err instanceof Error ? err.message : String(err), 500);
      }
    }

    // Stop job
    const stopMatch = path.match(/^\/api\/v1\/jobs\/([^/]+)\/stop$/);
    if (stopMatch && method === 'POST') {
      const auth = requireAuth(request, env);
      if (auth instanceof Response) return auth;
      try {
        const db = getDb(env);
        const { data: job, error: jobError } = await db
          .from('scrape_jobs')
          .select('id,source')
          .eq('id', stopMatch[1])
          .eq('user_id', auth.user.id)
          .maybeSingle();
        if (jobError) return error(jobError.message, 500);
        if (!job) return error('Coleta não encontrada.', 404);

        if (job.source === 'browser_extension') {
          const stoppedAt = new Date().toISOString();
          const { error: updateError } = await db.from('scrape_jobs').update({
            status: 'stopped',
            status_message: 'Coleta interrompida pelo usuário.',
            current_step: 'Interrompida',
            heartbeat_at: stoppedAt,
            completed_at: stoppedAt,
          }).eq('id', job.id).eq('user_id', auth.user.id);
          if (updateError) return error(updateError.message, 500);
          return json({ success: true });
        }

        const id = env.SESSION_PROXY.idFromName(stopMatch[1]);
        const stub = env.SESSION_PROXY.get(id);
        await stub.fetch('https://scraper.internal/stop', { method: 'POST' });
        return json({ success: true });
      } catch (err: any) {
        return error(err.message, 500);
      }
    }

    // Job detail
    const jobDetailMatch = path.match(/^\/api\/v1\/jobs\/([^/]+)$/);
    if (jobDetailMatch && method === 'GET') {
      const auth = requireAuth(request, env);
      if (auth instanceof Response) return auth;
      try {
        const db = getDb(env);
        const { data, error: dbError } = await db
          .from('scrape_jobs')
          .select('*')
          .eq('id', jobDetailMatch[1])
          .eq('user_id', auth.user.id)
          .single();
        if (dbError || !data) return error('Job não encontrado.', 404);
        return json({ data });
      } catch (err: any) {
        return error(err.message, 500);
      }
    }

    // Leads list
    if (path === '/api/v1/leads' && method === 'GET') {
      const auth = requireAuth(request, env);
      if (auth instanceof Response) return auth;
      try {
        const db = getDb(env);
        let query = db.from('places').select('*').order('collected_at', { ascending: false });
        const jobId = url.searchParams.get('job_id');
        if (jobId) query = query.eq('job_id', jobId);
        const { data, error: dbError } = await query.limit(100);
        if (dbError) return error(dbError.message, 500);
        return json({ data: data || [], total: (data || []).length });
      } catch (err: any) {
        return error(err.message, 500);
      }
    }

    // Categories
    if (path === '/api/v1/categories' && method === 'GET') {
      const auth = requireAuth(request, env);
      if (auth instanceof Response) return auth;
      try {
        const db = getDb(env);
        const { data, error: dbError } = await db
          .from('categories')
          .select('*')
          .order('name', { ascending: true });
        if (dbError) return error(dbError.message, 500);
        return json({ data: data || [], total: (data || []).length });
      } catch (err: any) {
        return error(err.message, 500);
      }
    }

    // Projects
    if (path === '/api/v1/projects' && method === 'GET') {
      const auth = requireAuth(request, env);
      if (auth instanceof Response) return auth;
      try {
        const db = getDb(env);
        const { data, error: dbError } = await db
          .from('projects')
          .select('*')
          .order('name', { ascending: true });
        if (dbError) return error(dbError.message, 500);
        return json({ data: data || [], total: (data || []).length });
      } catch (err: any) {
        return error(err.message, 500);
      }
    }

    // Scraper settings
    if (path === '/api/v1/scraper/settings' && method === 'GET') {
      return json({
        engine: env.BROWSER_WS_ENDPOINT ? 'cloudflare_remote' : 'local_puppeteer',
        browserWsEndpoint: env.BROWSER_WS_ENDPOINT || '',
        hasRemoteEndpoint: Boolean(env.BROWSER_WS_ENDPOINT),
        status: env.BROWSER_WS_ENDPOINT ? 'ready' : 'error',
        description: env.BROWSER_WS_ENDPOINT
          ? 'Navegador remoto configurado (Cloudflare Browser Rendering).'
          : 'Nenhum navegador remoto configurado.',
      });
    }

    // Coleta client-side: recebe lugares coletados pelo navegador do usuário
    if (path === '/api/v1/scrape/collect' && method === 'POST') {
      const auth = requireAuth(request, env);
      if (auth instanceof Response) return auth;
      try {
        const body = (await readBody(request)) as {
          jobId?: string;
          segment?: string;
          location?: string;
          places?: Array<{
            id?: string;
            name: string;
            category?: string;
            address?: string;
            phone?: string;
            website?: string;
            rating?: string;
            review_count?: string;
            city?: string;
            state?: string;
            source_url?: string;
            maps_url?: string;
          }>;
        };
        if (!body.jobId) return error('jobId é obrigatório.', 400);
        if (!body.places || !Array.isArray(body.places) || body.places.length === 0) {
          return error('Nenhum lugar para coletar.', 400);
        }

        const db = getDb(env);
        const { data: job, error: jobError } = await db
          .from('scrape_jobs')
          .select('id,status,source')
          .eq('id', body.jobId)
          .eq('user_id', auth.user.id)
          .maybeSingle();
        if (jobError) return error(jobError.message, 500);
        if (!job) return error('Coleta não encontrada para este usuário.', 404);
        if (job.status !== 'running') return error('Esta coleta não está mais ativa.', 409);

        const now = new Date().toISOString();
        const saved: any[] = [];

        for (const place of body.places) {
          const placeId = place.id || `place_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const { error: insertError } = await db.from('places').insert({
            id: placeId,
            job_id: body.jobId,
            user_id: auth.user.id,
            segment: body.segment || '',
            name: place.name || 'Estabelecimento',
            category: place.category || body.segment || '',
            address: place.address || '',
            phone: place.phone || '',
            website: place.website || '',
            rating: place.rating || '',
            review_count: place.review_count || '',
            city: place.city || '',
            state: place.state || '',
            collected_at: now,
            source_url: place.source_url || '',
            maps_url: place.maps_url || '',
          });
          if (insertError) continue;
          saved.push({ id: placeId, ...place });
        }

        // Atualizar job com total coletado
        await db.from('scrape_jobs').update({
          total_found: saved.length,
          total_collected: saved.length,
          status: 'completed',
          status_message: `Coleta no navegador concluída: ${saved.length} estabelecimento(s) salvo(s).`,
          current_step: 'Concluído',
          heartbeat_at: now,
          completed_at: now,
        }).eq('id', body.jobId).eq('user_id', auth.user.id);

        return json({
          jobId: body.jobId,
          collected: saved.length,
          places: saved,
        }, 201);
      } catch (err: any) {
        return error(err instanceof Error ? err.message : 'Erro ao coletar lugares.', 500);
      }
    }

    return json({ error: 'Rota não encontrada.' }, 404);
  }
}}
