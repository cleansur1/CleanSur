create function public.stayclean_public_catalog_aromas()
returns table (product_id text, aroma text)
language sql
stable
security definer
set search_path = ''
as $$
  select item->>'product_id', min(btrim(entry->>'name'))
  from public.purchases purchase
  cross join lateral jsonb_array_elements(purchase.items) item
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(item->'aromas') = 'array' then item->'aromas' else '[]'::jsonb end
  ) entry
  join public.products product on product.id = item->>'product_id'
  where purchase.status in ('RECIBIDA', 'CONFIRMADA')
    and product.active and product.publish_online and product.sale_price > 0
    and product.sku in ('2000086', '2000107')
    and nullif(btrim(entry->>'name'), '') is not null
  group by item->>'product_id', lower(btrim(entry->>'name'))
  order by 1, 2;
$$;
revoke all on function public.stayclean_public_catalog_aromas() from public;
grant execute on function public.stayclean_public_catalog_aromas() to anon, authenticated;
