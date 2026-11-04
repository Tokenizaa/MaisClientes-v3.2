create table if not exists public.audit_logs (
  id text primary key,
  created_at timestamptz not null default now(),
  level text not null check (level in ('debug','info','warn','error')),
  category text not null,
  event text not null,
  message text not null,
  job_id text not null default '',
  metadata text not null default '{}'
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_job_id_created_at_idx on public.audit_logs (job_id, created_at desc);
create index if not exists audit_logs_level_created_at_idx on public.audit_logs (level, created_at desc);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant all on public.audit_logs to service_role;
