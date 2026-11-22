create or replace function public.stayclean_staff_cash_register(p_action text default 'read', p_cash numeric default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  day_ar date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  register public.cash_registers;
  cash_sales numeric;
  cash_expenses numeric;
  expected numeric;
  register_day date;
begin
  if auth.uid() is null or public.stayclean_is_staff() is not true then
    raise exception 'Acceso no autorizado' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('read','open','close') then
    raise exception 'Acción inválida';
  end if;
  if p_action <> 'read' and not coalesce(p_cash between 0 and 999999999 and p_cash=round(p_cash,2),false) then
    raise exception 'Ingresá un importe válido';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(629411784);
  select * into register from public.cash_registers
  where status='ABIERTA' or (open_date at time zone 'America/Argentina/Buenos_Aires')::date=day_ar
  order by (status='ABIERTA') desc, open_date desc limit 1;

  if p_action='open' then
    if register.id is not null then raise exception 'Ya hay una caja registrada'; end if;
    insert into public.cash_registers(id,open_date,initial_cash,status)
    values(gen_random_uuid()::text,now(),p_cash,'ABIERTA') returning * into register;
  end if;

  register_day := coalesce((register.open_date at time zone 'America/Argentina/Buenos_Aires')::date,day_ar);
  select coalesce(sum(total),0) into cash_sales from public.sales
    where date=register_day and status='COMPLETADA' and upper(payment_status) in ('PAGADO','PAGADA','COBRADO','COBRADA','APROBADO','APROBADA')
      and lower(payment_method) in ('efectivo','efectivo contra entrega');
  select coalesce(sum(amount),0) into cash_expenses from public.expenses
    where date=register_day and lower(payment_method)='efectivo';
  expected := coalesce(register.initial_cash,0)+cash_sales-cash_expenses;

  if p_action='close' then
    if register.status is distinct from 'ABIERTA' then raise exception 'No hay una caja abierta'; end if;
    update public.cash_registers set close_date=now(),status='CERRADA',final_cash_expected=expected,
      final_cash_counted=p_cash,difference=p_cash-expected,notes=left(p_notes,500)
    where id=register.id returning * into register;
  end if;
  return jsonb_build_object('date',register_day,'register',to_jsonb(register),
    'cash_sales',cash_sales,'cash_expenses',cash_expenses,
    'expected',coalesce(register.final_cash_expected,expected),
    'history',(select coalesce(jsonb_agg(to_jsonb(r) order by open_date desc),'[]'::jsonb)
       from (select * from public.cash_registers where status='CERRADA' order by open_date desc limit 30) r));
end;
$$;
revoke all on function public.stayclean_staff_cash_register(text,numeric,text) from public,anon;
grant execute on function public.stayclean_staff_cash_register(text,numeric,text) to authenticated;
