-- MaisClientes v2: persistent application schema
-- Access is server-side only. All public-schema tables have RLS enabled and no anon/authenticated policies.
create table if not exists public.app_users (
  id text primary key,
  email text not null unique,
  name text not null default '',
  password_hash text not null,
  role text not null default 'user' check (role in ('admin','user')),
  created_at timestamptz not null default now()
);
create table if not exists public.projects (
  id text primary key, name text not null, user_id text not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index if not exists projects_user_created_idx on public.projects(user_id, created_at desc);
create table if not exists public.categories (
  id text primary key, name text not null, user_id text not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists categories_user_created_idx on public.categories(user_id, created_at desc);
create table if not exists public.scrape_jobs (
  id text primary key, user_id text not null references public.app_users(id) on delete cascade,
  segment text not null, project_name text, project_id text references public.projects(id) on delete set null,
  category_id text references public.categories(id) on delete set null, location text not null,
  limit_requested integer not null default 20 check (limit_requested between 1 and 200),
  status text not null default 'running' check (status in ('running','completed','partial','stopped','failed')),
  status_message text not null default '', total_found integer not null default 0,
  total_collected integer not null default 0, total_duplicates integer not null default 0,
  total_errors integer not null default 0, current_step text,
  created_at timestamptz not null default now(), completed_at timestamptz
);
create index if not exists scrape_jobs_user_created_idx on public.scrape_jobs(user_id, created_at desc);
create index if not exists scrape_jobs_status_created_idx on public.scrape_jobs(status, created_at desc);
create table if not exists public.places (
  id text primary key, job_id text not null references public.scrape_jobs(id) on delete cascade,
  name text not null default '', category text not null default '', address text not null default '',
  phone text not null default '', website text not null default '', rating text not null default '',
  review_count text not null default '', price_range text not null default '', opening_hours text not null default '',
  business_status text not null default '', latitude text not null default '', longitude text not null default '',
  maps_url text not null default '', description text not null default '', services_attributes text not null default '',
  photos text, videos text, logo_url text, booking_url text, social_links text, reviews text,
  review_topics text, additional_attributes text, media_items text, plus_code text, postal_code text,
  country text, city text, state text, source_place_id text, source_url text, attributes text,
  accessibility_attributes text, next_opening_text text, next_open_day text, next_open_time text,
  visible_photos_count text, popular_times text, rating_distribution text, review_highlights text,
  field_status text, collected_at timestamptz not null default now()
);
create index if not exists places_job_collected_idx on public.places(job_id, collected_at desc);
create index if not exists places_source_place_id_idx on public.places(source_place_id) where source_place_id is not null;
create unique index if not exists places_source_url_unique_idx on public.places(source_url) where source_url is not null and source_url <> '';
create table if not exists public.api_credentials (
  id text primary key, consumer_name text not null, consumer_project text not null,
  api_key_hash text not null unique, status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
  id text primary key, created_at timestamptz not null default now(),
  level text not null check (level in ('debug','info','warn','error')), category text not null,
  event text not null, message text not null, job_id text, metadata text not null default '', user_id text
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_job_created_idx on public.audit_logs(job_id, created_at desc);
create table if not exists public.scraper_settings (
  id text primary key default 'default' check (id = 'default'),
  preferred_engine text check (preferred_engine in ('local','cloudflare')), browser_ws_endpoint text,
  updated_at timestamptz not null default now()
);
alter table public.app_users enable row level security;
alter table public.projects enable row level security;
alter table public.categories enable row level security;
alter table public.scrape_jobs enable row level security;
alter table public.places enable row level security;
alter table public.api_credentials enable row level security;
alter table public.audit_logs enable row level security;
alter table public.scraper_settings enable row level security;
revoke all on public.app_users, public.projects, public.categories, public.scrape_jobs,
  public.places, public.api_credentials, public.audit_logs, public.scraper_settings from anon, authenticated;
