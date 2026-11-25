create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.cleansur_push_keys (
  singleton boolean primary key default true check (singleton),
  public_key text not null,
  private_key text not null
);
create table public.cleansur_push_devices (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth_secret text not null,
  registered_at timestamptz not null default now()
);
create table public.cleansur_push_deliveries (
  order_id text not null references public.orders(id) on delete cascade,
  endpoint text not null references public.cleansur_push_devices(endpoint) on delete cascade,
  queued_at timestamptz not null default now(),
  status text not null default 'pending',
  primary key (order_id, endpoint)
);
create index cleansur_push_pending on public.cleansur_push_deliveries (queued_at) where status = 'pending';
create table public.cleansur_order_reviews (
  order_id text primary key references public.orders(id) on delete cascade,
  reviewed_at timestamptz not null default now()
);
alter table public.cleansur_push_keys enable row level security;
alter table public.cleansur_push_devices enable row level security;
alter table public.cleansur_push_deliveries enable row level security;
alter table public.cleansur_order_reviews enable row level security;
revoke all on public.cleansur_push_keys, public.cleansur_push_devices,
  public.cleansur_push_deliveries, public.cleansur_order_reviews from public, anon, authenticated;
grant select, insert on public.cleansur_push_keys to service_role;
grant delete on public.cleansur_push_devices to service_role;
grant select (endpoint) on public.cleansur_push_devices to service_role;
grant update (status) on public.cleansur_push_deliveries to service_role;
grant select (order_id, endpoint, status) on public.cleansur_push_deliveries to service_role;

create function public.cleansur_push_settings(p_endpoint text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from public.staff_access where user_id = auth.uid() and active and role = 'ADMIN'
  ) then jsonb_build_object(
    'allowed', true,
    'publicKey', (select public_key from public.cleansur_push_keys),
    'active', exists (select 1 from public.cleansur_push_devices where endpoint = p_endpoint and user_id = auth.uid())
  ) else jsonb_build_object('allowed', false) end;
$$;

create function public.cleansur_push_device(p_endpoint text, p_key text default null, p_auth text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if p_key is null and p_auth is null then
    delete from public.cleansur_push_devices where endpoint = p_endpoint and user_id = auth.uid();
    return;
  end if;
  if not exists (select 1 from public.staff_access where user_id = auth.uid() and active and role = 'ADMIN') then
    raise insufficient_privilege;
  end if;
  if p_endpoint is null or length(p_endpoint) > 2048 or p_endpoint !~
    '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_./~:+?=&%!-]+$'
    or p_key is null or p_key !~ '^B[A-Za-z0-9_-]{86}$'
    or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'Suscripción push inválida';
  end if;
  insert into public.cleansur_push_devices (endpoint, user_id, p256dh, auth_secret)
  values (p_endpoint, auth.uid(), p_key, p_auth)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth_secret = excluded.auth_secret
    where cleansur_push_devices.user_id = auth.uid();
  if not found then raise insufficient_privilege; end if;
end;
$$;

create function public.cleansur_count_unreviewed_orders()
returns bigint language sql stable security definer set search_path = '' as $$
  select count(*) from public.orders o
    where public.stayclean_is_staff() and o.source = 'TIENDA_ONLINE' and upper(o.status) = 'NUEVO'
      and not exists (select 1 from public.cleansur_order_reviews r where r.order_id = o.id);
$$;

create function public.cleansur_review_order(p_order_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.stayclean_is_staff() then raise insufficient_privilege; end if;
  insert into public.cleansur_order_reviews (order_id)
    select id from public.orders where id = p_order_id and source = 'TIENDA_ONLINE'
    on conflict do nothing;
end;
$$;

create function public.cleansur_queue_order_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'TIENDA_ONLINE' and upper(new.status) = 'NUEVO' then
    insert into public.cleansur_push_deliveries (order_id, endpoint)
      select new.id, d.endpoint from public.cleansur_push_devices d
      join public.staff_access s on s.user_id = d.user_id and s.active and s.role = 'ADMIN'
      on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger cleansur_queue_order_push after insert on public.orders
for each row execute function public.cleansur_queue_order_push();

select vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'cleansur_order_push_dispatch');

create function public.cleansur_claim_order_push(p_dispatch text)
returns table(order_id text, endpoint text, p256dh text, auth_secret text)
language plpgsql security definer set search_path = '' as $$
begin
  if p_dispatch is null or not exists (
    select 1 from vault.decrypted_secrets where name = 'cleansur_order_push_dispatch'
      and decrypted_secret = p_dispatch
  ) then raise insufficient_privilege; end if;

  delete from public.cleansur_push_deliveries q where q.queued_at < now() - interval '7 days';
  return query
    with batch as (
      select q.order_id, q.endpoint from public.cleansur_push_deliveries q
      join public.cleansur_push_devices d using (endpoint)
      join public.staff_access s on s.user_id = d.user_id and s.active and s.role = 'ADMIN'
      where q.status = 'pending' and q.queued_at > now() - interval '1 day'
      order by q.queued_at limit 30 for update of q skip locked
    ), claimed as (
      update public.cleansur_push_deliveries q set status = 'claimed' from batch b
      where q.order_id = b.order_id and q.endpoint = b.endpoint
      returning q.order_id, q.endpoint
    )
    select c.order_id, c.endpoint, d.p256dh, d.auth_secret
      from claimed c join public.cleansur_push_devices d on d.endpoint = c.endpoint;
end;
$$;

revoke all on function public.cleansur_push_settings(text), public.cleansur_push_device(text,text,text),
  public.cleansur_count_unreviewed_orders(), public.cleansur_review_order(text),
  public.cleansur_queue_order_push(), public.cleansur_claim_order_push(text) from public, anon, authenticated;
grant execute on function public.cleansur_push_settings(text), public.cleansur_push_device(text,text,text),
  public.cleansur_count_unreviewed_orders(), public.cleansur_review_order(text) to authenticated;
grant execute on function public.cleansur_claim_order_push(text) to service_role;

select cron.schedule('cleansur-order-push', '30 seconds', $job$
  select net.http_post(
    url := 'https://zesdbnbijoqjjmwhuttp.supabase.co/functions/v1/cleansur-order-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cleansur-dispatch',
      (select decrypted_secret from vault.decrypted_secrets where name = 'cleansur_order_push_dispatch')),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
$job$);
