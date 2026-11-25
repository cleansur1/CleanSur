create table public.arca_wsaa_tickets (
  scope text primary key,
  token text not null,
  sign text not null,
  expires_at timestamptz not null
);
alter table public.arca_wsaa_tickets enable row level security;
revoke all on public.arca_wsaa_tickets from public, anon, authenticated;
grant select, insert, update on public.arca_wsaa_tickets to service_role;
