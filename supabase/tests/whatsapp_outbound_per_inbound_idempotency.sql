-- Verifica que um inbound nao possa criar duas respostas registradas.
-- Todos os fixtures sao descartados pelo ROLLBACK; nenhuma mensagem e enviada.
begin;

do $$
declare
  v_channel record;
  v_inbound_id bigint;
  v_remote_phone text := 'codex-idempotency-' || gen_random_uuid()::text;
  v_provider_message_id text := 'codex-idempotency-' || gen_random_uuid()::text;
  v_duplicate_rejected boolean := false;
  v_outbound_count integer;
begin
  select id, tenant_id, store_id into v_channel
  from public.whatsapp_store_channels
  where store_id = 1
  order by id
  limit 1;

  if not found then
    raise exception 'Validacao interrompida: canal da Loja 1 nao localizado.';
  end if;

  insert into public.whatsapp_inbound_messages (
    tenant_id, store_id, channel_id, provider_message_id, remote_phone,
    message_text, status
  ) values (
    v_channel.tenant_id, v_channel.store_id, v_channel.id,
    v_provider_message_id, v_remote_phone, 'fixture transacional', 'processed'
  ) returning id into v_inbound_id;

  insert into public.whatsapp_outbound_messages (
    tenant_id, store_id, channel_id, inbound_message_id, remote_phone,
    message_text, message_type, status, payload
  ) values (
    v_channel.tenant_id, v_channel.store_id, v_channel.id, v_inbound_id,
    v_remote_phone, 'fixture transacional', 'validation_test', 'pending', '{}'::jsonb
  );

  begin
    insert into public.whatsapp_outbound_messages (
      tenant_id, store_id, channel_id, inbound_message_id, remote_phone,
      message_text, message_type, status, payload
    ) values (
      v_channel.tenant_id, v_channel.store_id, v_channel.id, v_inbound_id,
      v_remote_phone, 'fixture duplicado', 'validation_test', 'pending', '{}'::jsonb
    );
  exception when unique_violation then
    v_duplicate_rejected := true;
  end;

  select count(*) into v_outbound_count
  from public.whatsapp_outbound_messages
  where inbound_message_id = v_inbound_id;

  if not v_duplicate_rejected or v_outbound_count <> 1 then
    raise exception 'Falha: a unicidade do outbound por inbound nao foi aplicada.';
  end if;

  raise notice 'WHATSAPP_OUTBOUND_IDEMPOTENCY_OK: segundo outbound rejeitado; fixtures serao revertidos.';
end;
$$;

select 'WHATSAPP_OUTBOUND_IDEMPOTENCY_OK' as status;

rollback;
