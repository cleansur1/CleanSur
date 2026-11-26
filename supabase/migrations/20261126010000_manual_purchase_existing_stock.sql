alter table public.purchases add column if not exists stock_already_entered boolean not null default false;

CREATE OR REPLACE FUNCTION public.stayclean_staff_receive_purchase(p_purchase jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_form public.stayclean_presentations; v_count numeric; v_line_total numeric; v_id text; v_item jsonb; v_product record; v_qty numeric; v_cost numeric; v_total numeric:=0; v_items jsonb:='[]'::jsonb; v_supplier text; v_name text; v_invoice text; v_existing record;
 v_already_entered boolean := coalesce((p_purchase->>'stock_already_entered')::boolean,false);
 v_date date := coalesce(nullif(p_purchase->>'date','')::date,current_date);
begin
 if not public.stayclean_is_staff() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 v_id:=nullif(trim(p_purchase->>'request_id'),'');
 if v_id is null or length(v_id)>100 then raise exception 'Identificador requerido'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id,0));
 select id,total_final into v_existing from public.purchases where id='recv-'||v_id;
 if found then return jsonb_build_object('success',true,'purchase_id',v_existing.id,'total',v_existing.total_final,'replayed',true); end if;
 if jsonb_typeof(p_purchase->'items')<>'array' or jsonb_array_length(p_purchase->'items') not between 1 and 100 then raise exception 'Items inválidos'; end if;
 v_supplier:=nullif(trim(p_purchase->>'supplier_id'),'');
 v_invoice:=nullif(trim(p_purchase->>'invoice_number'),'');
 if v_supplier is null or v_invoice is null then raise exception 'Proveedor y número de factura obligatorios'; end if;
 select name into v_name from public.suppliers where id=v_supplier;
 if not found then raise exception 'Proveedor inexistente'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_supplier||':'||upper(v_invoice),1));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_supplier||':'||upper(v_invoice),0));
 if exists(select 1 from public.purchases where supplier_id=v_supplier and upper(invoice_number)=upper(v_invoice) and status<>'ANULADA') then raise exception 'Factura de proveedor ya registrada'; end if;
 perform 1 from public.products p where p.id in (select line->>'product_id' from jsonb_array_elements(p_purchase->'items') line) order by p.id for update;
 for v_item in select value from jsonb_array_elements(p_purchase->'items') loop
  v_form:=null;
  v_count:=null;
  if nullif(v_item->>'presentation_id','') is not null then
   v_form:=public.stayclean_resolve_presentation((v_item->>'presentation_id')::uuid,v_item->>'product_id',false);
   v_count:=(v_item->>'quantity')::numeric;
   if v_count is null or v_count<=0 or v_count<>trunc(v_count) then raise exception 'Cantidad de presentación inválida'; end if;
   v_item:=v_item||jsonb_build_object('quantity_base',v_count*v_form.factor,'unit_cost',(v_item->>'unit_cost')::numeric/v_form.factor);
  end if;
  v_qty:=coalesce((v_item->>'quantity_base')::numeric,0);
  v_cost:=coalesce((v_item->>'unit_cost')::numeric,-1);
  if v_qty<=0 or v_qty<>trunc(v_qty) or v_qty>100000 or v_cost<0 then raise exception 'Cantidad o costo inválido'; end if;
  select id,name,current_stock,base_unit,caviahue_cost into v_product from public.products where id=v_item->>'product_id' and active=true for update;
  if not found then raise exception 'Producto inexistente'; end if;
  if not v_already_entered then
  update public.products set current_stock=current_stock+v_qty,last_purchase_date=current_date,updated_at=now() where id=v_product.id;
  insert into public.inventory_movements(id,product_id,product_name,movement_type,quantity_base,unit_used,quantity_input,previous_stock,new_stock,unit_cost,reference_type,reference_id,notes,user_name)
  values(gen_random_uuid()::text,v_product.id,v_product.name,'COMPRA',v_qty,v_product.base_unit,v_qty,v_product.current_stock,v_product.current_stock+v_qty,v_cost,'COMPRA','recv-'||v_id,'Recepción de mercadería',auth.uid()::text);
  v_line_total:=round(v_qty*v_cost,2);
  end if;
  v_total:=v_total+v_line_total;
  v_items:=v_items||jsonb_build_array(jsonb_build_object('product_id',v_product.id,'product_name',concat_ws(' · ',v_product.name,v_form.name),'presentation_id',v_form.id,'presentation_code',v_form.code,'sealed',v_form.sealed,'factor_to_base',v_form.factor,'quantity',coalesce(v_count,v_qty),'quantity_base',v_qty,'unit_cost',v_cost,'line_total',v_line_total));
 end loop;
 if not v_already_entered then perform public.stayclean_move_sealed(v_items,1); end if;
 insert into public.purchases(id,purchase_number,invoice_number,date,supplier_id,supplier_name,total_final,items,status,user_name,notes,stock_already_entered)
 values('recv-'||v_id,'REC-'||left(v_id,12),v_invoice,v_date,v_supplier,v_name,v_total,v_items,'RECIBIDA',auth.uid()::text,left(coalesce(p_purchase->>'notes',''),500),v_already_entered);
 insert into public.audit_log(id,user_id,user_name,user_role,action,module,reference_id,details)
 values(gen_random_uuid()::text,auth.uid()::text,auth.uid()::text,'STAFF','RECIBIR_COMPRA','COMPRAS','recv-'||v_id,'Recepción por '||v_total::text);
 return jsonb_build_object('success',true,'purchase_id','recv-'||v_id,'total',v_total,'replayed',false);
