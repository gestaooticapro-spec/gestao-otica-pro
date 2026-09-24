-- Validacao funcional da etapa 2 do redesign do WhatsApp.
-- Usa a Loja 1 e um canal existente, cria somente dados descartaveis dentro
-- da transacao e termina em ROLLBACK. Nao chama IA nem envia mensagens.
begin;

do $$
declare
  v_channel record;
  v_conversation_id bigint;
  v_customer_message_id uuid;
  v_human_message_id uuid;
  v_handoff_message_id uuid;
  v_turn_id uuid := gen_random_uuid();
  v_remote_phone text := 'codex-stage2-validation-' || gen_random_uuid()::text;
  v_now timestamptz := now();
  v_metadata jsonb := jsonb_build_object(
    'shadowProcessing', jsonb_build_object(
      'sendsMessage', false,
      'classification', jsonb_build_object(
        'intent', 'store_hours',
        'topicRelation', 'change_topic'
      )
    )
  );
  v_result jsonb;
  v_guard_rejected boolean := false;
begin
  select id, tenant_id, store_id
    into v_channel
  from public.whatsapp_store_channels
  where store_id = 1
  order by id
  limit 1;

  if not found then
    raise exception 'Validacao interrompida: nenhum canal da Loja 1 foi localizado.';
  end if;

  -- A guarda corrigida deve rejeitar metadados sem sendsMessage antes de
  -- procurar o turno; o UUID nulo torna este teste totalmente sem escrita.
  begin
    perform public.finish_whatsapp_redesign_shadow_turn(
      null,
      jsonb_build_object('shadowProcessing', jsonb_build_object(
        'classification', jsonb_build_object(
          'intent', 'store_hours',
          'topicRelation', 'change_topic'
        )
      ))
    );
  exception when others then
    if sqlerrm = 'finalizacao sombra invalida' then
      v_guard_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_guard_rejected then
    raise exception 'Falha: a finalizacao aceitou metadados sem sendsMessage=false.';
  end if;

  insert into public.whatsapp_conversation_memory (
    tenant_id, store_id, channel_id, remote_phone, mode, summary
  ) values (
    v_channel.tenant_id, v_channel.store_id, v_channel.id, v_remote_phone, 'shadow',
    jsonb_build_object(
      'activeTopic', 'unknown',
      'secondaryTopics', '[]'::jsonb,
      'phase', 'idle',
      'humanControl', 'ai_active',
      'customerControlMode', 'auto',
      'attachmentStatus', 'none',
      'pendingAction', 'none',
      'subject', null,
      'handoffReason', null,
      'lastHumanActivityAt', null,
      'humanActiveUntil', null,
      'updatedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  ) returning id into v_conversation_id;

  insert into public.whatsapp_conversation_messages (
    conversation_id, source_key, role, message_kind, message_text, occurred_at
  ) values (
    v_conversation_id, 'test:customer', 'customer', 'text', 'teste transacional', v_now - interval '10 seconds'
  ) returning id into v_customer_message_id;

  insert into public.whatsapp_conversation_turns (
    id, conversation_id, turn_key, status, opened_at, closes_at
  ) values (
    v_turn_id, v_conversation_id, 'test:turn', 'processing',
    v_now - interval '10 seconds', v_now - interval '5 seconds'
  );

  insert into public.whatsapp_conversation_turn_messages (turn_id, message_id, position)
  values (v_turn_id, v_customer_message_id, 0);

  v_result := public.finish_whatsapp_redesign_shadow_turn(v_turn_id, v_metadata);
  if v_result->>'activeTopic' is distinct from 'store_hours'
    or v_result->>'humanControl' is distinct from 'ai_active'
    or v_result->>'attachmentStatus' is distinct from 'none' then
    raise exception 'Falha: resumo do turno nao foi consolidado como esperado: %', v_result;
  end if;

  insert into public.whatsapp_conversation_messages (
    conversation_id, source_key, role, message_kind, message_text, occurred_at, metadata
  ) values (
    v_conversation_id, 'test:human', 'human', 'text', 'resposta de teste', v_now - interval '3 seconds',
    jsonb_build_object('deliveryStatus', 'sent')
  ) returning id into v_human_message_id;

  v_result := public.record_whatsapp_conversation_control_event(
    v_conversation_id, 'test:assume', 'assume', v_now - interval '3 seconds',
    'validation_test', v_human_message_id, null
  );
  if v_result->>'humanControl' is distinct from 'human_active'
    or (v_result->>'humanActiveUntil')::timestamptz is distinct from date_trunc(
      'milliseconds', v_now + interval '1 hour 59 minutes 57 seconds'
    ) then
    raise exception 'Falha: evento de assuncao nao iniciou a janela humana esperada: %', v_result;
  end if;

  -- Repetir a mesma chave e o mesmo conteudo deve ser idempotente.
  v_result := public.record_whatsapp_conversation_control_event(
    v_conversation_id, 'test:assume', 'assume', v_now - interval '3 seconds',
    'validation_test', v_human_message_id, null
  );
  if v_result->>'humanControl' is distinct from 'human_active' then
    raise exception 'Falha: repeticao idempotente do evento de assuncao.';
  end if;

  v_result := public.record_whatsapp_conversation_control_event(
    v_conversation_id, 'test:release', 'release', v_now - interval '2 seconds',
    'validation_test', null, null
  );
  if v_result->>'humanControl' is distinct from 'human_released'
    or v_result->>'activeTopic' is distinct from 'store_hours' then
    raise exception 'Falha: liberacao apagou o assunto ou nao atualizou o controle: %', v_result;
  end if;

  insert into public.whatsapp_conversation_messages (
    conversation_id, source_key, role, message_kind, message_text, occurred_at, metadata
  ) values (
    v_conversation_id, 'test:handoff', 'assistant', 'text', 'encaminhamento de teste', v_now - interval '1 second',
    jsonb_build_object('deliveryStatus', 'sent')
  ) returning id into v_handoff_message_id;

  v_result := public.record_whatsapp_conversation_control_event(
    v_conversation_id, 'test:handoff-sent', 'handoff_sent', v_now - interval '1 second',
    'validation_test', v_handoff_message_id, 'validacao_stage2'
  );
  if v_result->>'humanControl' is distinct from 'human_pending'
    or v_result->>'pendingAction' is distinct from 'awaiting_human' then
    raise exception 'Falha: handoff enviado nao criou a pendencia esperada: %', v_result;
  end if;

  raise notice 'VALIDACAO_ETAPA_2_OK: guarda, consolidacao, assuncao, idempotencia, liberacao e handoff confirmados; a transacao sera revertida.';
end;
$$;

select 'VALIDACAO_ETAPA_2_OK' as status;

rollback;
