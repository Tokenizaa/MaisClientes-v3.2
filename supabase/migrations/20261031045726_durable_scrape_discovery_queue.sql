-- Durable discovery state and candidate queue for resumable Google Maps scraping.
alter table public.scrape_jobs
  add column if not exists phase text,
  add column if not exists discovery_checkpoint jsonb not null default '{}'::jsonb,
  add column if not exists candidate_cursor integer not null default 0,
  add column if not exists retry_count integer not null default 0,
  add column if not exists heartbeat_at timestamptz;

create table if not exists public.scrape_candidates (
  id text primary key,
  job_id text not null references public.scrape_jobs(id) on delete cascade,
  user_id text not null references public.app_users(id) on delete cascade,
  source_key text not null,
  source_url text not null,
  ordinal integer not null check (ordinal >= 0),
  status text not null default 'discovered'
    check (status in ('discovered', 'processing', 'processed', 'duplicate', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint scrape_candidates_job_source_unique unique (job_id, source_key),
  constraint scrape_candidates_job_ordinal_unique unique (job_id, ordinal)
);

create index if not exists scrape_candidates_job_status_ordinal_idx
  on public.scrape_candidates (job_id, status, ordinal);

create index if not exists scrape_candidates_user_job_idx
  on public.scrape_candidates (user_id, job_id);

alter table public.scrape_candidates enable row level security;
revoke all on public.scrape_candidates from anon, authenticated;
grant all on public.scrape_candidates to service_role;
