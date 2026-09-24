begin;

-- Rejeita finalizacoes sombra sem o marcador explicito de que nenhuma
-- mensagem sera enviada. IS DISTINCT FROM tambem trata NULL como invalido.
create or replace function public.finish_whatsapp_redesign_shadow_turn(
  p_turn_id uuid,
  p_metadata jsonb
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_conversation_id bigint;
  v_conversation public.whatsapp_conversation_memory%rowtype;
  v_turn public.whatsapp_conversation_turns%rowtype;
  v_item record;
  v_intent text;
  v_relation text;
  v_active text := 'unknown';
  v_secondary text[] := array[]::text[];
  v_attachment text := 'none';
  v_summary jsonb;
  v_updated_at timestamptz;
begin
  if p_turn_id is null or p_metadata is null
    or jsonb_typeof(p_metadata) <> 'object'
    or p_metadata #>> '{shadowProcessing,sendsMessage}' is distinct from 'false' then
    raise exception 'finalizacao sombra invalida';
  end if;

  select conversation_id into v_conversation_id
  from public.whatsapp_conversation_turns where id = p_turn_id;
  if v_conversation_id is null then
    raise exception 'turno do redesign nao localizado';
  end if;

  select * into v_conversation
  from public.whatsapp_conversation_memory
  where id = v_conversation_id
  for update;
  if not found or v_conversation.mode <> 'shadow' then
    raise exception 'conversa fora do modo sombra';
  end if;

  select * into v_turn
  from public.whatsapp_conversation_turns
  where id = p_turn_id and conversation_id = v_conversation_id
  for update;
  if v_turn.status <> 'processing' then
    raise exception 'turno nao esta em processamento';
  end if;

  v_intent := p_metadata #>> '{shadowProcessing,classification,intent}';
  v_relation := p_metadata #>> '{shadowProcessing,classification,topicRelation}';
  if v_intent is null or v_relation is null or v_intent not in (
    'unknown', 'greeting', 'vision_exam', 'store_hours', 'store_location',
    'product_availability', 'attachment', 'order_status', 'installment_status',
    'complaint_or_adaptation', 'exchange_or_warranty', 'budget_request',
    'human_agent_request'
  ) or v_relation not in (
    'continue_topic', 'change_topic', 'parallel_topic', 'unclear_topic'
  ) then
    raise exception 'classificacao sombra invalida';
  end if;

  update public.whatsapp_conversation_turns
  set status = 'processed', processed_at = now(), updated_at = now(), metadata = p_metadata
  where id = p_turn_id;

  -- Reconstroi exclusivamente os campos derivados dos turnos. Controle humano,
  -- pendencia e handoff efetivo pertencem a eventos operacionais separados.
  for v_item in
    select t.id, t.opened_at, t.closes_at,
      t.metadata #>> '{shadowProcessing,classification,intent}' as intent,
      t.metadata #>> '{shadowProcessing,classification,topicRelation}' as relation,
      exists (
        select 1
        from public.whatsapp_conversation_turn_messages tm
        join public.whatsapp_conversation_messages m on m.id = tm.message_id
        where tm.turn_id = t.id and m.message_kind <> 'text'
      ) as has_attachment
    from public.whatsapp_conversation_turns t
    where t.conversation_id = v_conversation_id
      and t.status = 'processed'
      and t.metadata #>> '{shadowProcessing,sendsMessage}' = 'false'
    order by t.opened_at, t.closes_at, t.id
  loop
    if v_item.intent is null or v_item.relation is null or v_item.intent not in (
      'unknown', 'greeting', 'vision_exam', 'store_hours', 'store_location',
      'product_availability', 'attachment', 'order_status', 'installment_status',
      'complaint_or_adaptation', 'exchange_or_warranty', 'budget_request',
      'human_agent_request'
    ) or v_item.relation not in (
      'continue_topic', 'change_topic', 'parallel_topic', 'unclear_topic'
    ) then
      raise exception 'classificacao persistida invalida no turno %', v_item.id;
    end if;

    if v_item.intent not in ('unknown', 'greeting') then
      if v_item.relation = 'change_topic' or v_active = 'unknown' then
        if v_active <> 'unknown' and v_active <> v_item.intent then
          v_secondary := array_prepend(v_active, array_remove(v_secondary, v_active));
        end if;
        v_secondary := array_remove(v_secondary, v_item.intent);
        v_secondary := coalesce(v_secondary[1:5], array[]::text[]);
        v_active := v_item.intent;
      elsif v_item.relation = 'parallel_topic' and v_item.intent <> v_active then
        v_secondary := array_prepend(v_item.intent, array_remove(v_secondary, v_item.intent));
        v_secondary := coalesce(v_secondary[1:5], array[]::text[]);
      end if;
    end if;
    if v_item.has_attachment then v_attachment := 'received'; end if;
  end loop;

  v_summary := coalesce(v_conversation.summary, '{}'::jsonb);
  v_updated_at := greatest(
    coalesce((v_summary->>'updatedAt')::timestamptz, v_conversation.created_at),
    v_turn.closes_at
  );
  v_summary := v_summary || jsonb_build_object(
    'activeTopic', v_active,
    'secondaryTopics', to_jsonb(coalesce(v_secondary, array[]::text[])),
    'attachmentStatus', case
      when v_summary->>'attachmentStatus' in ('awaiting_human', 'contextualized')
        then v_summary->>'attachmentStatus'
      else v_attachment
    end,
    'updatedAt', to_char(v_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  update public.whatsapp_conversation_memory
  set summary = v_summary, updated_at = now()
  where id = v_conversation_id;
  return v_summary;
end;
$$;

revoke all on function public.finish_whatsapp_redesign_shadow_turn(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.finish_whatsapp_redesign_shadow_turn(uuid, jsonb)
  to service_role;

commit;
