-- Durable runtime snapshot used by the serverless scraper.
-- Access is restricted to the service role; no browser role can read or mutate it.
create table if not exists public.app_state (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;
revoke all on table public.app_state from anon, authenticated;
grant all on table public.app_state to service_role;

-- The application persists cancellation requests alongside each search job.
alter table public.scrape_jobs
  add column if not exists cancel_requested boolean not null default false;
