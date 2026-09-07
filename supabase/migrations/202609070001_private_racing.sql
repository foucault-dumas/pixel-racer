-- Additive migration, dedicated to Pixel Racer. Execute once in SQL Editor.
begin;

create table public.pixel_racer_rooms (
  id uuid primary key,
  version integer not null default 0 check (version >= 0),
  invite_hash text not null check (length(invite_hash) = 64),
  document jsonb not null check (jsonb_typeof(document) = 'object' and octet_length(document::text) <= 2000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pixel_racer_rooms_updated_at on public.pixel_racer_rooms(updated_at);
alter table public.pixel_racer_rooms enable row level security;
revoke all on public.pixel_racer_rooms from public, anon, authenticated;
grant select, insert, update on public.pixel_racer_rooms to service_role;

create table public.pixel_racer_limits (
  key text primary key,
  hits integer not null,
  expires_at timestamptz not null
);
create index pixel_racer_limits_expiry on public.pixel_racer_limits(expires_at);
alter table public.pixel_racer_limits enable row level security;
revoke all on public.pixel_racer_limits from public, anon, authenticated;
grant select, insert, update, delete on public.pixel_racer_limits to service_role;

-- An atomic, persisted limiter: serverless instances share the same counters.
-- Invoker rights; only the backend service_role can call this function.
create function public.pixel_racer_rate_limit(bucket_key text, max_hits integer, window_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare total integer;
begin
  if length(bucket_key) > 100 or max_hits < 1 or max_hits > 1000 or window_seconds < 1 or window_seconds > 3600 then
    raise exception 'Invalid rate limit';
  end if;
  delete from public.pixel_racer_limits where key in (
    select key from public.pixel_racer_limits where expires_at < now() order by expires_at limit 100
  );
  insert into public.pixel_racer_limits as limits (key, hits, expires_at)
    values (bucket_key, 1, now() + make_interval(secs => window_seconds))
    on conflict (key) do update set
      hits = case when limits.expires_at <= now() then 1 else least(limits.hits + 1, max_hits + 1) end,
      expires_at = case when limits.expires_at <= now() then now() + make_interval(secs => window_seconds) else limits.expires_at end
    returning hits into total;
  return total <= max_hits;
end;
$$;
revoke all on function public.pixel_racer_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.pixel_racer_rate_limit(text,integer,integer) to service_role;
grant usage on schema public to service_role;
commit;
