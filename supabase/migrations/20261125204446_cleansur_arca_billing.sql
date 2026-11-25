alter table public.arca_invoices add column receptor_iva_id integer;
create unique index arca_invoices_sale_unique on public.arca_invoices(sale_id);
create unique index arca_invoices_number_unique on public.arca_invoices(cuit_emisor, punto_vta, tipo_cbte, nro_cbte);

create table public.arca_pending_invoices (
  sale_id text primary key references public.sales(id),
  cuit text not null,
  punto integer not null,
  numero bigint not null check (numero > 0),
  doc_tipo integer not null,
  doc_nro text not null,
  receptor_iva_id integer not null,
  fecha date not null,
  total numeric(18,2) not null check (total > 0),
  nombre text,
  started_at timestamptz not null default now(),
  unique(cuit, punto)
);
alter table public.arca_pending_invoices enable row level security;
revoke all on public.arca_pending_invoices from public, anon, authenticated;
grant select, insert, delete on public.arca_pending_invoices to service_role;

create function public.cleansur_arca_reserve(
  p_sale text, p_cuit text, p_punto integer, p_numero bigint,
  p_doc_tipo integer, p_doc_nro text, p_iva integer, p_total numeric
) returns public.arca_pending_invoices
language plpgsql set search_path = '' as $$
declare s public.sales;
declare pending public.arca_pending_invoices;
declare document text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_cuit || ':' || p_punto, 0));
  select * into strict s from public.sales where id = p_sale for update;
  if s.status is distinct from 'COMPLETADA' or s.total is distinct from p_total
     or s.arca_invoice_id is not null
     or exists (select 1 from public.arca_invoices where sale_id = p_sale) then
    raise exception 'La venta cambió o ya está facturada';
  end if;
  document := regexp_replace(coalesce(s.customer_cuit_dni, ''), '[[:space:].-]', '', 'g');
  if document is distinct from p_doc_nro then
    raise exception 'Cambió el documento de la venta';
  end if;
  if exists (select 1 from public.arca_pending_invoices where cuit = p_cuit and punto = p_punto) then
    raise exception 'Hay un comprobante pendiente de conciliación en este punto de venta';
  end if;
  if exists (select 1 from public.arca_invoices where cuit_emisor = p_cuit and punto_vta = p_punto
      and tipo_cbte = 'C' and nro_cbte >= p_numero) then
    raise exception 'La numeración consultada quedó desactualizada';
  end if;
  insert into public.arca_pending_invoices(sale_id,cuit,punto,numero,doc_tipo,doc_nro,receptor_iva_id,fecha,total,nombre)
  values(p_sale,p_cuit,p_punto,p_numero,p_doc_tipo,p_doc_nro,p_iva,
    (now() at time zone 'America/Argentina/Buenos_Aires')::date,s.total,s.customer_name)
  returning * into pending;
  return pending;
end;
$$;

create function public.cleansur_arca_finalize(p_sale text, p_numero bigint, p_cae text, p_vto date)
returns public.arca_invoices language plpgsql set search_path = '' as $$
declare pending public.arca_pending_invoices;
declare invoice public.arca_invoices;
begin
  perform 1 from public.sales where id = p_sale for update;
  select * into invoice from public.arca_invoices where sale_id = p_sale;
  if found then return invoice; end if;
  select * into strict pending from public.arca_pending_invoices where sale_id = p_sale for update;
  if pending.numero <> p_numero or p_cae is null or p_cae !~ '^[0-9]{14}$' or p_vto is null or p_vto < pending.fecha then
    raise exception 'Respuesta CAE inválida';
  end if;
  insert into public.arca_invoices (id,sale_id,tipo_cbte,punto_vta,nro_cbte,cuit_emisor,fecha_cbte,cae,cae_vto,
    doc_tipo,doc_nro,nombre_cliente,importe_neto,importe_iva,importe_total,estado,receptor_iva_id)
  values (gen_random_uuid()::text,p_sale,'C',pending.punto,p_numero,pending.cuit,pending.fecha,p_cae,p_vto,
    pending.doc_tipo,pending.doc_nro,pending.nombre,pending.total,0,pending.total,'AUTORIZADA',pending.receptor_iva_id)
  returning * into invoice;
  update public.sales set arca_invoice_id = invoice.id where id = p_sale;
  delete from public.arca_pending_invoices where sale_id = p_sale;
  return invoice;
end;
$$;

create function public.cleansur_arca_protect_sale()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (old.arca_invoice_id is not null or exists (
    select 1 from public.arca_pending_invoices where sale_id = old.id
  )) and row(old.status,old.total,old.customer_cuit_dni,old.customer_name,old.customer_id,old.items)
       is distinct from row(new.status,new.total,new.customer_cuit_dni,new.customer_name,new.customer_id,new.items) then
    raise exception 'La venta ya está facturada o tiene una solicitud fiscal pendiente';
  end if;
  return new;
end;
$$;
create trigger cleansur_arca_protect_sale before update on public.sales
for each row execute function public.cleansur_arca_protect_sale();

revoke execute on function public.cleansur_arca_reserve(text,text,integer,bigint,integer,text,integer,numeric),
  public.cleansur_arca_finalize(text,bigint,text,date), public.cleansur_arca_protect_sale()
from public, anon, authenticated;
grant execute on function public.cleansur_arca_reserve(text,text,integer,bigint,integer,text,integer,numeric),
  public.cleansur_arca_finalize(text,bigint,text,date) to service_role;
grant select, insert on public.arca_invoices to service_role;
