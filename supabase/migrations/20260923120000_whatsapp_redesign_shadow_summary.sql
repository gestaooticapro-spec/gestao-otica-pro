begin;

-- A classificacao sombra e o resumo sao confirmados na mesma transacao.
-- O bloqueio da conversa serializa processadores concorrentes da mesma conversa.
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
    or p_metadata #>> '{shadowProcessing,sendsMessage}' <> 'false' then
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

-- Eventos de autoridade sao distintos das classificacoes simuladas.
create table if not exists public.whatsapp_conversation_control_events (
  id bigint generated by default as identity primary key,
  conversation_id bigint not null references public.whatsapp_conversation_memory(id) on delete cascade,
  event_key text not null,
  action text not null check (action in ('assume', 'release', 'handoff_sent')),
  occurred_at timestamptz not null,
  actor text not null,
  message_id uuid references public.whatsapp_conversation_messages(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  unique (conversation_id, event_key)
);

create index if not exists idx_whatsapp_conversation_control_events_latest
  on public.whatsapp_conversation_control_events(conversation_id, occurred_at desc, id desc);

alter table public.whatsapp_conversation_control_events enable row level security;

create or replace function public.record_whatsapp_conversation_control_event(
  p_conversation_id bigint,
  p_event_key text,
  p_action text,
  p_occurred_at timestamptz,
  p_actor text,
  p_message_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_conversation public.whatsapp_conversation_memory%rowtype;
  v_existing public.whatsapp_conversation_control_events%rowtype;
  v_latest public.whatsapp_conversation_control_events%rowtype;
  v_summary jsonb;
  v_update_at timestamptz;
begin
  if p_conversation_id is null or nullif(trim(p_event_key), '') is null
    or length(p_event_key) > 300 or p_action is null
    or p_action not in ('assume', 'release', 'handoff_sent')
    or p_occurred_at is null or p_occurred_at > now() + interval '5 minutes'
    or nullif(trim(p_actor), '') is null or length(p_actor) > 200
    or length(coalesce(p_reason, '')) > 500 then
    raise exception 'evento de controle invalido';
  end if;

  select * into v_conversation from public.whatsapp_conversation_memory
  where id = p_conversation_id for update;
  if not found then raise exception 'conversa do redesign nao localizada'; end if;

  if p_message_id is not null and not exists (
    select 1 from public.whatsapp_conversation_messages m
    where m.id = p_message_id and m.conversation_id = p_conversation_id
      and m.metadata->>'deliveryStatus' = 'sent'
      and m.occurred_at = p_occurred_at
      and ((p_action = 'assume' and m.role = 'human')
        or (p_action = 'handoff_sent' and m.role = 'assistant'))
  ) then
    raise exception 'mensagem nao confirma o evento de controle';
  end if;
  if p_action = 'handoff_sent' and p_message_id is null then
    raise exception 'handoff exige mensagem enviada confirmada';
  end if;
  if p_action = 'assume' and p_message_id is null and p_actor = 'confirmed_outbound' then
    raise exception 'assuncao por mensagem exige comprovacao';
  end if;

  insert into public.whatsapp_conversation_control_events (
    conversation_id, event_key, action, occurred_at, actor, message_id, reason
  ) values (
    p_conversation_id, trim(p_event_key), p_action, p_occurred_at,
    trim(p_actor), p_message_id, p_reason
  ) on conflict (conversation_id, event_key) do nothing;

  select * into v_existing from public.whatsapp_conversation_control_events
  where conversation_id = p_conversation_id and event_key = trim(p_event_key);
  if v_existing.action <> p_action or v_existing.occurred_at <> p_occurred_at
    or v_existing.actor <> trim(p_actor)
    or v_existing.message_id is distinct from p_message_id
    or v_existing.reason is distinct from p_reason then
    raise exception 'chave de evento reutilizada com outro conteudo';
  end if;

  select * into v_latest from public.whatsapp_conversation_control_events
  where conversation_id = p_conversation_id
  order by occurred_at desc, id desc limit 1;

  v_summary := coalesce(v_conversation.summary, '{}'::jsonb);
  v_update_at := greatest(
    coalesce((v_summary->>'updatedAt')::timestamptz, v_conversation.created_at),
    v_latest.occurred_at
  );
  if v_latest.action = 'assume' then
    v_summary := v_summary || jsonb_build_object(
      'phase', 'active', 'humanControl', 'human_active',
      'lastHumanActivityAt', to_char(v_latest.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'humanActiveUntil', to_char((v_latest.occurred_at + interval '2 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'pendingAction', 'none'
    );
  elsif v_latest.action = 'release' then
    v_summary := v_summary || jsonb_build_object(
      'phase', 'resumed', 'humanControl', 'human_released',
      'humanActiveUntil', null, 'pendingAction', 'none'
    );
  else
    v_summary := v_summary || jsonb_build_object(
      'phase', 'waiting_human', 'humanControl', 'human_pending',
      'pendingAction', 'awaiting_human', 'handoffReason', v_latest.reason,
      'humanActiveUntil', null
    );
  end if;
  v_summary := v_summary || jsonb_build_object(
    'updatedAt', to_char(v_update_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  update public.whatsapp_conversation_memory
  set summary = v_summary, updated_at = now()
  where id = p_conversation_id;
  return v_summary;
end;
$$;

revoke all on function public.record_whatsapp_conversation_control_event(bigint, text, text, timestamptz, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_whatsapp_conversation_control_event(bigint, text, text, timestamptz, text, uuid, text)
  to service_role;

commit;
