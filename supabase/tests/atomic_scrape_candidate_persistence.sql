-- Transactional integration test for atomic scrape candidate persistence.
-- Run only after applying 20261101035329_atomic_scrape_candidate_persistence.sql.
-- All fixture rows are rolled back; no production data is retained.

begin;

do $test$
declare
  v_user_id text := 'test_user_' || gen_random_uuid()::text;
  v_session_id text := 'test_session_' || gen_random_uuid()::text;
  v_job_id text := 'test_job_' || gen_random_uuid()::text;
  v_lease_token uuid := gen_random_uuid();
  v_first jsonb;
  v_repeat jsonb;
  v_saved jsonb;
  v_saved_repeat jsonb;
  v_second_candidate jsonb;
  v_duplicate jsonb;
  v_third_candidate jsonb;
  v_name_duplicate jsonb;
  v_place_count integer;
  v_job public.scrape_jobs%rowtype;
begin
  insert into public.app_users (id, email, name, password_hash, role)
  values (v_user_id, v_user_id || '@example.invalid', 'Atomic test', 'not-a-real-password', 'user');

  insert into public.scrape_search_sessions (
    id, user_id, scope_key, segment, location, next_ordinal,
    lease_token, lease_generation, lease_expires_at
  ) values (
    v_session_id, v_user_id, gen_random_uuid()::text, 'cafeterias', 'São Paulo, SP',
    0, v_lease_token, 1, now() + interval '5 minutes'
  );

  insert into public.scrape_jobs (
    id, user_id, search_session_id, segment, location, limit_requested, status
  ) values (
    v_job_id, v_user_id, v_session_id, 'cafeterias', 'São Paulo, SP', 2, 'running'
  );

  v_first := public.register_scrape_candidate(
    'test_candidate_1', v_job_id, v_user_id, v_session_id,
    'stable-place-key-1', '0x123:0x456', 'https://maps.example/place/one', v_lease_token, 1
  );
  v_repeat := public.register_scrape_candidate(
    'test_candidate_1_repeat', v_job_id, v_user_id, v_session_id,
    'stable-place-key-1', '0x123:0x456', 'https://maps.example/place/one', v_lease_token, 1
  );

  if v_first->>'candidate_id' <> v_repeat->>'candidate_id'
     or (v_repeat->>'inserted')::boolean is distinct from false then
    raise exception 'candidate registration is not idempotent';
  end if;

  v_saved := public.complete_scrape_candidate(
    v_first->>'candidate_id', v_job_id, v_user_id, v_session_id,
    'saved',
    jsonb_build_object(
      'id', 'test_place_1',
      'job_id', v_job_id,
      'name', 'Café de Teste',
      'category', 'Cafeteria',
      'address', 'Rua de Teste, 100',
      'source_place_id', '0x123:0x456',
      'source_url', 'https://maps.example/place/one',
      'maps_url', 'https://maps.example/place/one'
    ),
    'stable-place-key-1',
    'https://maps.example/place/one',
    v_lease_token, 1
  );

  v_saved_repeat := public.complete_scrape_candidate(
    v_first->>'candidate_id', v_job_id, v_user_id, v_session_id,
    'saved',
    jsonb_build_object('id', 'test_place_1', 'name', 'Café de Teste', 'address', 'Rua de Teste, 100'),
    'stable-place-key-1',
    'https://maps.example/place/one',
    v_lease_token, 1
  );

  if v_saved->>'outcome' <> 'saved'
     or (v_saved_repeat->>'already_completed')::boolean is distinct from true then
    raise exception 'candidate completion is not idempotent';
  end if;

  v_second_candidate := public.register_scrape_candidate(
    'test_candidate_2', v_job_id, v_user_id, v_session_id,
    'stable-place-key-2', '0x123:0x456', 'https://maps.example/place/two', v_lease_token, 1
  );

  v_duplicate := public.complete_scrape_candidate(
    v_second_candidate->>'candidate_id', v_job_id, v_user_id, v_session_id,
    'saved',
    jsonb_build_object(
      'id', 'test_place_2',
      'job_id', v_job_id,
      'name', 'Café de Teste',
      'category', 'Cafeteria',
      'address', 'Rua de Teste, 100',
      'source_place_id', '0x123:0x456',
      'source_url', 'https://maps.example/place/two',
      'maps_url', 'https://maps.example/place/two'
    ),
    'stable-place-key-2',
    'https://maps.example/place/two',
    v_lease_token, 1
  );

  v_third_candidate := public.register_scrape_candidate(
    'test_candidate_3', v_job_id, v_user_id, v_session_id,
    'stable-place-key-3', '0x999:0x888', 'https://maps.example/place/three', v_lease_token, 1
  );

  v_name_duplicate := public.complete_scrape_candidate(
    v_third_candidate->>'candidate_id', v_job_id, v_user_id, v_session_id,
    'saved',
    jsonb_build_object(
      'id', 'test_place_3',
      'job_id', v_job_id,
      'name', 'Café de Teste',
      'category', 'Cafeteria',
      'address', 'Rua de Teste, 100',
      'source_place_id', '0x999:0x888',
      'source_url', 'https://maps.example/place/three',
      'maps_url', 'https://maps.example/place/three'
    ),
    'stable-place-key-3',
    'https://maps.example/place/three',
    v_lease_token, 1
  );

  select count(*) into v_place_count
    from public.places where job_id = v_job_id;
  select * into v_job from public.scrape_jobs where id = v_job_id;

  if v_second_candidate->>'status' <> 'duplicate' then
    raise exception 'feed-level fast-path did not reject known duplicate';
  end if;
  if v_duplicate->>'outcome' <> 'duplicate' then
    raise exception 'global source_place_id duplicate was not rejected';
  end if;
  if v_name_duplicate->>'outcome' <> 'duplicate' then
    raise exception 'name/address duplicate was not rejected at atomic persistence';
  end if;
  if v_place_count <> 1 then
    raise exception 'expected exactly one persisted place, got %', v_place_count;
  end if;
  if v_job.total_collected <> 1 or v_job.total_duplicates <> 2 or v_job.candidate_cursor <> 3 then
    raise exception 'unexpected counters: collected %, duplicates %, cursor %',
      v_job.total_collected, v_job.total_duplicates, v_job.candidate_cursor;
  end if;
  if v_job.discovery_checkpoint->>'last_processed_outcome' <> 'duplicate' then
    raise exception 'checkpoint did not advance with duplicate outcome';
  end if;
end;
$test$;

rollback;
