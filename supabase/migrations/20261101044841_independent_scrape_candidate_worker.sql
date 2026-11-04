-- Independent, leased consumers for the durable scrape candidate queue.
-- The discovery worker remains responsible for registering feed results. A separate
-- Node worker claims one candidate at a time and extracts its place sheet.

alter table public.scrape_candidates
  add column if not exists processing_token uuid,
  add column if not exists processing_generation bigint not null default 0,
  add column if not exists processing_locked_until timestamptz,
  add column if not exists processing_worker_id text,
  add column if not exists next_attempt_at timestamptz;

create index if not exists scrape_candidates_claim_idx
  on public.scrape_candidates (status, next_attempt_at, discovered_at, ordinal)
  where status in ('discovered', 'processing');

create or replace function public.complete_scrape_candidate(
  p_candidate_id text,
  p_job_id text,
  p_user_id text,
  p_session_id text,
  p_outcome text,
  p_place jsonb,
  p_source_key text,
  p_source_url text,
  p_lease_token uuid,
  p_lease_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.scrape_search_sessions%rowtype;
  v_candidate public.scrape_candidates%rowtype;
  v_job public.scrape_jobs%rowtype;
  v_place_json jsonb;
  v_lock_key text;
  v_actual_outcome text;
  v_inserted integer := 0;
  v_checkpoint jsonb;
begin
  if p_outcome not in ('saved', 'duplicate') then
    raise exception 'invalid candidate outcome';
  end if;

  select * into v_job
    from public.scrape_jobs
   where id = p_job_id and user_id = p_user_id
     and search_session_id = p_session_id
   for update;
  if not found then raise exception 'scrape job not found or not owned'; end if;

  select * into v_session
    from public.scrape_search_sessions
   where id = p_session_id and user_id = p_user_id
   for update;
  if not found then raise exception 'scrape session not found or not owned'; end if;
  select * into v_candidate
    from public.scrape_candidates
   where id = p_candidate_id
     and job_id = p_job_id
     and user_id = p_user_id
     and session_id = p_session_id
   for update;
  if not found then raise exception 'scrape candidate not found or not owned'; end if;

  -- Idempotency: retries of a terminal candidate return the persisted result
  -- without incrementing counters or rewriting the checkpoint.
  if v_candidate.status in ('processed', 'duplicate') then
    select * into v_job from public.scrape_jobs where id = p_job_id;
    return jsonb_build_object(
      'outcome', v_candidate.status,
      'total_collected', v_job.total_collected,
      'total_duplicates', v_job.total_duplicates,
      'candidate_cursor', v_job.candidate_cursor,
      'checkpoint', v_job.discovery_checkpoint,
      'already_completed', true
    );
  end if;

  -- Inline discovery workers authenticate with the session lease. Independent
  -- processors authenticate with the candidate-specific lease returned by
  -- claim_scrape_candidate; neither worker can impersonate the other.
  if v_session.lease_token is distinct from p_lease_token
     or v_session.lease_generation <> p_lease_generation
     or v_session.lease_expires_at is null
     or v_session.lease_expires_at <= now() then
    select * into v_candidate
      from public.scrape_candidates
     where id = p_candidate_id
       and job_id = p_job_id
       and user_id = p_user_id
       and session_id = p_session_id
     for update;
    if not found
       or v_candidate.processing_token is distinct from p_lease_token
       or v_candidate.processing_generation <> p_lease_generation
       or v_candidate.processing_locked_until is null
       or v_candidate.processing_locked_until <= now() then
      raise exception 'scrape candidate lease lost';
    end if;
  end if;

  v_actual_outcome := p_outcome;
  if p_outcome = 'saved' then
    if p_place is null or jsonb_typeof(p_place) <> 'object' then
      raise exception 'place payload is required for saved outcome';
    end if;

    v_place_json := p_place || jsonb_build_object(
      'id', coalesce(nullif(p_place->>'id', ''), 'plc_' || gen_random_uuid()::text),
      'job_id', p_job_id,
      'name', coalesce(p_place->>'name', ''),
      'category', coalesce(p_place->>'category', ''),
      'address', coalesce(p_place->>'address', ''),
      'phone', coalesce(p_place->>'phone', ''),
      'website', coalesce(p_place->>'website', ''),
      'rating', coalesce(p_place->>'rating', ''),
      'review_count', coalesce(p_place->>'review_count', ''),
      'price_range', coalesce(p_place->>'price_range', ''),
      'opening_hours', coalesce(p_place->>'opening_hours', ''),
      'business_status', coalesce(p_place->>'business_status', ''),
      'latitude', coalesce(p_place->>'latitude', ''),
      'longitude', coalesce(p_place->>'longitude', ''),
      'maps_url', coalesce(p_place->>'maps_url', ''),
      'description', coalesce(p_place->>'description', ''),
      'services_attributes', coalesce(p_place->>'services_attributes', ''),
      'source_url', coalesce(nullif(p_place->>'source_url', ''), nullif(p_place->>'maps_url', ''), p_source_url),
      'collected_at', coalesce(p_place->>'collected_at', now()::text)
    );

    -- Serialize all plausible identity keys in deterministic order. This
    -- closes the SELECT-then-INSERT race even where legacy data prevents a
    -- global UNIQUE constraint on source_place_id or name/address.
    for v_lock_key in
      select distinct key
        from unnest(array[
          case when nullif(trim(coalesce(v_place_json->>'source_place_id', '')), '') is not null
            then 'place-id:' || lower(trim(v_place_json->>'source_place_id')) end,
          case when nullif(trim(coalesce(v_place_json->>'source_url', '')), '') is not null
            then 'url:' || regexp_replace(regexp_replace(lower(trim(v_place_json->>'source_url')), '[?#].*$', ''), '/+$', '') end,
          case when nullif(trim(coalesce(v_place_json->>'maps_url', '')), '') is not null
            then 'url:' || regexp_replace(regexp_replace(lower(trim(v_place_json->>'maps_url')), '[?#].*$', ''), '/+$', '') end,
          case when nullif(trim(coalesce(v_place_json->>'name', '')), '') is not null
                 and nullif(trim(coalesce(v_place_json->>'address', '')), '') is not null
            then 'name-address:' || lower(regexp_replace(trim(v_place_json->>'name') || '|' || trim(v_place_json->>'address'), '\s+', ' ', 'g')) end
        ]) as keys(key)
       where key is not null
       order by key
    loop
      perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));
    end loop;

    if exists (
      select 1 from public.places p
       where (nullif(trim(v_place_json->>'source_place_id'), '') is not null
              and lower(trim(p.source_place_id)) = lower(trim(v_place_json->>'source_place_id')))
          or (nullif(trim(v_place_json->>'source_url'), '') is not null
              and (p.source_url = v_place_json->>'source_url' or p.maps_url = v_place_json->>'source_url'))
          or (nullif(trim(v_place_json->>'maps_url'), '') is not null
              and (p.source_url = v_place_json->>'maps_url' or p.maps_url = v_place_json->>'maps_url'))
          or (nullif(trim(v_place_json->>'name'), '') is not null
              and nullif(trim(v_place_json->>'address'), '') is not null
              and lower(regexp_replace(trim(p.name) || '|' || trim(p.address), '\s+', ' ', 'g')) =
                  lower(regexp_replace(trim(v_place_json->>'name') || '|' || trim(v_place_json->>'address'), '\s+', ' ', 'g')))
    ) then
      v_actual_outcome := 'duplicate';
    else
      insert into public.places
      select (jsonb_populate_record(null::public.places, v_place_json)).*
      on conflict do nothing;
      get diagnostics v_inserted = row_count;
      if v_inserted = 0 then
        v_actual_outcome := 'duplicate';
      end if;
    end if;
  end if;

  v_checkpoint := coalesce(v_job.discovery_checkpoint, '{}'::jsonb) || jsonb_build_object(
    'version', 1,
    'last_processed_url', regexp_replace(coalesce(p_source_url, v_candidate.source_url), '[?#].*$', ''),
    'last_processed_source_key', coalesce(nullif(p_source_key, ''), v_candidate.source_key),
    'last_processed_name', coalesce(p_place->>'name', v_job.discovery_checkpoint->>'last_processed_name', ''),
    'last_processed_outcome', v_actual_outcome,
    'last_processed_at', now(),
    'last_checkpoint_at', now(),
    'processed_count', coalesce((v_job.discovery_checkpoint->>'processed_count')::integer, 0) + 1
  );

  update public.scrape_candidates
     set status = case when v_actual_outcome = 'saved' then 'processed' else 'duplicate' end,
         processed_at = now(),
         updated_at = now(),
         last_error = null,
         processing_token = null,
         processing_locked_until = null,
         processing_worker_id = null,
         next_attempt_at = null
   where id = p_candidate_id;

  update public.scrape_jobs
     set total_collected = total_collected + case when v_actual_outcome = 'saved' then 1 else 0 end,
         total_duplicates = total_duplicates + case when v_actual_outcome = 'duplicate' then 1 else 0 end,
         candidate_cursor = candidate_cursor + 1,
         discovery_checkpoint = v_checkpoint,
         heartbeat_at = now()
   where id = p_job_id and user_id = p_user_id;

  update public.scrape_search_sessions
     set discovery_checkpoint = v_checkpoint,
         updated_at = now()
   where id = p_session_id and user_id = p_user_id;

  select * into v_job from public.scrape_jobs where id = p_job_id;
  return jsonb_build_object(
    'outcome', v_actual_outcome,
    'total_collected', v_job.total_collected,
    'total_duplicates', v_job.total_duplicates,
    'candidate_cursor', v_job.candidate_cursor,
    'checkpoint', v_job.discovery_checkpoint,
    'already_completed', false
  );
