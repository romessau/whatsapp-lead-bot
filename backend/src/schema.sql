-- Run this once in the Supabase SQL editor (or via psql) before starting the app.

create extension if not exists "pgcrypto";

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  session_key uuid,
  phone text,
  name text,
  purpose text,
  location text,
  budget_pkr numeric,
  property_type text,
  bedrooms int,
  size text,
  timeline text,
  wants_call boolean,
  score int,
  classification text,
  status text default 'completed' check (status in ('completed', 'abandoned', 'deferred')),
  created_at timestamp default now()
);

alter table leads
  add column if not exists session_key uuid;

alter table leads
  add column if not exists status text default 'completed';

alter table leads
  drop constraint if exists leads_status_check;

alter table leads
  add constraint leads_status_check check (status in ('completed', 'abandoned', 'deferred'));

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  state jsonb,
  current_step text,
  updated_at timestamp default now()
);

create table if not exists listings (
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

create index if not exists idx_chat_sessions_phone on chat_sessions (phone);
create index if not exists idx_leads_phone on leads (phone);
create unique index if not exists idx_leads_session_key on leads (session_key);
create index if not exists idx_listings_active on listings (active);
create index if not exists idx_listings_location on listings (location);
create index if not exists idx_listings_search_filters on listings (purpose, property_type, budget_pkr);
