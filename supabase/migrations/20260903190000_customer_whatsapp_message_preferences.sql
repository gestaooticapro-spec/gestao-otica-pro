-- Preferências individuais para as automações de WhatsApp já disponíveis.
-- A chave continua sendo loja + telefone porque os jobs enviam por esse destino.
alter table public.whatsapp_message_preferences
  add column if not exists post_sale_followups_enabled boolean not null default true,
  add column if not exists post_sale_followups_changed_at timestamptz not null default now();

create index if not exists idx_whatsapp_message_preferences_post_sale_followups
  on public.whatsapp_message_preferences (store_id, post_sale_followups_enabled)
  where post_sale_followups_enabled = false;

comment on column public.whatsapp_message_preferences.installment_reminders_enabled is
  'Permite lembretes automáticos de vencimento e parcelas para este telefone.';

comment on column public.whatsapp_message_preferences.post_sale_followups_enabled is
  'Permite acompanhamentos automáticos de pós-venda para este telefone.';
