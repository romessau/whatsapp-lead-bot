alter table public.leads
  add column if not exists pipeline_status text not null default 'new',
  add column if not exists agent_notes text,
  add column if not exists updated_at timestamp with time zone not null default now();

alter table public.leads
  drop constraint if exists leads_pipeline_status_check;

alter table public.leads
  add constraint leads_pipeline_status_check
  check (pipeline_status in ('new', 'contacted', 'viewing', 'won', 'lost'));

create index if not exists idx_leads_pipeline_status
  on public.leads (pipeline_status, created_at desc);

grant select, insert, update, delete on table public.leads to service_role;
