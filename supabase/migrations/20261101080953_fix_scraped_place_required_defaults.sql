-- Ensure minimal but valid extractor payloads receive defaults for required places columns.
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
      'maps_url', coalesce(nullif(p_place->>'maps_url', ''), p_source_url, ''),
      'description', coalesce(p_place->>'description', ''),
      'services_attributes', coalesce(p_place->>'services_attributes', ''),
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

revoke all on function public.persist_scraped_place(text,text,jsonb,text,text,uuid,bigint) from public, anon, authenticated;
grant execute on function public.persist_scraped_place(text,text,jsonb,text,text,uuid,bigint) to service_role;
