CREATE OR REPLACE FUNCTION public.create_web_order_with_stock_deduction(p_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_req uuid; v_old jsonb; v_lines jsonb:='[]'::jsonb; v_line record; v_p record;
v_need numeric; v_total numeric:=0; v_id text:=gen_random_uuid()::text; v_num text; v_before numeric; v_customer_id text;
 v_method text := coalesce(p_order->>'payment_method','A coordinar');
BEGIN
 IF auth.uid() is null then raise exception 'Iniciá sesión para comprar' using errcode='42501'; end if;
 IF v_method NOT IN ('Efectivo contra entrega','Transferencia Bancaria','Cuenta Corriente','A coordinar') THEN RAISE EXCEPTION 'Medio de pago inválido'; END IF;
 IF p_order IS NULL OR jsonb_typeof(p_order)<>'object' THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
 IF length(trim(coalesce(p_order->>'customer_name',''))) NOT BETWEEN 2 AND 200 OR
 length(trim(coalesce(p_order->>'customer_phone',''))) NOT BETWEEN 6 AND 50 OR
 length(trim(coalesce(p_order->>'delivery_address',''))) NOT BETWEEN 5 AND 500 OR
 p_order->>'delivery_city' NOT IN ('Caviahue','Copahue') THEN RAISE EXCEPTION 'Datos de entrega inválidos'; END IF;
 IF jsonb_typeof(p_order->'items') IS DISTINCT FROM 'array' OR
 jsonb_array_length(p_order->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Carrito inválido'; END IF;
 IF p_order->>'request_id' IS NULL THEN RAISE EXCEPTION 'Falta identificador'; END IF;
 v_req:=(p_order->>'request_id')::uuid;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_req::text,0));
 SELECT jsonb_build_object('success',true,'order_id',o.id,'order_number',o.order_number,'replayed',true)
 INTO v_old FROM public.orders o WHERE o.request_id=v_req;
 IF FOUND THEN RETURN v_old; END IF;
 FOR v_line IN SELECT x.product_id,sum(x.quantity) qty
 FROM jsonb_to_recordset(p_order->'items') AS x(product_id text,quantity numeric)
 GROUP BY x.product_id ORDER BY x.product_id LOOP
  IF v_line.product_id IS NULL OR v_line.qty IS NULL OR v_line.qty<=0 OR v_line.qty>10000
  OR v_line.qty<>trunc(v_line.qty) THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
  SELECT id,name,sale_unit,current_stock,sale_to_base_factor,sale_price,active,publish_online
  INTO v_p FROM public.products WHERE id=v_line.product_id FOR UPDATE;
  IF NOT FOUND OR v_p.active IS DISTINCT FROM true OR v_p.publish_online IS DISTINCT FROM true
  OR v_p.sale_price<=0 OR v_p.sale_to_base_factor<=0 THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
  v_need:=v_line.qty*v_p.sale_to_base_factor;
  IF v_p.current_stock<v_need THEN RAISE EXCEPTION 'Stock insuficiente para %',v_p.name; END IF;
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object('product_id',v_p.id,'product_name',v_p.name,
  'quantity',v_line.qty,'quantity_base',v_need,'factor_to_base',v_p.sale_to_base_factor,
  'unit_name',v_p.sale_unit,'unit_price',v_p.sale_price,'subtotal',v_line.qty*v_p.sale_price));
  v_total:=v_total+v_line.qty*v_p.sale_price;
 END LOOP;
 IF jsonb_array_length(v_lines)=0 THEN RAISE EXCEPTION 'Carrito vacío'; END IF;
 select customer_id into v_customer_id from public.stayclean_customer_accounts where auth_user_id=auth.uid();
 if v_customer_id is null then raise exception 'Completá tu perfil de cliente antes de comprar';end if;
 if not exists (select 1 from public.customers where id=v_customer_id and name=trim(p_order->>'customer_name') and phone=trim(p_order->>'customer_phone') and address=trim(p_order->>'delivery_address') and city=p_order->>'delivery_city') then raise exception 'Los datos de entrega deben coincidir con tu perfil';end if;
 v_num:='PED-'||lpad(nextval('public.stayclean_order_seq')::text,6,'0');
 INSERT INTO public.orders(id,order_number,request_id,customer_id,customer_name,customer_phone,
 customer_email,delivery_address,delivery_city,payment_method,items,subtotal,total,status,
 source,stock_deducted,stock_restored)
 VALUES(v_id,v_num,v_req,v_customer_id,trim(p_order->>'customer_name'),trim(p_order->>'customer_phone'),
 nullif(trim(coalesce(p_order->>'customer_email','')),''),trim(p_order->>'delivery_address'),
 p_order->>'delivery_city',v_method,v_lines,v_total,v_total,'NUEVO','TIENDA_ONLINE',true,false);
 FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
  v_need:=(v_line.value->>'quantity_base')::numeric;
  SELECT current_stock INTO v_before FROM public.products WHERE id=v_line.value->>'product_id' FOR UPDATE;
  UPDATE public.products SET current_stock=current_stock-v_need,updated_at=now(),last_sale_date=current_date
  WHERE id=v_line.value->>'product_id';
  INSERT INTO public.inventory_movements(id,product_id,product_name,movement_type,quantity_base,
  unit_used,quantity_input,previous_stock,new_stock,reference_type,reference_id)
  VALUES(gen_random_uuid()::text,v_line.value->>'product_id',v_line.value->>'product_name',
  'PEDIDO_WEB',-v_need,v_line.value->>'unit_name',(v_line.value->>'quantity')::numeric,
  v_before,v_before-v_need,'PEDIDO_WEB',v_id);
 END LOOP;
 RETURN jsonb_build_object('success',true,'order_id',v_id,'order_number',v_num,'status','NUEVO','stock_deducted',true,'total',v_total);
END;
$function$;

create or replace function public.stayclean_staff_edit_order_payment(p_number text, p_method text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null or public.stayclean_is_staff() is not true then
  raise exception 'Acceso no autorizado' using errcode = '42501';
 end if;
 if p_method is null or p_method not in ('Efectivo contra entrega','Transferencia Bancaria','Cuenta Corriente','Mercado Pago') then
  raise exception 'Medio de pago inválido';
 end if;
 update public.orders set payment_method=p_method, updated_at=now()
 where order_number=p_number and status not in ('CANCELADO','ENTREGADO')
   and converted_to_sale_number is null and mercadopago_order_id is null;
 if not found then raise exception 'Este pedido no admite cambios en el medio de pago'; end if;
end;
$$;
revoke all on function public.stayclean_staff_edit_order_payment(text,text) from public, anon;
grant execute on function public.stayclean_staff_edit_order_payment(text,text) to authenticated;
