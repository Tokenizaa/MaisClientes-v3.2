-- Durable lease prevents concurrent serverless invocations from processing the same job.
alter table public.scrape_jobs
  add column if not exists worker_locked_until timestamptz;

create index if not exists scrape_jobs_worker_lease_idx
  on public.scrape_jobs (worker_locked_until)
  where status = 'running';