end;
$$;



create or replace function public.claim_scrape_candidate(
  p_worker_id text,
  p_lease_seconds integer default 180,
  p_max_attempts integer default 5
)
returns table (
  candidate_id text,
  job_id text,
  user_id text,
  session_id text,
  source_key text,
  source_url text,
  ordinal integer,
  attempt_count integer,
  lease_token uuid,
  lease_generation bigint,
  segment text,
  location text,
  project_id text,
  category_id text,
  limit_requested integer,
  total_collected integer,
  total_duplicates integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'worker id is required';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'candidate lease seconds must be between 30 and 900';
  end if;
  if p_max_attempts < 1 or p_max_attempts > 20 then
    raise exception 'max attempts must be between 1 and 20';
  end if;

  -- A worker that dies on its final attempt cannot leave a permanent
  -- processing row after its lease expires.
  update public.scrape_candidates c
     set status = 'failed',
         last_error = coalesce(c.last_error, 'Worker lease expired after maximum attempts'),
         processing_token = null,
         processing_locked_until = null,
         processing_worker_id = null,
         next_attempt_at = null,
         updated_at = now()
   where c.status = 'processing'
     and c.session_id is not null
     and (c.processing_locked_until is null or c.processing_locked_until <= now())
     and c.attempt_count >= p_max_attempts;

  return query
  with next_candidate as (
    select c.id
      from public.scrape_candidates c
      join public.scrape_jobs j on j.id = c.job_id
     where c.status in ('discovered', 'processing')
       and c.session_id is not null
       and c.session_id = j.search_session_id
       and (c.next_attempt_at is null or c.next_attempt_at <= now())
       and (c.status = 'discovered'
            or c.processing_locked_until is null
            or c.processing_locked_until <= now())
       and c.attempt_count < p_max_attempts
       and j.status in ('running', 'partial')
       and j.cancel_requested = false
       and j.total_collected + (
         select count(*)::integer
           from public.scrape_candidates active
          where active.job_id = j.id
            and active.status = 'processing'
            and active.processing_locked_until > now()
       ) < j.limit_requested
     order by c.discovered_at, c.ordinal, c.id
     for update of j, c skip locked
     limit 1
  ),
  claimed as (
    update public.scrape_candidates c
       set status = 'processing',
           attempt_count = c.attempt_count + 1,
           processing_token = v_token,
           processing_generation = c.processing_generation + 1,
           processing_locked_until = now() + make_interval(secs => p_lease_seconds),
           processing_worker_id = p_worker_id,
           updated_at = now()
      from next_candidate n
     where c.id = n.id
    returning c.*
  )
  select c.id, c.job_id, c.user_id, c.session_id, c.source_key, c.source_url,
         c.ordinal, c.attempt_count, c.processing_token, c.processing_generation,
         j.segment, j.location, j.project_id, j.category_id, j.limit_requested,
         j.total_collected, j.total_duplicates
    from claimed c
    join public.scrape_jobs j on j.id = c.job_id;
end;
$$;

create or replace function public.renew_scrape_candidate_lease(
  p_candidate_id text,
  p_worker_id text,
  p_lease_token uuid,
  p_generation bigint,
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'candidate lease seconds must be between 30 and 900';
  end if;
  update public.scrape_candidates
     set processing_locked_until = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where id = p_candidate_id
     and status = 'processing'
     and processing_worker_id = p_worker_id
     and processing_token = p_lease_token
     and processing_generation = p_generation
     and processing_locked_until > now();
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.release_scrape_candidate(
  p_candidate_id text,
  p_worker_id text,
  p_lease_token uuid,
  p_generation bigint,
  p_error text,
  p_max_attempts integer default 5
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidate public.scrape_candidates%rowtype;
  v_next_status text;
begin
  select * into v_candidate
    from public.scrape_candidates
   where id = p_candidate_id
     and status = 'processing'
     and processing_worker_id = p_worker_id
     and processing_token = p_lease_token
     and processing_generation = p_generation
   for update;
  if not found then
    raise exception 'candidate lease lost while releasing';
  end if;

  v_next_status := case when v_candidate.attempt_count >= p_max_attempts
    then 'failed' else 'discovered' end;

  update public.scrape_candidates
     set status = v_next_status,
         last_error = left(coalesce(p_error, 'Falha desconhecida'), 2000),
         processing_token = null,
         processing_locked_until = null,
         processing_worker_id = null,
         next_attempt_at = case when v_next_status = 'failed' then null
           else now() + make_interval(secs => least(300, 5 * power(2, greatest(0, v_candidate.attempt_count - 1))::integer)) end,
         updated_at = now()
   where id = p_candidate_id;

  update public.scrape_jobs
     set total_errors = total_errors + 1,
         heartbeat_at = now()
   where id = v_candidate.job_id and user_id = v_candidate.user_id;

  return v_next_status;
end;
$$;

revoke all on function public.claim_scrape_candidate(text,integer,integer) from public, anon, authenticated;
revoke all on function public.renew_scrape_candidate_lease(text,text,uuid,bigint,integer) from public, anon, authenticated;
revoke all on function public.release_scrape_candidate(text,text,uuid,bigint,text,integer) from public, anon, authenticated;
revoke all on function public.complete_scrape_candidate(text,text,text,text,text,jsonb,text,text,uuid,bigint) from public, anon, authenticated;
grant execute on function public.claim_scrape_candidate(text,integer,integer) to service_role;
grant execute on function public.renew_scrape_candidate_lease(text,text,uuid,bigint,integer) to service_role;
grant execute on function public.release_scrape_candidate(text,text,uuid,bigint,text,integer) to service_role;
grant execute on function public.complete_scrape_candidate(text,text,text,text,text,jsonb,text,text,uuid,bigint) to service_role;
