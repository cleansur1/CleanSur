create or replace function public.stayclean_staff_convert_order(p_order_id text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  pedido public.orders;
  venta public.sales;
begin
  if auth.uid() is null or public.stayclean_is_staff() is not true then
    raise exception 'Acceso no autorizado' using errcode = '42501';
  end if;

  select * into pedido from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido inexistente'; end if;

  if pedido.converted_to_sale_number is not null then
    return jsonb_build_object('sale_number', pedido.converted_to_sale_number);
  end if;
  if upper(pedido.status) not in ('NUEVO', 'PREPARANDO', 'LISTO')
    or pedido.stock_deducted is not true or pedido.stock_restored is true then
    raise exception 'El pedido no está listo para convertirse en venta';
  end if;

  insert into public.sales(id,sale_number,date,customer_id,customer_name,items,subtotal,total,
                           payment_method,payment_status,status,user_name,notes)
  values ('order-' || pedido.id, 'VT-' || pedido.order_number, current_date, pedido.customer_id,
          pedido.customer_name, pedido.items, pedido.subtotal, pedido.total, pedido.payment_method,
          coalesce(pedido.payment_status,'PENDIENTE'),'COMPLETADA',auth.uid()::text,
          'Venta originada del pedido ' || pedido.order_number)
  returning * into venta;

  update public.orders set status='ENTREGADO', converted_to_sale_number=venta.sale_number,
    updated_at=now() where id=pedido.id;

  return jsonb_build_object('sale_number', venta.sale_number);
end;
$$;
revoke all on function public.stayclean_staff_convert_order(text) from public, anon;
grant execute on function public.stayclean_staff_convert_order(text) to authenticated;
