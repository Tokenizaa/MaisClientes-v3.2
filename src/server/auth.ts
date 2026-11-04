import { createHash } from 'node:crypto';
import { findActiveApiCredential, getSupabase } from './db';

/**
 * Resultado da autenticação de uma requisição v1.
 *
 * A API v1 aceita UMA das duas identidades abaixo:
 *  - consumer (interno/externo): header Authorization: Bearer <MAPSCRAPE_API_KEY>.
 *    A chave é hasheada (SHA-256) e consultada em api_credentials; o escopo é o
 *    consumer_project da credencial.
 *  - user (interface web): header Authorization: Bearer <Supabase session JWT>.
 *    O token é validado via supabase.auth.getUser; o escopo é o id do usuário,
 *    que também é usado como consumer_project para isolamento de dados.
 */
export interface AuthContext {
  kind: 'consumer' | 'user';
  /** Identificador de escopo de isolamento (consumer_project / user_id). */
  scope: string;
  /** Id da credencial de API (somente consumer). */
  credentialId?: string;
  /** E-mail do usuário (somente user). */
  email?: string;
}

export interface AuthError {
  ok: false;
  status: number;
  error: string;
}

export interface AuthOk {
  ok: true;
  context: AuthContext;
}

export type AuthResult = AuthOk | AuthError;

/**
 * Envia 401/503 quando a autenticação falhar e retorna true.
 * Retorna false (e não envia resposta) quando autenticado, já com o contexto
 * narrowado para AuthOk via type guard.
 */
export function sendAuthError(res: any, result: AuthResult): result is AuthError {
  if (!result.ok) {
    const e = result as AuthError;
    res.status(e.status).json({ error: e.error });
    return true;
  }
  return false;
}

/**
 * Verifica o token administrativo de provisionamento (X-MapScrape-Provisioning-Token).
 * Nunca usa Bearer de consumidor. Usado pelas rotas de provisioning.
 */
export function authenticateProvisioning(req: any): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.MAPSCRAPE_PROVISIONING_TOKEN?.trim();
  if (!expected) {
    return { ok: false, status: 503, error: 'provisioning_unavailable' };
  }
  const token = req.headers?.['x-mapscrape-provisioning-token'];
  if (!token || String(token).trim() !== expected) {
    return { ok: false, status: 401, error: 'provisioning_unauthorized' };
  }
  return { ok: true };
}

/**
 * Hash SHA-256 de uma chave de API. Usado tanto ao emitir (provisioning) quanto
 * ao verificar (middleware v1), garantindo consistência entre emissão e consulta.
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey.trim()).digest('hex');
}

/**
 * Extrai e autentica a identidade do chamador a partir do header Authorization.
 *
 * Aceita Bearer de chave de API (consumer) OU Bearer de token de sessão Supabase (user).
 * Retorna 401 quando ausente/inválido, 503 quando a verificação de credenciais
 * falha por indisponibilidade de dependência.
 */
export async function authenticateRequest(
  authHeader: string | undefined,
): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Credencial de autenticação ausente.' };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return { ok: false, status: 401, error: 'Credencial de autenticação ausente.' };
  }

  // 1) Tenta como chave de API do consumidor (hash SHA-256).
  try {
    const keyHash = hashApiKey(token);
    const credential = await findActiveApiCredential(keyHash);
    if (credential) {
      return {
        ok: true,
        context: {
          kind: 'consumer',
          scope: credential.consumer_project,
          credentialId: credential.id,
        },
      };
    }
  } catch (error) {
    // Falha ao consultar credenciais -> dependência indisponível (503).
    return {
      ok: false,
      status: 503,
      error: 'authentication_unavailable',
    };
  }

  // 2) Tenta como token de sessão Supabase (interface web).
  // Usa getSupabase() que resolve bindings do Cloudflare (context.env) antes de process.env.
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return { ok: false, status: 401, error: 'Token inválido ou expirado.' };
    }
    const userId = data.user.id;
    const email = data.user.email ?? '';
    return {
      ok: true,
      context: {
        kind: 'user',
        scope: userId,
        email,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: 'authentication_unavailable',
    };
  }
}
