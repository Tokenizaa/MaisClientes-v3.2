-- Durable snapshot for the existing Store API during the transition to normalized repositories.
create table if not exists public.app_state (
  id text primary key default 'main' check (id = 'main'),
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_state enable row level security;
revoke all on public.app_state from anon, authenticated;
