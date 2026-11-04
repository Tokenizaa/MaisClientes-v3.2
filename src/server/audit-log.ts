import { getSupabase } from './db.js';

export type AuditLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AuditEvent {
  id: string;
  created_at: string;
  level: AuditLevel;
  category: string;
  event: string;
  message: string;
  job_id: string;
  metadata: string;
}

/**
 * Sensitive fields that should be redacted from audit logs for LGPD compliance
 */
const SENSITIVE_FIELDS = new Set([
  'phone', 'email', 'cpf', 'cnpj', 'password', 'token', 'authorization', 'cookie', 'creditcard', 'bankaccount',
]);

/**
 * Sanitizes metadata by redacting sensitive fields for LGPD compliance.
 * Removes or masks values of sensitive keys to prevent data leakage in logs.
 */
function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.has(lowerKey) || /secret|apikey|service.?role|credential/i.test(key)) {
      sanitized[key] = '[REDACIONADO]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export async function initAuditLog(): Promise<void> {
  let db;
  try {
    db = getSupabase();
  } catch {
    console.log('Supabase não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para ativar logs de auditoria.');
    return;
  }
  const { error } = await db.from('audit_logs').select('id', { count: 'exact', head: true });

  // Check if table exists, if not, just log
  if (error) {
    console.log('Tabela audit_logs deve existir no Supabase (criar via dashboard ou migration).');
  }
}

export async function writeAuditLog(input: {
  level?: AuditLevel;
  category: string;
  event: string;
  message: string;
  jobId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = getSupabase();
  const createdAt = new Date().toISOString();
  const sanitizedMetadata = sanitizeMetadata(input.metadata ?? {});
  const metadata = JSON.stringify(sanitizedMetadata);
  const { error } = await db.from('audit_logs').insert({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    created_at: createdAt,
    level: input.level ?? 'info',
    category: input.category,
    event: input.event,
    message: input.message.slice(0, 4000),
    job_id: input.jobId ?? '',
    metadata: metadata.slice(0, 12000),
  });

  if (error) {
    console.error('Erro ao escrever log de auditoria:', error);
  }
}

export async function listAuditLogs(options: {
  limit?: number;
  offset?: number;
  level?: string;
  category?: string;
  jobId?: string;
  query?: string;
  consumerProject?: string;
} = {}): Promise<{ logs: AuditEvent[]; total: number }> {
  const db = getSupabase();

  let query = db.from('audit_logs').select('id, created_at, level, category, event, message, job_id, metadata', { count: 'exact' });

  if (options.level) {
    query = query.eq('level', options.level);
  }
  if (options.category) {
    query = query.eq('category', options.category);
  }
  if (options.jobId) {
    query = query.eq('job_id', options.jobId);
  }
  if (options.query?.trim()) {
    const q = `%${options.query.trim().slice(0, 200)}%`;
    query = query.or(`message.ilike.%${q}%,event.ilike.%${q}%,metadata.ilike.%${q}%,job_id.ilike.%${q}%`);
  }
  // Data isolation: when scoped to a consumer, only expose logs for that user's jobs.
  let allowedJobIds: string[] | null = null;
  if (options.consumerProject) {
    const { data: userJobs, error: jobsError } = await db
      .from('scrape_jobs')
      .select('id')
      .eq('user_id', options.consumerProject);
    if (jobsError) throw jobsError;
    allowedJobIds = (userJobs ?? []).map((j: any) => j.id);
    if (allowedJobIds.length > 0) {
      query = query.in('job_id', allowedJobIds);
    } else {
      // Scoped consumer has no jobs -> no logs visible.
      return { logs: [], total: 0 };
    }
  }

  const requestedLimit = typeof options.limit === 'number' && Number.isFinite(options.limit) ? Math.max(1, Math.min(500, Math.floor(options.limit))) : 100;
  const requestedOffset = typeof options.offset === 'number' && Number.isFinite(options.offset) ? Math.max(0, Math.floor(options.offset)) : 0;
  const limit = requestedLimit;
  const offset = requestedOffset;

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  if (error) throw error;

  const logs = data?.map((row: any) => ({
    id: row.id,
    created_at: row.created_at,
    level: row.level,
    category: row.category,
    event: row.event,
    message: row.message,
    job_id: row.job_id,
    metadata: row.metadata,
  })) as AuditEvent[];

  return {
    logs: logs || [],
    total: Number(count || 0),
  };
}