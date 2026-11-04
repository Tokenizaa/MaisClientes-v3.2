-- Simplify Maps scraping around one job lease and atomic place persistence.
-- Legacy session/candidate tables are intentionally retained for historical jobs;
-- the new runtime no longer needs to create or write them.

alter table public.scrape_jobs
  add column if not exists worker_lease_token uuid,
  add column if not exists worker_lease_generation bigint not null default 0;

create or replace function public.claim_scrape_job_lease(
  p_job_id text,
  p_user_id text,
  p_lease_token uuid,
  p_lease_seconds integer default 90
)
returns table (acquired boolean, generation bigint, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_lease_seconds < 15 or p_lease_seconds > 300 then
    raise exception 'invalid lease duration';
  end if;

  return query
  update public.scrape_jobs j
     set worker_lease_token = p_lease_token,
         worker_lease_generation = j.worker_lease_generation + 1,
         worker_locked_until = now() + make_interval(secs => p_lease_seconds),
         heartbeat_at = now()
   where j.id = p_job_id
     and j.user_id = p_user_id
     and j.status = 'running'
     and (j.worker_locked_until is null or j.worker_locked_until <= now())
  returning true, j.worker_lease_generation, j.worker_locked_until;

  if not found then
    return query
    select false, j.worker_lease_generation, j.worker_locked_until
      from public.scrape_jobs j
     where j.id = p_job_id and j.user_id = p_user_id;
  end if;
end;
$$;

create or replace function public.renew_scrape_job_lease(
  p_job_id text,
  p_user_id text,
  p_lease_token uuid,
  p_generation bigint,
  p_lease_seconds integer default 90
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with renewed as (
    update public.scrape_jobs
       set worker_locked_until = now() + make_interval(secs => p_lease_seconds),
           heartbeat_at = now()
     where id = p_job_id
       and user_id = p_user_id
       and worker_lease_token = p_lease_token
       and worker_lease_generation = p_generation
       and worker_locked_until > now()
    returning 1
  )
  select exists(select 1 from renewed);
$$;

create or replace function public.release_scrape_job_lease(
  p_job_id text,
  p_user_id text,
  p_lease_token uuid,
  p_generation bigint
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with released as (
    update public.scrape_jobs
       set worker_lease_token = null,
           worker_locked_until = null
     where id = p_job_id
       and user_id = p_user_id
       and worker_lease_token = p_lease_token
       and worker_lease_generation = p_generation
    returning 1
  )
  select exists(select 1 from released);
$$;

create or replace function public.is_scrape_place_duplicate(
  p_source_place_id text,
  p_source_url text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
      from public.places p
     where (
       nullif(trim(coalesce(p_source_place_id, '')), '') is not null
       and lower(trim(coalesce(p.source_place_id, ''))) = lower(trim(p_source_place_id))
     )
     or (
       nullif(trim(coalesce(p_source_url, '')), '') is not null
       and (
         regexp_replace(regexp_replace(lower(trim(coalesce(p.source_url, ''))), '[?#].*$', ''), '/+$', '') =
           regexp_replace(regexp_replace(lower(trim(p_source_url)), '[?#].*$', ''), '/+$', '')
         or regexp_replace(regexp_replace(lower(trim(coalesce(p.maps_url, ''))), '[?#].*$', ''), '/+$', '') =
           regexp_replace(regexp_replace(lower(trim(p_source_url)), '[?#].*$', ''), '/+$', '')
       )
     )
  );
$$;

create or replace function public.persist_scraped_place(
  p_job_id text,
  p_user_id text,
  p_place jsonb,
  p_source_place_id text,
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
  v_job public.scrape_jobs%rowtype;
  v_place_json jsonb;
  v_lock_key text;
  v_outcome text := 'duplicate';
  v_inserted integer := 0;
begin
  select * into v_job
    from public.scrape_jobs
   where id = p_job_id and user_id = p_user_id
   for update;
  if not found then raise exception 'scrape job not found or not owned'; end if;

  if v_job.worker_lease_token is distinct from p_lease_token
     or v_job.worker_lease_generation <> p_lease_generation
     or v_job.worker_locked_until is null
     or v_job.worker_locked_until <= now()
     or v_job.status <> 'running' then
    raise exception 'scrape job lease lost';
  end if;

  if p_place is not null then
    if jsonb_typeof(p_place) <> 'object' then
      raise exception 'place payload must be a JSON object';
    end if;

    v_place_json := p_place || jsonb_build_object(
      'id', coalesce(nullif(p_place->>'id', ''), 'plc_' || gen_random_uuid()::text),
      'job_id', p_job_id,
      'source_place_id', coalesce(nullif(p_place->>'source_place_id', ''), nullif(p_source_place_id, '')),
      'source_url', coalesce(nullif(p_place->>'source_url', ''), nullif(p_place->>'maps_url', ''), p_source_url),
      'collected_at', coalesce(p_place->>'collected_at', now()::text)
    );

    for v_lock_key in
      select distinct key
        from unnest(array[
          case when nullif(trim(coalesce(v_place_json->>'source_place_id', '')), '') is not null
            then 'place-id:' || lower(trim(v_place_json->>'source_place_id')) end,
          case when nullif(trim(coalesce(v_place_json->>'source_url', '')), '') is not null
            then 'url:' || regexp_replace(regexp_replace(lower(trim(v_place_json->>'source_url')), '[?#].*$', ''), '/+$', '') end,
          case when nullif(trim(coalesce(v_place_json->>'maps_url', '')), '') is not null
            then 'url:' || regexp_replace(regexp_replace(lower(trim(v_place_json->>'maps_url')), '[?#].*$', ''), '/+$', '') end,
          case when nullif(trim(coalesce(v_place_json->>'name', '')), '') <> ''
                 and nullif(trim(coalesce(v_place_json->>'address', '')), '') <> ''
            then 'name-address:' || lower(regexp_replace(trim(v_place_json->>'name') || '|' || trim(v_place_json->>'address'), '\s+', ' ', 'g')) end
        ]) as keys(key)
       where key is not null
       order by key
    loop
      perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));
    end loop;

    if not exists (
      select 1 from public.places p
       where (
         nullif(trim(v_place_json->>'source_place_id'), '') is not null
         and lower(trim(coalesce(p.source_place_id, ''))) = lower(trim(v_place_json->>'source_place_id'))
       )
       or (
         nullif(trim(v_place_json->>'source_url'), '') is not null
         and (
           regexp_replace(regexp_replace(lower(trim(coalesce(p.source_url, ''))), '[?#].*$', ''), '/+$', '') =
             regexp_replace(regexp_replace(lower(trim(v_place_json->>'source_url')), '[?#].*$', ''), '/+$', '')
           or regexp_replace(regexp_replace(lower(trim(coalesce(p.maps_url, ''))), '[?#].*$', ''), '/+$', '') =
             regexp_replace(regexp_replace(lower(trim(v_place_json->>'source_url')), '[?#].*$', ''), '/+$', '')
         )
       )
       or (
         nullif(trim(v_place_json->>'maps_url'), '') is not null
         and (
           regexp_replace(regexp_replace(lower(trim(coalesce(p.source_url, ''))), '[?#].*$', ''), '/+$', '') =
             regexp_replace(regexp_replace(lower(trim(v_place_json->>'maps_url')), '[?#].*$', ''), '/+$', '')
           or regexp_replace(regexp_replace(lower(trim(coalesce(p.maps_url, ''))), '[?#].*$', ''), '/+$', '') =
             regexp_replace(regexp_replace(lower(trim(v_place_json->>'maps_url')), '[?#].*$', ''), '/+$', '')
         )
       )
       or (
         nullif(trim(v_place_json->>'name'), '') is not null
         and nullif(trim(v_place_json->>'address'), '') is not null
         and lower(regexp_replace(trim(p.name) || '|' || trim(p.address), '\s+', ' ', 'g')) =
             lower(regexp_replace(trim(v_place_json->>'name') || '|' || trim(v_place_json->>'address'), '\s+', ' ', 'g'))
       )
    ) then
      insert into public.places
      select (jsonb_populate_record(null::public.places, v_place_json)).*
      on conflict do nothing;
      get diagnostics v_inserted = row_count;
      if v_inserted = 1 then v_outcome := 'saved'; end if;
    end if;
  end if;

  update public.scrape_jobs
     set total_found = total_found + 1,
         total_collected = total_collected + case when v_outcome = 'saved' then 1 else 0 end,
         total_duplicates = total_duplicates + case when v_outcome = 'duplicate' then 1 else 0 end,
         heartbeat_at = now()
   where id = p_job_id and user_id = p_user_id;

  select * into v_job from public.scrape_jobs where id = p_job_id;
  return jsonb_build_object(
    'outcome', v_outcome,
    'total_found', v_job.total_found,
    'total_collected', v_job.total_collected,
    'total_duplicates', v_job.total_duplicates,
    'total_errors', v_job.total_errors
  );
end;
$$;

create or replace function public.record_scrape_place_error(
  p_job_id text,
  p_user_id text,
  p_lease_token uuid,
  p_lease_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.scrape_jobs%rowtype;
begin
  update public.scrape_jobs
     set total_found = total_found + 1,
         total_errors = total_errors + 1,
         heartbeat_at = now()
   where id = p_job_id
     and user_id = p_user_id
     and status = 'running'
     and worker_lease_token = p_lease_token
     and worker_lease_generation = p_lease_generation
     and worker_locked_until > now()
  returning * into v_job;

  if not found then raise exception 'scrape job lease lost while recording extraction failure'; end if;

  return jsonb_build_object(
    'total_found', v_job.total_found,
    'total_collected', v_job.total_collected,
    'total_duplicates', v_job.total_duplicates,
    'total_errors', v_job.total_errors
  );
end;
$$;

revoke all on function public.claim_scrape_job_lease(text,text,uuid,integer) from public, anon, authenticated;
revoke all on function public.renew_scrape_job_lease(text,text,uuid,bigint,integer) from public, anon, authenticated;
revoke all on function public.release_scrape_job_lease(text,text,uuid,bigint) from public, anon, authenticated;
revoke all on function public.is_scrape_place_duplicate(text,text) from public, anon, authenticated;
revoke all on function public.persist_scraped_place(text,text,jsonb,text,text,uuid,bigint) from public, anon, authenticated;
revoke all on function public.record_scrape_place_error(text,text,uuid,bigint) from public, anon, authenticated;
grant execute on function public.claim_scrape_job_lease(text,text,uuid,integer) to service_role;
grant execute on function public.renew_scrape_job_lease(text,text,uuid,bigint,integer) to service_role;
grant execute on function public.release_scrape_job_lease(text,text,uuid,bigint) to service_role;
grant execute on function public.is_scrape_place_duplicate(text,text) to service_role;
grant execute on function public.persist_scraped_place(text,text,jsonb,text,text,uuid,bigint) to service_role;
grant execute on function public.record_scrape_place_error(text,text,uuid,bigint) to service_role;
