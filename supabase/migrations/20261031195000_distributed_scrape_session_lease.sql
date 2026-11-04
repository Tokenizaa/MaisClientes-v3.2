-- Distributed, fenced lease for one durable Maps search session.
alter table public.scrape_search_sessions
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists lease_generation bigint not null default 0;

create index if not exists scrape_search_sessions_lease_expiry_idx
  on public.scrape_search_sessions (lease_expires_at);

create or replace function public.claim_scrape_search_session(
  p_session_id text,
  p_user_id text,
  p_lease_token uuid,
  p_lease_seconds integer default 90
)
returns table (acquired boolean, generation bigint, lease_expires_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_lease_seconds < 15 or p_lease_seconds > 300 then
    raise exception 'invalid lease duration';
  end if;

  return query
  update public.scrape_search_sessions s
     set lease_token = p_lease_token,
         lease_generation = s.lease_generation + 1,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where s.id = p_session_id
     and s.user_id = p_user_id
     and (s.lease_expires_at is null or s.lease_expires_at <= now())
  returning true, s.lease_generation, s.lease_expires_at;

  if not found then
    return query
    select false, s.lease_generation, s.lease_expires_at
      from public.scrape_search_sessions s
     where s.id = p_session_id and s.user_id = p_user_id;
  end if;
end;
$$;

create or replace function public.renew_scrape_search_session_lease(
  p_session_id text,
  p_user_id text,
  p_lease_token uuid,
  p_generation bigint,
  p_lease_seconds integer default 90
)
returns boolean
language sql
security invoker
set search_path = public, pg_temp
as $$
  with renewed as (
    update public.scrape_search_sessions
       set lease_expires_at = now() + make_interval(secs => p_lease_seconds),
           updated_at = now()
     where id = p_session_id
       and user_id = p_user_id
       and lease_token = p_lease_token
       and lease_generation = p_generation
       and lease_expires_at > now()
    returning 1
  )
  select exists(select 1 from renewed);
$$;

create or replace function public.release_scrape_search_session_lease(
  p_session_id text,
  p_user_id text,
  p_lease_token uuid,
  p_generation bigint
)
returns boolean
language sql
security invoker
set search_path = public, pg_temp
as $$
  with released as (
    update public.scrape_search_sessions
       set lease_token = null,
           lease_expires_at = null,
           updated_at = now()
     where id = p_session_id
       and user_id = p_user_id
       and lease_token = p_lease_token
       and lease_generation = p_generation
    returning 1
  )
  select exists(select 1 from released);
$$;

revoke all on function public.claim_scrape_search_session(text,text,uuid,integer) from public, anon, authenticated;
revoke all on function public.renew_scrape_search_session_lease(text,text,uuid,bigint,integer) from public, anon, authenticated;
revoke all on function public.release_scrape_search_session_lease(text,text,uuid,bigint) from public, anon, authenticated;
grant execute on function public.claim_scrape_search_session(text,text,uuid,integer) to service_role;
grant execute on function public.renew_scrape_search_session_lease(text,text,uuid,bigint,integer) to service_role;
grant execute on function public.release_scrape_search_session_lease(text,text,uuid,bigint) to service_role;
