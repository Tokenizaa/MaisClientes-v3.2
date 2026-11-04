-- Integration test for the simplified job lease and atomic place persistence.
-- Run after 20261101080912_simplify_scrape_job_persistence.sql.
-- All fixtures are rolled back.

begin;

do $test$
declare
  v_user_id text := 'test_user_' || gen_random_uuid()::text;
  v_job_id text := 'test_job_' || gen_random_uuid()::text;
  v_lease_token uuid := gen_random_uuid();
  v_lease record;
  v_saved jsonb;
  v_feed_duplicate jsonb;
  v_name_duplicate jsonb;
  v_error jsonb;
  v_job public.scrape_jobs%rowtype;
  v_place_count integer;
begin
  insert into public.app_users (id, email, name, password_hash, role)
  values (v_user_id, v_user_id || '@example.invalid', 'Scrape job test', 'not-a-real-password', 'user');

  insert into public.scrape_jobs (
    id, user_id, segment, location, limit_requested, status
  ) values (
    v_job_id, v_user_id, 'cafeterias', 'São Paulo, SP', 2, 'running'
  );

  select * into v_lease
    from public.claim_scrape_job_lease(v_job_id, v_user_id, v_lease_token, 90);
  if v_lease.acquired is distinct from true then
    raise exception 'job lease was not acquired';
  end if;

  if public.is_scrape_place_duplicate('0x123:0x456', 'https://maps.example/place/one') then
    raise exception 'new feed result was incorrectly classified as duplicate';
  end if;

  v_saved := public.persist_scraped_place(
    v_job_id, v_user_id,
    jsonb_build_object(
      'id', 'test_place_1', 'name', 'Café de Teste', 'category', 'Cafeteria',
      'address', 'Rua de Teste, 100', 'source_place_id', '0x123:0x456',
      'source_url', 'https://maps.example/place/one', 'maps_url', 'https://maps.example/place/one'
    ),
    '0x123:0x456', 'https://maps.example/place/one', v_lease_token, v_lease.generation
  );

  if v_saved->>'outcome' <> 'saved' then
    raise exception 'new place was not saved atomically';
  end if;

  if not public.is_scrape_place_duplicate('0x123:0x456', 'https://maps.example/place/other') then
    raise exception 'feed-level duplicate check did not find existing Place ID';
  end if;

  v_feed_duplicate := public.persist_scraped_place(
    v_job_id, v_user_id, null,
    '0x123:0x456', 'https://maps.example/place/other', v_lease_token, v_lease.generation
  );

  v_name_duplicate := public.persist_scraped_place(
    v_job_id, v_user_id,
    jsonb_build_object(
      'id', 'test_place_2', 'name', 'Café de Teste', 'category', 'Cafeteria',
      'address', 'Rua de Teste, 100', 'source_place_id', '0x999:0x888',
      'source_url', 'https://maps.example/place/two', 'maps_url', 'https://maps.example/place/two'
    ),
    '0x999:0x888', 'https://maps.example/place/two', v_lease_token, v_lease.generation
  );

  v_error := public.record_scrape_place_error(v_job_id, v_user_id, v_lease_token, v_lease.generation);

  select count(*) into v_place_count from public.places where job_id = v_job_id;
  select * into v_job from public.scrape_jobs where id = v_job_id;

  if v_feed_duplicate->>'outcome' <> 'duplicate' or v_name_duplicate->>'outcome' <> 'duplicate' then
    raise exception 'duplicate results were not discarded';
  end if;
  if v_place_count <> 1 then
    raise exception 'expected one persisted place, got %', v_place_count;
  end if;
  if v_job.total_found <> 4 or v_job.total_collected <> 1
     or v_job.total_duplicates <> 2 or v_job.total_errors <> 1 then
    raise exception 'unexpected counters: found %, saved %, duplicates %, errors %',
      v_job.total_found, v_job.total_collected, v_job.total_duplicates, v_job.total_errors;
  end if;

  select * into v_lease
    from public.claim_scrape_job_lease(v_job_id, v_user_id, gen_random_uuid(), 90);
  if v_lease.acquired is distinct from false then
    raise exception 'a second worker unexpectedly acquired an active job lease';
  end if;

  if not public.release_scrape_job_lease(v_job_id, v_user_id, v_lease_token, v_lease.generation) then
    raise exception 'job lease was not released';
  end if;
end;
$test$;

rollback;
