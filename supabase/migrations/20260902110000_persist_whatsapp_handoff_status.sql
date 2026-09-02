-- Mantém o estado operacional do handoff na conversa atual. A Central de
-- WhatsApp consulta estes campos diretamente, sem recalcular o histórico de
-- mensagens outbound a cada abertura.
alter table public.whatsapp_conversation_states
  add column if not exists handoff_pending boolean not null default false,
  add column if not exists handoff_origin text,
  add column if not exists handoff_at timestamptz,
  add column if not exists operator_answered_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_conversation_states_handoff_origin_check'
  ) then
    alter table public.whatsapp_conversation_states
      add constraint whatsapp_conversation_states_handoff_origin_check
      check (handoff_origin is null or handoff_origin in ('attachment', 'general'));
  end if;
end $$;

-- Backfill conservador dos estados que já representavam um handoff ativo.
-- Novas transições passam a atualizar os campos pela aplicação.
update public.whatsapp_conversation_states
set
  handoff_pending = true,
  handoff_origin = case
    when state = 'waiting_human_after_attachment' then 'attachment'
    else 'general'
  end,
  handoff_at = updated_at,
  operator_answered_at = null
where expires_at > now()
  and (
    state = 'waiting_human_after_attachment'
    or coalesce(metadata ->> 'lastAction', metadata ->> 'action') = 'human_handoff'
  );

create index if not exists idx_whatsapp_conversation_states_store_pending_handoff
  on public.whatsapp_conversation_states (store_id, updated_at desc)
  where handoff_pending = true;
