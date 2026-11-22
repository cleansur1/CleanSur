create or replace function public.stayclean_staff_manage_history(p_number text, p_action text, p_method text default null)
returns void language plpgsql security definer set search_path=''
as $$
declare
  pedido public.orders;
  venta public.sales;
  linea record;
  stock numeric;
begin
  if auth.uid() is null or public.stayclean_is_staff() is not true then
    raise exception 'Acceso no autorizado' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('edit','void') then raise exception 'Acción inválida'; end if;
  if p_action='edit' and (p_method is null or p_method not in ('Efectivo contra entrega','Transferencia Bancaria','Cuenta Corriente','Mercado Pago')) then
    raise exception 'Medio de pago inválido';
  end if;

  select * into pedido from public.orders
    where order_number=p_number or converted_to_sale_number=p_number for update;
  if not found or pedido.mercadopago_order_id is not null
    or coalesce(pedido.payment_status,'PENDIENTE') <> 'PENDIENTE' then
    raise exception 'Solo se admiten cambios en pedidos pendientes de pago sin operación de Mercado Pago';
  end if;
  if pedido.status='CANCELADO' then
    if p_action='void' then return; end if;
    raise exception 'El pedido está anulado';
  end if;

  if pedido.converted_to_sale_number is null then
    if p_action='edit' then
      perform public.stayclean_staff_edit_order_payment(pedido.order_number,p_method);
    else
      perform public.cancel_order_with_stock_restoration(pedido.id,'Anulado desde el historial de ventas');
    end if;
    return;
  end if;

  select * into venta from public.sales where sale_number=pedido.converted_to_sale_number for update;
  if not found or venta.status <> 'COMPLETADA' or venta.payment_status is distinct from 'PENDIENTE'
    or venta.arca_invoice_id is not null then
    raise exception 'La venta está cerrada, cobrada o tiene factura fiscal';
  end if;

  if p_action='edit' then
    update public.sales set payment_method=p_method where id=venta.id;
    update public.orders set payment_method=p_method,updated_at=now() where id=pedido.id;
    return;
  end if;

  if pedido.stock_deducted is not true or pedido.stock_restored is true then
    raise exception 'No se pudo comprobar la salida de stock del pedido';
  end if;
  for linea in
    select product_id, sum(-quantity_base) as qty
    from public.inventory_movements where reference_type='PEDIDO_WEB'
      and reference_id=pedido.id and quantity_base<0 group by product_id order by product_id
  loop
    select current_stock into strict stock from public.products where id=linea.product_id for update;
    update public.products set current_stock=stock+linea.qty,updated_at=now() where id=linea.product_id;
    insert into public.inventory_movements(id,product_id,product_name,movement_type,quantity_base,
      quantity_input,unit_used,previous_stock,new_stock,reference_type,reference_id,notes)
    select gen_random_uuid()::text,id,name,'REINTEGRO_PEDIDO',linea.qty,linea.qty,base_unit,stock,
      stock+linea.qty,'CANCELACION_PEDIDO',pedido.id,'Anulado desde el historial de ventas'
    from public.products where id=linea.product_id;
  end loop;
  if not found then raise exception 'No se encontraron movimientos del pedido'; end if;
  update public.sales set status='ANULADA' where id=venta.id;
  update public.orders set status='CANCELADO',stock_restored=true,updated_at=now(),
    cancellation_reason='Anulado desde el historial de ventas' where id=pedido.id;
end;
$$;
revoke all on function public.stayclean_staff_manage_history(text,text,text) from public, anon;
grant execute on function public.stayclean_staff_manage_history(text,text,text) to authenticated;
