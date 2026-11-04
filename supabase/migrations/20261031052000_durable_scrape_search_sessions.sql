-- Shared durable search sessions: a new job with the same user and search scope
-- continues the previous discovery queue instead of creating an empty queue.
create table if not exists public.scrape_search_sessions (
  id text primary key,
  user_id text not null references public.app_users(id) on delete cascade,
  scope_key text not null,
  segment text not null,
  location text not null,
  project_id text,
  category_id text,
  next_ordinal integer not null default 0 check (next_ordinal >= 0),
  total_found integer not null default 0 check (total_found >= 0),
  discovery_checkpoint jsonb not null default '{}'::jsonb,
  exhausted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scrape_search_sessions_user_scope_unique unique (user_id, scope_key)
);

alter table public.scrape_jobs
  add column if not exists search_session_id text
  references public.scrape_search_sessions(id) on delete set null;

alter table public.scrape_candidates
  add column if not exists session_id text
  references public.scrape_search_sessions(id) on delete cascade;

create unique index if not exists scrape_candidates_session_source_unique_idx
  on public.scrape_candidates (session_id, source_key)
  where session_id is not null;

create unique index if not exists scrape_candidates_session_ordinal_unique_idx
  on public.scrape_candidates (session_id, ordinal)
  where session_id is not null;

create index if not exists scrape_candidates_session_status_ordinal_idx
  on public.scrape_candidates (session_id, status, ordinal)
  where session_id is not null;

alter table public.scrape_search_sessions enable row level security;
revoke all on public.scrape_search_sessions from anon, authenticated;
grant all on public.scrape_search_sessions to service_role;
