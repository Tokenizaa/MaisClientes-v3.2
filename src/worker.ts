import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Tipos
// ============================================================================

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  BROWSER_WS_ENDPOINT?: string;
  MAPSCRAPE_API_KEY?: string;
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
// Supabase (singleton por request)
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

  // Token simples do tipo sess_<userId> (compatível com o server.ts anterior)
  const userId = token.startsWith('sess_') ? token.slice(5) : null;
  if (!userId) return error('Token inválido.', 401);

  return { user: { id: userId, email: '', name: '', role: 'user', created_at: '' } };
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
          .schema('mapscrape')
          .from('users')
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
            name: data.display_name || data.email,
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
          .schema('mapscrape')
          .from('users')
          .select('*')
          .eq('id', auth.user.id)
          .single();
        if (dbError || !data) return error('Usuário não encontrado.', 404);
        return json({
          user: {
            id: data.id,
            email: data.email,
            name: data.display_name || data.email,
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
          .schema('mapscrape')
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

    // Create job
    if (path === '/api/v1/jobs' && method === 'POST') {
      const auth = requireAuth(request, env);
      if (auth instanceof Response) return auth;
      try {
        const body = (await readBody(request)) as { segment?: string; location?: string; limit?: number; projectName?: string; categoryName?: string };
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
          status_message: 'Coleta iniciada.',
          total_found: 0,
          total_collected: 0,
          total_duplicates: 0,
          total_errors: 0,
          current_step: 'Conectando ao navegador...',
          heartbeat_at: now,
          created_at: now,
          project_id: body.projectName ? undefined : undefined,
          category_id: undefined,
        };

        const db = getDb(env);
        const { error: dbError } = await db.schema('mapscrape').from('scrape_jobs').insert({
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
        });
        if (dbError) return error(dbError.message, 500);

        // Lançar execução do scraper em background (não bloqueia a resposta)
        ctx.waitUntil(runScrapeJob(job, env));

        return json({ id: job.id, status: job.status, message: job.status_message }, 201);
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
          .schema('mapscrape')
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
        let query = db.schema('mapscrape').from('places').select('*').order('collected_at', { ascending: false });
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
          .schema('mapscrape')
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
          .schema('mapscrape')
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

    return json({ error: 'Rota não encontrada.' }, 404);
  },
};

// ============================================================================
// Crypto (Web Crypto API, substitui crypto do Node)
// ============================================================================

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex;
}

// ============================================================================
// Scraper (execução em background via Durable Object / Browser Rendering)
// ============================================================================

async function runScrapeJob(job: ScrapeJob, env: Env): Promise<void> {
  console.info(`[Scraper] Iniciando job ${job.id} para ${job.segment} em ${job.location}`);
  try {
    // Atualizar status para conectando
    await updateJobStatus(env, job.id, 'running', 'Conectando ao navegador...', job.total_collected, job.total_duplicates, job.total_errors);

    const endpoint = env.BROWSER_WS_ENDPOINT;
    if (!endpoint) {
      await updateJobStatus(env, job.id, 'failed', 'Navegador remoto não configurado. Defina BROWSER_WS_ENDPOINT.', job.total_collected, job.total_duplicates, job.total_errors);
      return;
    }

    // Criar sessão no nettos-browser-service
    const sessionUrl = new URL('/v1/sessions', endpoint.replace(/\/$/, '')).toString();
    const sessionResp = await fetch(sessionUrl, { method: 'POST' });
    if (!sessionResp.ok) {
      await updateJobStatus(env, job.id, 'failed', 'Falha ao criar sessão de navegador.', job.total_collected, job.total_duplicates, job.total_errors);
      return;
    }
    const session = await sessionResp.json();
    if (!session.sessionId) {
      await updateJobStatus(env, job.id, 'failed', 'Sessão de navegador inválida.', job.total_collected, job.total_duplicates, job.total_errors);
      return;
    }

    await updateJobStatus(env, job.id, 'running', 'Navegador conectado. Iniciando coleta...', job.total_collected, job.total_duplicates, job.total_errors);

    // TODO: Implementar loop de scraping real usando a sessão do navegador
    // Isto requer Durable Objects para manter a conexão WebSocket aberta durante
    // a execução do job, que pode exceder o timeout de uma única invocation do Worker.

    await updateJobStatus(env, job.id, 'completed', 'Coleta concluída (placeholder - execução real pendente de Durable Object).', job.total_collected, job.total_duplicates, job.total_errors);
  } catch (err: any) {
    console.error(`[Scraper] Erro no job ${job.id}:`, err);
    await updateJobStatus(env, job.id, 'failed', err.message || 'Erro desconhecido.', job.total_collected, job.total_duplicates, job.total_errors);
  }
}

async function updateJobStatus(
  env: Env,
  jobId: string,
  status: string,
  statusMessage: string,
  collected: number,
  duplicates: number,
  errors: number,
): Promise<void> {
  try {
    const db = getDb(env);
    await db
      .schema('mapscrape')
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
    console.error('[Scraper] Falha ao atualizar status do job:', err);
  }
}
