-- StayClean Mercado Pago Checkout Pro (Orders API) - staged integration
-- This migration is intentionally stored on the feature branch first; it is not applied to production.

create table if not exists public.stayclean_mp_payment_intents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  customer_id text not null references public.customers(id) on delete restrict,
  customer_snapshot jsonb not null,
  items_snapshot jsonb not null,
  total_amount numeric(14,2) not null check (total_amount > 0),
  currency text not null default 'ARS',
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','expired','fulfillment_review')),
  mp_order_id text unique,
  mp_status text,
  mp_status_detail text,
  mp_total_paid numeric(14,2),
  order_id text references public.orders(id),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stayclean_mp_intents_pending_expiry_idx
  on public.stayclean_mp_payment_intents (expires_at)
  where status = 'pending';
alter table public.stayclean_mp_payment_intents enable row level security;

alter table public.orders
  add column if not exists payment_status text,
  add column if not exists mercadopago_order_id text,
  add column if not exists mercadopago_status_detail text;

create unique index if not exists orders_mercadopago_order_id_uidx
  on public.orders (mercadopago_order_id)
  where mercadopago_order_id is not null;

create or replace function public.stayclean_create_mp_payment_intent(
  p_request_id uuid,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id text;
  v_customer public.customers%rowtype;
  v_item record;
  v_product public.products%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric(14,2) := 0;
  v_qty numeric;
  v_reserved numeric;
  v_intent public.stayclean_mp_payment_intents%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para comprar' using errcode='42501';
  end if;
  if p_request_id is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Carrito o identificador inválido';
  end if;

  select customer_id into v_customer_id
  from public.stayclean_customer_accounts
  where auth_user_id = auth.uid();

  if v_customer_id is null then
    raise exception 'Completá tu perfil de cliente antes de comprar';
  end if;

  select * into v_customer from public.customers
  where id = v_customer_id and active is true;
  if not found or coalesce(trim(v_customer.email),'') = '' then
    raise exception 'El perfil debe tener un correo válido para pagar online';
  end if;

  select * into v_intent
  from public.stayclean_mp_payment_intents
  where request_id = p_request_id and auth_user_id = auth.uid()
  for update;
  if found then
    if v_intent.status <> 'pending' or v_intent.expires_at <= now() then
      raise exception 'Este intento de compra ya no está disponible. Volvé a intentar.';
    end if;
    return jsonb_build_object(
      'intent_id',v_intent.id,'total_amount',v_intent.total_amount,
      'items',v_intent.items_snapshot,'customer',v_intent.customer_snapshot,
      'mp_order_id',v_intent.mp_order_id,'expires_at',v_intent.expires_at
    );
  end if;

  for v_item in
    select x.product_id, sum(x.quantity)::numeric as quantity
    from jsonb_to_recordset(p_items) as x(product_id text, quantity numeric)
    group by x.product_id order by x.product_id
  loop
    if v_item.product_id is null or v_item.quantity is null
       or v_item.quantity <= 0 or v_item.quantity > 10000
       or v_item.quantity <> trunc(v_item.quantity) then
      raise exception 'Cantidad inválida';
    end if;

    select * into v_product
    from public.products
    where id = v_item.product_id
    for update;

    if not found or v_product.active is distinct from true
       or v_product.publish_online is distinct from true
       or coalesce(v_product.sale_price,0) <= 0
       or coalesce(v_product.sale_to_base_factor,0) <= 0 then
      raise exception 'Producto no disponible';
    end if;

    select coalesce(sum((line->>'quantity_base')::numeric),0)
    into v_reserved
    from public.stayclean_mp_payment_intents i
    cross join lateral jsonb_array_elements(i.items_snapshot) line
    where i.status = 'pending' and i.expires_at > now()
      and line->>'product_id' = v_product.id;

    v_qty := v_item.quantity * v_product.sale_to_base_factor;
    if v_product.current_stock - v_reserved < v_qty then
      raise exception 'Stock insuficiente para %', v_product.name;
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',v_product.id,
      'product_name',v_product.name,
      'quantity',v_item.quantity,
      'quantity_base',v_qty,
      'factor_to_base',v_product.sale_to_base_factor,
      'unit_name',v_product.sale_unit,
      'unit_price',v_product.sale_price,
      'subtotal',round(v_item.quantity * v_product.sale_price,2)
    ));
    v_total := v_total + v_item.quantity * v_product.sale_price;
  end loop;

  insert into public.stayclean_mp_payment_intents(
    request_id,auth_user_id,customer_id,customer_snapshot,items_snapshot,total_amount
  ) values (
    p_request_id,auth.uid(),v_customer_id,
    jsonb_build_object(
      'name',v_customer.name,'phone',v_customer.phone,'email',v_customer.email,
      'address',v_customer.address,'city',v_customer.city
    ),
    v_lines,round(v_total,2)
  ) returning * into v_intent;

  return jsonb_build_object(
    'intent_id',v_intent.id,'total_amount',v_intent.total_amount,
    'items',v_intent.items_snapshot,'customer',v_intent.customer_snapshot,
    'mp_order_id',null,'expires_at',v_intent.expires_at
  );
