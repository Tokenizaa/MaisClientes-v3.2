alter table public.scrape_jobs
  drop constraint if exists scrape_jobs_project_id_fkey;

alter table public.scrape_jobs
  add constraint scrape_jobs_project_id_fkey
  foreign key (project_id) references public.projects(id)
  on delete set null;
