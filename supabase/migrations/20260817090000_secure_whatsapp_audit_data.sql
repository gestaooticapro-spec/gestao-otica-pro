-- Logs de IA podem conter trechos de conversas e nunca devem ficar visiveis
-- para qualquer usuario autenticado, independentemente da loja/tenant.
drop policy if exists "Enable read access for authenticated users" on public.whatsapp_ai_logs;

-- O acesso operacional e feito pelas server actions com service_role, que
-- ignora RLS. Nao criamos uma policy ampla para authenticated.

-- Preserva o horario informado pelo WhatsApp/Evolution separado do momento
-- em que o webhook conseguiu gravar a mensagem no banco.
alter table public.whatsapp_inbound_messages
  add column if not exists provider_created_at timestamptz null;

create index if not exists idx_whatsapp_inbound_provider_created_at
  on public.whatsapp_inbound_messages(store_id, provider_created_at desc);
