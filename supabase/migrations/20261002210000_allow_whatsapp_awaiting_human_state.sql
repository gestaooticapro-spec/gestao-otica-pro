begin;

alter table public.whatsapp_conversation_states
  drop constraint if exists whatsapp_conversation_states_state_check;

alter table public.whatsapp_conversation_states
  add constraint whatsapp_conversation_states_state_check
  check (state = any (array[
    'ai_session'::text,
    'waiting_menu'::text,
    'waiting_identifier'::text,
    'awaiting_human'::text,
    'human_pause'::text,
    'silent'::text,
    'waiting_human_after_attachment'::text
  ]));

commit;
