alter table public.products
  add column if not exists subcategory text,
  add column if not exists target_margin numeric;

create or replace function public.stayclean_staff_edit_product(
  p_product_id text, p_changes jsonb, p_expected_stock numeric, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  current_product public.products;
  edited public.products;
begin
  if auth.uid() is null or public.stayclean_is_staff() is not true then
    raise exception 'Acceso no autorizado' using errcode = '42501';
  end if;

  if jsonb_typeof(p_changes) is distinct from 'object' or p_changes = '{}'::jsonb
    or p_changes - array['sku','barcode','brand','name','category_id','subcategory',
      'preferred_supplier_id','description','purchase_unit','sale_unit','conversion_factor',
      'purchase_cost','logistics_cost','caviahue_cost','target_margin','sale_price',
      'wholesale_price','current_stock','min_stock','max_stock','warehouse_location'] <> '{}'::jsonb then
    raise exception 'Campos de producto inválidos';
  end if;

  select * into current_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Producto inexistente'; end if;
  edited := jsonb_populate_record(current_product, p_changes);

  if nullif(btrim(edited.sku),'') is null or nullif(btrim(edited.name),'') is null
    or nullif(btrim(edited.sale_unit),'') is null
    or (p_changes ? 'sale_price' and not coalesce(edited.sale_price > 0 and edited.sale_price < 'Infinity'::numeric, false))
    or (p_changes ? 'conversion_factor' and not coalesce(edited.conversion_factor >= 1 and edited.conversion_factor < 'Infinity'::numeric, false)) then
    raise exception 'Revisá el SKU, el nombre, la unidad, el precio y el factor de conversión';
  end if;

  if p_changes ? 'current_stock' and edited.current_stock is distinct from current_product.current_stock then
    if p_expected_stock is distinct from current_product.current_stock then
      raise exception 'El stock cambió mientras editabas. Volvé a abrir el producto con los datos actualizados.';
    end if;
    perform public.stayclean_staff_adjust_stock(
      p_product_id, edited.current_stock - current_product.current_stock,
      'Ajuste desde la ficha de producto', p_request_id
    );
  end if;

  update public.products set
    sku = edited.sku, barcode = edited.barcode, brand = edited.brand, name = edited.name,
    category_id = edited.category_id, subcategory = edited.subcategory,
    preferred_supplier_id = edited.preferred_supplier_id, description = edited.description,
    purchase_unit = edited.purchase_unit, sale_unit = edited.sale_unit,
    conversion_factor = edited.conversion_factor, purchase_cost = edited.purchase_cost,
    logistics_cost = edited.logistics_cost, caviahue_cost = edited.caviahue_cost,
    target_margin = edited.target_margin, sale_price = edited.sale_price,
    wholesale_price = edited.wholesale_price, min_stock = edited.min_stock,
    max_stock = edited.max_stock, warehouse_location = edited.warehouse_location,
    margin_amount = case when p_changes ?| array['sale_price','caviahue_cost']
      then edited.sale_price - edited.caviahue_cost else edited.margin_amount end,
    margin_pct = case when p_changes ?| array['sale_price','caviahue_cost']
      then coalesce(round(100 * (edited.sale_price - edited.caviahue_cost) / nullif(edited.sale_price,0),2),0)
      else edited.margin_pct end,
    markup_pct = case when p_changes ?| array['sale_price','caviahue_cost']
      then coalesce(round(100 * (edited.sale_price - edited.caviahue_cost) / nullif(edited.caviahue_cost,0),2),0)
      else edited.markup_pct end,
    updated_at = now()
  where id = p_product_id returning * into edited;
  return to_jsonb(edited);
end;
$$;

revoke all on function public.stayclean_staff_edit_product(text,jsonb,numeric,uuid) from public, anon;
grant execute on function public.stayclean_staff_edit_product(text,jsonb,numeric,uuid) to authenticated;
