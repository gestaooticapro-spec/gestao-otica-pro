begin;

create table if not exists public.whatsapp_inbound_processing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  store_id bigint not null references public.stores(id) on delete cascade,
  channel_id bigint not null references public.whatsapp_store_channels(id) on delete cascade,
  inbound_message_id bigint not null references public.whatsapp_inbound_messages(id) on delete cascade,
  stage text not null,
  outcome text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_inbound_processing_events_inbound_idx
  on public.whatsapp_inbound_processing_events(inbound_message_id, created_at, id);

create index if not exists whatsapp_inbound_processing_events_created_idx
  on public.whatsapp_inbound_processing_events(created_at desc);

alter table public.whatsapp_inbound_processing_events enable row level security;
revoke all on public.whatsapp_inbound_processing_events from public, anon, authenticated;
grant all on public.whatsapp_inbound_processing_events to service_role;

comment on table public.whatsapp_inbound_processing_events is
  'Trilha operacional do processamento inbound WhatsApp. Guarda somente etapas, decisões e códigos técnicos; nunca texto da conversa ou telefone.';

commit;
