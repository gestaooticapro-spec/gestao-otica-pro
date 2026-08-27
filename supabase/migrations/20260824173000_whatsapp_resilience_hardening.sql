begin;

-- Garante a idempotencia mesmo em ambientes provisionados apenas pela pasta
-- canonica de migrations. Em producao a constraint original ja cobre a mesma
-- combinacao; o indice adicional e intencionalmente idempotente.
create unique index if not exists whatsapp_inbound_messages_channel_provider_uidx
  on public.whatsapp_inbound_messages(channel_id, provider_message_id);

create index if not exists idx_whatsapp_webhook_events_provider_message
  on public.whatsapp_webhook_events(provider_message_id);

alter table public.whatsapp_outbound_messages
  drop constraint if exists whatsapp_outbound_messages_status_check;

alter table public.whatsapp_outbound_messages
  add constraint whatsapp_outbound_messages_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled'));

comment on table public.whatsapp_webhook_events is
  'Auditoria interna deny-by-default. Leitura e escrita somente por rotas server-side com service_role.';

commit;
