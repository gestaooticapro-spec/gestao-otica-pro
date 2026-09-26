begin;

-- A memoria operacional de OS muda somente depois de uma saida confirmada.
-- O resumo em sombra continua sendo reconstruido pelos turnos para assunto;
-- esta funcao persiste separadamente a transicao operacional enviada.
create or replace function public.record_whatsapp_redesign_order_outcome(
  p_conversation_id bigint,
  p_message_id uuid,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conversation public.whatsapp_conversation_memory%rowtype;
  v_message public.whatsapp_conversation_messages%rowtype;
  v_summary jsonb;
  v_previous jsonb;
  v_attempts integer;
begin
  if p_conversation_id is null or p_message_id is null
    or p_action not in ('request_identifier', 'auto_reply') then
    raise exception 'resultado de OS invalido';
  end if;

  select * into v_conversation from public.whatsapp_conversation_memory
  where id = p_conversation_id for update;
  if not found then raise exception 'conversa do redesign nao localizada'; end if;

  select * into v_message from public.whatsapp_conversation_messages
  where id = p_message_id and conversation_id = p_conversation_id;
  if not found or v_message.role <> 'assistant'
    or v_message.metadata->>'deliveryStatus' <> 'sent'
    or v_message.metadata #>> '{canonical,intent}' <> 'order_status'
    or v_message.metadata #>> '{canonical,action}' <> p_action then
    raise exception 'mensagem nao confirma o resultado de OS';
  end if;

  v_summary := coalesce(v_conversation.summary, '{}'::jsonb);
  v_previous := coalesce(v_summary->'orderStatus', '{}'::jsonb);
  if v_previous->>'messageId' = p_message_id::text then
    if v_previous->>'lastAction' <> p_action then
      raise exception 'resultado de OS reutilizado com outra acao';
    end if;
    return v_summary;
  end if;
  if coalesce((v_previous->>'updatedAt')::timestamptz, '-infinity'::timestamptz)
    > v_message.occurred_at then return v_summary; end if;

  -- Uma resposta automatica nao revoga uma assuncao humana confirmada.
  if v_summary->>'humanControl' = 'human_active' then return v_summary; end if;

  v_attempts := case
    when p_action = 'request_identifier'
      then least(10, coalesce((v_previous->>'attempts')::integer, 0) + 1)
    else 0
  end;
  v_summary := v_summary || jsonb_build_object(
    'activeTopic', 'order_status',
    'phase', case when p_action = 'request_identifier' then 'waiting_identifier' else 'active' end,
    'pendingAction', case when p_action = 'request_identifier' then 'awaiting_identifier' else 'none' end,
    'humanControl', 'ai_active',
    'humanActiveUntil', null,
    'handoffReason', null,
    'orderStatus', jsonb_build_object(
      'lastAction', p_action,
      'attempts', v_attempts,
      'messageId', p_message_id,
      'updatedAt', to_char(v_message.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'updatedAt', to_char(greatest(
      coalesce((v_summary->>'updatedAt')::timestamptz, v_conversation.created_at),
      v_message.occurred_at
    ) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  update public.whatsapp_conversation_memory
  set summary = v_summary, updated_at = now() where id = p_conversation_id;
  return v_summary;
end;
$$;

revoke all on function public.record_whatsapp_redesign_order_outcome(bigint, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_whatsapp_redesign_order_outcome(bigint, uuid, text)
  to service_role;

commit;
