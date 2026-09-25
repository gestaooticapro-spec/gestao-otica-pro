begin;

-- Uma mensagem de entrada pode produzir no maximo um registro de saida.
-- Mensagens operacionais/manualizadas mantem inbound_message_id nulo.
create unique index if not exists whatsapp_outbound_messages_inbound_unique_idx
  on public.whatsapp_outbound_messages(inbound_message_id)
  where inbound_message_id is not null;

commit;
