-- Run after 20261003150000. Disposable data, no AI or WhatsApp sending.
begin;
do $$
declare
  v_channel record;
  v_other_channel record;
  v_conversation bigint;
  v_other_conversation bigint;
  v_turn uuid := gen_random_uuid();
  v_other_turn uuid := gen_random_uuid();
  v_message uuid;
  v_human_message uuid;
  v_now timestamptz := now();
  v_summary jsonb;
  v_metadata jsonb := '{"shadowProcessing":{"sendsMessage":false,"classification":{"intent":"store_location","topicRelation":"change_topic"}}}'::jsonb;
  v_rejected boolean := false;
begin
  select id, tenant_id, store_id into strict v_channel
  from public.whatsapp_store_channels where store_id=1 order by id limit 1;

  insert into public.whatsapp_conversation_memory
    (tenant_id,store_id,channel_id,remote_phone,mode,summary)
  values (v_channel.tenant_id,1,v_channel.id,'full-validation-' || gen_random_uuid(), 'redesign',
    jsonb_build_object('activeTopic','installment_status','secondaryTopics','[]'::jsonb,
      'phase','waiting_human','humanControl','human_pending','pendingAction','awaiting_human',
      'customerControlMode','auto','attachmentStatus','none','subject','preserve_pending_installment',
      'handoffReason','human_handoff','lastHumanActivityAt',null,'humanActiveUntil',null,
      'updatedAt',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
  returning id into v_conversation;
  insert into public.whatsapp_conversation_messages
    (conversation_id,source_key,role,message_kind,message_text,occurred_at)
  values (v_conversation,'test:address','customer','text','Qual o endereco?',v_now)
  returning id into v_message;
  insert into public.whatsapp_conversation_turns(id,conversation_id,turn_key,status,opened_at,closes_at)
  values (v_turn,v_conversation,'test:full','processing',v_now,v_now);
  insert into public.whatsapp_conversation_turn_messages(turn_id,message_id,position)
  values (v_turn,v_message,0);

  v_summary := public.finish_whatsapp_redesign_shadow_turn(v_turn,v_metadata);
  if v_summary->>'activeTopic' is distinct from 'store_location'
    or v_summary->>'humanControl' is distinct from 'human_pending'
    or v_summary->>'pendingAction' is distinct from 'awaiting_human'
    or v_summary->>'subject' is distinct from 'preserve_pending_installment'
    or v_summary->>'humanActiveUntil' is not null then
    raise exception 'Full routing lost topic or pending control: %',v_summary;
  end if;

  insert into public.whatsapp_conversation_messages
    (conversation_id,source_key,role,message_kind,message_text,occurred_at,metadata)
  values (v_conversation,'test:manual','human','text','Atendimento manual de teste',v_now,
    '{"deliveryStatus":"sent"}'::jsonb) returning id into v_human_message;
  perform public.record_whatsapp_conversation_control_event(v_conversation,'test:assume','assume',v_now,
    'validation',v_human_message,null);
  update public.whatsapp_conversation_turns set status='processing' where id=v_turn;
  v_summary := public.finish_whatsapp_redesign_shadow_turn(v_turn,v_metadata);
  if v_summary->>'humanControl' is distinct from 'human_active'
    or abs(extract(epoch from ((v_summary->>'humanActiveUntil')::timestamptz-v_now))-7200)>0.01 then
    raise exception 'Confirmed manual activity did not retain two-hour pause';
  end if;

  -- Rollback of the rollout preserves the same conversation and summary.
  update public.whatsapp_conversation_memory set mode='shadow' where id=v_conversation;
  update public.whatsapp_conversation_turns set status='processing' where id=v_turn;
  v_summary := public.finish_whatsapp_redesign_shadow_turn(v_turn,v_metadata);
  if v_summary->>'humanControl' is distinct from 'human_active'
    or v_summary->>'subject' is distinct from 'preserve_pending_installment' then
    raise exception 'Returning to shadow lost conversation state';
  end if;

  -- A decision processor must never finalize metadata claiming to send itself.
  begin
    perform public.finish_whatsapp_redesign_shadow_turn(v_turn,
      jsonb_set(v_metadata,'{shadowProcessing,sendsMessage}','true'::jsonb));
  exception when others then
    if sqlerrm='finalizacao sombra invalida' then v_rejected:=true; else raise; end if;
  end;
  if not v_rejected then raise exception 'Sending guard was bypassed'; end if;

  select id,tenant_id,store_id into v_other_channel
  from public.whatsapp_store_channels where store_id<>1 order by id limit 1;
  if found then
    insert into public.whatsapp_conversation_memory(tenant_id,store_id,channel_id,remote_phone,mode,summary)
    values(v_other_channel.tenant_id,v_other_channel.store_id,v_other_channel.id,
      'full-validation-other-' || gen_random_uuid(),'redesign',v_summary) returning id into v_other_conversation;
    insert into public.whatsapp_conversation_turns(id,conversation_id,turn_key,status,opened_at,closes_at)
    values(v_other_turn,v_other_conversation,'test:other','processing',v_now,v_now);
    v_rejected:=false;
    begin
      perform public.finish_whatsapp_redesign_shadow_turn(v_other_turn,v_metadata);
    exception when others then
      if sqlerrm='conversa fora do escopo de processamento do redesign' then v_rejected:=true; else raise; end if;
    end;
    if not v_rejected then raise exception 'Full routing escaped Store 1'; end if;
  else
    raise exception 'No second store channel available for isolation validation';
  end if;
  raise notice 'VALIDACAO_FULL_REDESIGN_OK: memory, handoff, manual pause, rollback, isolation and sending guard';
end;
$$;
rollback;
