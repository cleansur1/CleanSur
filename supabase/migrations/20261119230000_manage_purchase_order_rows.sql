create or replace function public.stayclean_staff_manage_purchase_order(p_id text, p_expected jsonb, p_items jsonb)
returns public.purchase_orders language plpgsql security definer set search_path to '' as $$
declare current_order public.purchase_orders; estimated numeric;
begin
  if auth.uid() is null or not public.stayclean_is_staff() then
    raise exception 'Acceso de personal requerido' using errcode='42501';
  end if;
  select * into current_order from public.purchase_orders where id=p_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if p_items is null and current_order.status='Cancelada' then return current_order; end if;
  if lower(current_order.status) not in ('borrador','enviada','confirmada') or current_order.items is distinct from p_expected then
    raise exception 'La orden cambió o ya se cerró. Volvé a abrir el listado.';
  end if;
  if p_items is null then
    update public.purchase_orders set status='Cancelada' where id=p_id returning * into current_order;
  else
    if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then
      raise exception 'Seleccioná productos para la orden';
    end if;
    if exists (select 1 from jsonb_to_recordset(p_items) x(product_id text, quantity numeric, unit_cost numeric)
      left join public.products p on p.id=x.product_id
      where p.id is null or x.quantity is null or x.quantity<=0 or x.quantity>100000 or x.unit_cost is null or x.unit_cost<0)
    then raise exception 'Revisá los productos y cantidades'; end if;
    select round(sum(x.quantity*x.unit_cost),2) into estimated from jsonb_to_recordset(p_items) x(quantity numeric,unit_cost numeric);
    update public.purchase_orders set items=p_items,estimated_total=estimated where id=p_id returning * into current_order;
  end if;
  return current_order;
end;
$$;
revoke all on function public.stayclean_staff_manage_purchase_order(text,jsonb,jsonb) from public,anon;
grant execute on function public.stayclean_staff_manage_purchase_order(text,jsonb,jsonb) to authenticated;
