-- Align the live database with the canonical application schema.
-- The backend is the only database client; browser roles receive no table access.

create extension if not exists "pgcrypto";

alter table public.leads
  add column if not exists session_key uuid,
  add column if not exists status text default 'completed';

update public.leads
set status = 'completed'
where status is null
   or status not in ('completed', 'abandoned', 'deferred');

alter table public.leads
  alter column status set default 'completed',
  drop constraint if exists leads_status_check;

alter table public.leads
  add constraint leads_status_check
  check (status in ('completed', 'abandoned', 'deferred'));

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  purpose text check (purpose in ('buy', 'rent', 'invest')),
  property_type text check (property_type in ('plot', 'house', 'apartment', 'commercial')),
  location text not null,
  budget_pkr numeric,
  bedrooms int,
  size text,
  description text,
  active boolean default true,
  created_at timestamp default now()
);

create table if not exists public.processed_messages (
  message_sid text primary key,
  reply text not null,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_chat_sessions_phone on public.chat_sessions (phone);
create index if not exists idx_leads_phone on public.leads (phone);
create unique index if not exists idx_leads_session_key on public.leads (session_key);
create index if not exists idx_listings_active on public.listings (active);
create index if not exists idx_listings_location on public.listings (location);
create index if not exists idx_listings_search_filters
  on public.listings (purpose, property_type, budget_pkr);
create index if not exists idx_processed_messages_created_at
  on public.processed_messages (created_at);

alter table public.leads enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.listings enable row level security;
alter table public.processed_messages enable row level security;

revoke all on table public.leads from public, anon, authenticated;
revoke all on table public.chat_sessions from public, anon, authenticated;
revoke all on table public.listings from public, anon, authenticated;
revoke all on table public.processed_messages from public, anon, authenticated;

grant select, insert, update, delete on table public.leads to service_role;
grant select, insert, update, delete on table public.chat_sessions to service_role;
grant select, insert, update, delete on table public.listings to service_role;
grant select, insert, update, delete on table public.processed_messages to service_role;
