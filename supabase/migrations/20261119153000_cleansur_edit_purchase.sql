create function public.stayclean_staff_edit_purchase(
  p_id text, p_expected_items jsonb, p_expected_updated_at timestamptz,
  p_header jsonb, p_lines jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  purchase public.purchases%rowtype;
  product public.products%rowtype;
  line jsonb;
  edited_items jsonb := '[]';
  movement record;
  units numeric;
  line_total numeric;
  net numeric := 0;
  vat numeric;
  logistics numeric := coalesce((p_header->>'total_logistics')::numeric,0);
  number text := nullif(btrim(p_header->>'invoice_number'),'');
  ledger_ref text;
  reason text := nullif(btrim(p_header->>'reason'),'');
begin
  if public.stayclean_is_staff() is not true then
    raise exception 'Personal no autorizado' using errcode='42501';
  end if;
  select * into purchase from public.purchases where id=p_id for update;
  if not found or coalesce(purchase.status,'') not in ('RECIBIDA','CONFIRMADA') then
    raise exception 'La compra debe estar recibida';
  end if;
  if purchase.items is distinct from p_expected_items or purchase.updated_at is distinct from p_expected_updated_at then
    raise exception 'La compra cambió. Volvé a abrirla.';
  end if;
  if number is null or length(number)>120 or length(coalesce(reason,'')) not between 5 and 500 or logistics < 0 then
    raise exception 'Revisá el número de factura, el motivo y los gastos';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(purchase.supplier_id||':'||upper(number),0));
  if exists(select 1 from public.purchases p where p.id<>p_id and p.supplier_id=purchase.supplier_id
    and upper(p.invoice_number)=upper(number) and p.status<>'ANULADA') then
    raise exception 'Ya existe ese número para el proveedor';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'Ingresá de 1 a 100 renglones';
  end if;

  for line in select value from jsonb_array_elements(p_lines) loop
    units := (line->>'quantity_base')::numeric;
    line_total := round((line->>'line_total')::numeric,2);
    select * into product from public.products where id=line->>'product_id';
    if not found or product.sku is distinct from line->>'code'
      or units is null or units not between 1 and 100000 or units<>trunc(units)
      or line_total is null or line_total<0
      or exists(select 1 from jsonb_array_elements(edited_items) i where i->>'product_id'=product.id) then
      raise exception 'Revisá el código, la cantidad y el precio de cada renglón';
    end if;
    if coalesce((select sum((a->>'quantity')::numeric) from jsonb_array_elements(coalesce(line->'aromas','[]')) a),0)>units then
      raise exception 'La cantidad es menor que las unidades con aroma asignado';
    end if;
    net := net + line_total;
    edited_items := edited_items || jsonb_build_array(line || jsonb_build_object(
      'product_name',coalesce(nullif(line->>'commercial_name',''),product.name),
      'quantity_base',units,'line_total',line_total,'unit_cost',line_total/units
    ));
  end loop;

  ledger_ref := case when exists(select 1 from public.inventory_movements where reference_id=p_id and movement_type='COMPRA')
    then p_id else purchase.purchase_number end;
  for movement in
    select product_id,sum(delta) delta,sum(previous_quantity) previous_quantity
    from (
      select i->>'product_id' product_id,-(i->>'quantity_base')::numeric delta,(i->>'quantity_base')::numeric previous_quantity from jsonb_array_elements(purchase.items) i
      union all
      select i->>'product_id',(i->>'quantity_base')::numeric,0 from jsonb_array_elements(edited_items) i
    ) lines group by product_id having sum(delta)<>0 order by product_id
  loop
    if coalesce(purchase.rectified,false) or purchase.invoice_number ilike '%7572%'
      or not exists(select 1 from public.inventory_movements where reference_id=ledger_ref and movement_type='COMPRA')
      or exists(select 1 from public.inventory_movements where reference_id=ledger_ref and reference_type='RECTIFICACION_COMPRA') then
      raise exception 'La compra tiene movimientos históricos especiales. Podés editar sus datos y precios sin cambiar el stock.';
    end if;
    if movement.previous_quantity is distinct from coalesce((select sum(quantity_base) from public.inventory_movements
      where reference_id=ledger_ref and movement_type='COMPRA' and product_id=movement.product_id),0) then
      raise exception 'El historial de stock del producto no coincide con la compra';
    end if;
    select * into product from public.products where id=movement.product_id for update;
    if not found or product.current_stock+movement.delta<0 then
      raise exception 'Stock insuficiente para corregir %',movement.product_id;
    end if;
    update public.products set current_stock=current_stock+movement.delta,updated_at=now() where id=product.id;
    insert into public.inventory_movements(id,date,product_id,product_name,movement_type,quantity_base,unit_used,
      quantity_input,previous_stock,new_stock,reference_type,reference_id,notes,user_name)
    values(gen_random_uuid()::text,current_date,product.id,product.name,'COMPRA',movement.delta,product.base_unit,
      movement.delta,product.current_stock,product.current_stock+movement.delta,'COMPRA',ledger_ref,'Edición de factura: '||reason,auth.uid()::text);
  end loop;

  vat := case when (p_header->>'vat_included')::boolean then 0 else round(net*(p_header->>'vat_rate')::numeric/100,2) end;
  update public.purchases set invoice_number=number,date=(p_header->>'date')::date,
    payment_condition=p_header->>'payment_condition',cae=p_header->>'cae',
    discount_pct=(p_header->>'discount_pct')::numeric,
    subtotal_bruto=(p_header->>'subtotal_bruto')::numeric,
    discount_amount=(p_header->>'subtotal_bruto')::numeric-net, subtotal_products=net,
    vat_included=(p_header->>'vat_included')::boolean,vat_rate=(p_header->>'vat_rate')::numeric,vat_amount=vat,
    total_logistics=logistics,total_final=net+vat+logistics,invoice_stated_total=(p_header->>'invoice_stated_total')::numeric,
    reconciliation=jsonb_build_object('calculated_total',net+vat+logistics,'stated_total',(p_header->>'invoice_stated_total')::numeric),
    items=edited_items,updated_at=now()
  where id=p_id;
  insert into public.audit_log(id,user_id,user_name,user_role,action,module,reference_id,details)
  values(gen_random_uuid()::text,auth.uid()::text,auth.uid()::text,'STAFF','EDITAR_COMPRA','COMPRAS',p_id,reason);
end;
$$;
revoke all on function public.stayclean_staff_edit_purchase(text,jsonb,timestamptz,jsonb,jsonb) from public, anon;
grant execute on function public.stayclean_staff_edit_purchase(text,jsonb,timestamptz,jsonb,jsonb) to authenticated;