end;
$$;

revoke all on function public.stayclean_create_mp_payment_intent(uuid,jsonb) from public, anon;
grant execute on function public.stayclean_create_mp_payment_intent(uuid,jsonb) to authenticated;

create or replace function public.stayclean_finalize_mp_payment(
  p_intent_id uuid,
  p_mp_order_id text,
  p_mp_status text,
  p_mp_status_detail text,
  p_total_paid numeric
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.stayclean_mp_payment_intents%rowtype;
  v_line jsonb;
  v_product public.products%rowtype;
  v_before numeric;
  v_need numeric;
  v_order_id text := gen_random_uuid()::text;
  v_order_number text;
  v_lines jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'No autorizado' using errcode='42501';
  end if;

  select * into v_intent
  from public.stayclean_mp_payment_intents
  where id = p_intent_id
  for update;

  if not found then raise exception 'Intento de pago inexistente'; end if;
  if v_intent.status = 'approved' and v_intent.order_id is not null then
    return jsonb_build_object('success',true,'order_id',v_intent.order_id,'replayed',true);
  end if;
  if v_intent.mp_order_id is distinct from p_mp_order_id then
    raise exception 'La orden de Mercado Pago no coincide';
  end if;
  if p_mp_status <> 'processed' or p_mp_status_detail <> 'accredited'
     or round(coalesce(p_total_paid,0),2) <> round(v_intent.total_amount,2) then
    raise exception 'El pago no está acreditado por el importe esperado';
  end if;

  for v_line in select value from jsonb_array_elements(v_intent.items_snapshot)
  loop
    select * into v_product from public.products
    where id = v_line->>'product_id' for update;
    v_need := (v_line->>'quantity_base')::numeric;
    if not found or v_product.current_stock < v_need then
      update public.stayclean_mp_payment_intents
      set status='fulfillment_review',mp_status=p_mp_status,
          mp_status_detail=p_mp_status_detail,mp_total_paid=p_total_paid,updated_at=now()
      where id=p_intent_id;
      raise exception 'Pago acreditado pero stock insuficiente: requiere revisión manual';
    end if;
  end loop;

  v_order_number := 'PED-' || lpad(nextval('public.stayclean_order_seq')::text,6,'0');
  v_lines := v_intent.items_snapshot;

  insert into public.orders(
    id,order_number,request_id,customer_id,customer_name,customer_phone,customer_email,
    delivery_address,delivery_city,payment_method,items,subtotal,total,status,source,
    stock_deducted,stock_restored,payment_status,mercadopago_order_id,mercadopago_status_detail
  ) values (
    v_order_id,v_order_number,v_intent.request_id,v_intent.customer_id,
    v_intent.customer_snapshot->>'name',v_intent.customer_snapshot->>'phone',
    v_intent.customer_snapshot->>'email',v_intent.customer_snapshot->>'address',
    v_intent.customer_snapshot->>'city','Mercado Pago',v_lines,
    v_intent.total_amount,v_intent.total_amount,'NUEVO','TIENDA_ONLINE',
    true,false,'approved',p_mp_order_id,p_mp_status_detail
  );

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    v_need := (v_line->>'quantity_base')::numeric;
    select current_stock into v_before from public.products
    where id=v_line->>'product_id' for update;
    update public.products
    set current_stock=current_stock-v_need,updated_at=now(),last_sale_date=current_date
    where id=v_line->>'product_id';
    insert into public.inventory_movements(
      id,product_id,product_name,movement_type,quantity_base,unit_used,quantity_input,
      previous_stock,new_stock,reference_type,reference_id
    ) values (
      gen_random_uuid()::text,v_line->>'product_id',v_line->>'product_name',
      'PEDIDO_WEB',-v_need,v_line->>'unit_name',(v_line->>'quantity')::numeric,
      v_before,v_before-v_need,'PEDIDO_WEB',v_order_id
    );
  end loop;

  update public.stayclean_mp_payment_intents
  set status='approved',mp_status=p_mp_status,mp_status_detail=p_mp_status_detail,
      mp_total_paid=p_total_paid,order_id=v_order_id,updated_at=now()
  where id=p_intent_id;

  return jsonb_build_object('success',true,'order_id',v_order_id,'order_number',v_order_number,'total',v_intent.total_amount,'stock_deducted',true);
end;
$$;

revoke all on function public.stayclean_finalize_mp_payment(uuid,text,text,text,numeric) from public, anon, authenticated;
grant execute on function public.stayclean_finalize_mp_payment(uuid,text,text,text,numeric) to service_role;
