alter table public.whatsapp_status_publications
  add column if not exists context_category text,
  add column if not exists context_description text,
  add column if not exists response_guidance text,
  add column if not exists auto_reply_enabled boolean not null default true,
  add column if not exists contextualized_at timestamptz,
  add column if not exists contextualized_by_user_id uuid;

create index if not exists whatsapp_status_publications_pending_context_idx
  on public.whatsapp_status_publications (store_id, published_at desc)
  where contextualized_at is null;

comment on column public.whatsapp_status_publications.context_description is
  'Descrição fornecida pela equipe para orientar respostas a interações com o Status.';