end $function$
;

CREATE OR REPLACE FUNCTION public.stayclean_staff_manage_purchase(p_purchase_id text, p_action text, p_changes jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.purchases%rowtype; m record; prod public.products%rowtype; ref text; delta numeric; n integer:=0;
begin
 if not public.stayclean_is_staff() then raise exception 'Personal no autorizado'; end if;
 if p_action not in ('EDITAR_DATOS','ANULAR') then raise exception 'Acción inválida'; end if;
 select * into v from public.purchases where id=p_purchase_id for update;
 if not found then raise exception 'Comprobante inexistente'; end if;
 if v.status='ANULADA' then raise exception 'Compra ya anulada'; end if;
 if p_action='EDITAR_DATOS' then
   if not (p_changes ? 'reason') or length(trim(p_changes->>'reason'))<5 then raise exception 'Ingresá un motivo de edición'; end if;
   if p_changes ? 'invoice_number' and length(trim(p_changes->>'invoice_number'))<2 then raise exception 'Número de comprobante inválido'; end if;
   update public.purchases set invoice_number=coalesce(nullif(trim(p_changes->>'invoice_number'),''),invoice_number),
      notes=concat_ws(E'\n',notes,'[EDITADO '||now()||' por '||auth.uid()||'] '||(p_changes->>'reason')||' | Número anterior: '||coalesce(invoice_number,'')||' | Notas: '||coalesce(p_changes->>'notes','')),
      updated_at=now() where id=v.id;
   return jsonb_build_object('ok',true,'action','EDITAR_DATOS');
 end if;
 if v.stock_already_entered then
   update public.purchases set status='ANULADA', updated_at=now(),
     notes=concat_ws(E'\n',notes,'[ANULADA '||now()||' por '||auth.uid()||'] '||
       coalesce(p_changes->>'reason','Anulación solicitada desde ERP')) where id=v.id;
   return jsonb_build_object('ok',true,'action','ANULAR','products_reversed',0);
 end if;
 ref:=case when exists(select 1 from public.inventory_movements where reference_id=v.id and movement_type='COMPRA') then v.id else v.purchase_number end;
 if exists(select 1 from public.inventory_movements where reference_id=ref and reference_type='RECTIFICACION_COMPRA')
    or (v.invoice_number ilike '%7572%') then
    raise exception 'Esta compra tiene rectificaciones históricas; requiere anulación asistida para evitar alterar stock incorrectamente';
 end if;
 if not exists(select 1 from public.inventory_movements where reference_id=ref and movement_type='COMPRA') then raise exception 'No se encontraron movimientos vinculados; no se puede revertir stock de forma segura'; end if;
 perform public.stayclean_move_sealed(v.items,-1);
 for m in select product_id,sum(quantity_base) qty from public.inventory_movements where reference_id=ref and movement_type='COMPRA' group by product_id order by product_id loop
   select * into prod from public.products where id=m.product_id for update;
   if not found or prod.current_stock<m.qty then raise exception 'Stock insuficiente para revertir %: actual %, a revertir %',m.product_id,coalesce(prod.current_stock,0),m.qty; end if;
   update public.products set current_stock=current_stock-m.qty,updated_at=now() where id=prod.id;
   insert into public.inventory_movements(id,date,product_id,product_name,movement_type,quantity_base,unit_used,quantity_input,previous_stock,new_stock,reference_type,reference_id,notes,user_name)
   values ('void-'||v.id||'-'||prod.id,current_date,prod.id,prod.name,'AJUSTE',-m.qty,prod.base_unit,-m.qty,prod.current_stock,prod.current_stock-m.qty,'ANULACION_COMPRA',v.id,'Reversión por anulación de '||v.invoice_number,auth.uid()::text);
   n:=n+1;
 end loop;
 update public.purchases set status='ANULADA',notes=concat_ws(E'\n',notes,'[ANULADA '||now()||' por '||auth.uid()||'] '||coalesce(p_changes->>'reason','Anulación solicitada desde ERP')),updated_at=now() where id=v.id;
 return jsonb_build_object('ok',true,'action','ANULAR','products_reversed',n);
end $function$
;
