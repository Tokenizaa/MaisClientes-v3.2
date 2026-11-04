-- Index job foreign keys and restrict execution of the pre-existing helper.
create index if not exists scrape_jobs_project_id_idx on public.scrape_jobs(project_id);
create index if not exists scrape_jobs_category_id_idx on public.scrape_jobs(category_id);
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
