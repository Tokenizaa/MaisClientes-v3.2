-- Serialize all workers that operate on the same durable search session.
-- This protects shared ordinals, discovery checkpoints and next_ordinal from
-- concurrent jobs created for an identical search scope.
alter table public.scrape_search_sessions
  add column if not exists worker_locked_until timestamptz;

create index if not exists scrape_search_sessions_worker_lease_idx
  on public.scrape_search_sessions (worker_locked_until)
  where worker_locked_until is not null;

-- Candidate rows belong to the durable search session, not to the lifetime of
-- the job that happened to discover them. Deleting an old job must not erase
-- the shared queue needed by later jobs in that session.
alter table public.scrape_candidates
  alter column job_id drop not null;

alter table public.scrape_candidates
  drop constraint if exists scrape_candidates_job_id_fkey;

alter table public.scrape_candidates
  add constraint scrape_candidates_job_id_fkey
  foreign key (job_id) references public.scrape_jobs(id) on delete set null;
