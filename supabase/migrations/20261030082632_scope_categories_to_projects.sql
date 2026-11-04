alter table public.categories
  add column if not exists project_id text;

alter table public.categories
  add constraint categories_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;

create unique index if not exists categories_project_name_unique
  on public.categories (project_id, lower(name));

create unique index if not exists categories_project_id_id_unique
  on public.categories (project_id, id);

alter table public.scrape_jobs
  add constraint scrape_jobs_project_category_fkey
  foreign key (project_id, category_id)
  references public.categories (project_id, id)
  on delete set null (category_id);

create index if not exists scrape_jobs_project_category_idx
  on public.scrape_jobs (project_id, category_id);
