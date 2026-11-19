create or replace function public.stayclean_staff_set_purchase_aromas(
  p_purchase_id text,
  p_line_index integer,
  p_product_id text,
  p_quantity numeric,
  p_previous jsonb,
  p_aromas jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  purchase public.purchases%rowtype;
  line jsonb;
  entry jsonb;
  aromas jsonb := '[]';
  label text;
  units numeric;
  assigned numeric := 0;
begin
  if public.stayclean_is_staff() is not true then
    raise exception 'Acceso no autorizado' using errcode = '42501';
  end if;

  select * into purchase from public.purchases where id = p_purchase_id for update;
  if not found or coalesce(purchase.status, '') not in ('RECIBIDA', 'CONFIRMADA') then
    raise exception 'La factura debe estar recibida';
  end if;
  if p_line_index is null or p_line_index < 0 then
    raise exception 'Renglón inválido';
  end if;

  line := purchase.items -> p_line_index;
  if line is null or line->>'product_id' is distinct from p_product_id
    or (line->>'quantity_base')::numeric is distinct from p_quantity
    or coalesce(line->'aromas', '[]'::jsonb) is distinct from p_previous then
    raise exception 'El renglón cambió. Volvé a abrir la factura.';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity <> trunc(p_quantity)
    or not exists (select 1 from public.products where id = p_product_id and sku in ('2000107', '2000086')) then
    raise exception 'El renglón no corresponde a un desinfectante SYS por unidad';
  end if;

  if jsonb_typeof(p_aromas) is distinct from 'array' then
    raise exception 'Reparto inválido';
  end if;
  if jsonb_array_length(p_aromas) > 50 then
    raise exception 'El reparto admite hasta 50 aromas';
  end if;

  for entry in select value from jsonb_array_elements(p_aromas) loop
    label := btrim(entry->>'name');
    if label is null or label = '' or char_length(label) > 80
      or jsonb_typeof(entry->'quantity') is distinct from 'number' then
      raise exception 'Ingresá un aroma y una cantidad válidos';
    end if;
    units := (entry->>'quantity')::numeric;
    if units <= 0 or units <> trunc(units) or exists (
      select 1 from jsonb_array_elements(aromas) as existing(value)
      where lower(existing.value->>'name') = lower(label)
    ) then
      raise exception 'Las cantidades deben ser enteras positivas y los aromas únicos';
    end if;
    assigned := assigned + units;
    aromas := aromas || jsonb_build_array(jsonb_build_object('name', label, 'quantity', units));
  end loop;
  if assigned > p_quantity then
    raise exception 'El reparto supera las unidades recibidas';
  end if;

  update public.purchases
  set items = jsonb_set(purchase.items, array[p_line_index::text, 'aromas'], aromas)
  where id = p_purchase_id;
  return aromas;
end;
$$;

revoke all on function public.stayclean_staff_set_purchase_aromas(text, integer, text, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.stayclean_staff_set_purchase_aromas(text, integer, text, numeric, jsonb, jsonb) to authenticated;
