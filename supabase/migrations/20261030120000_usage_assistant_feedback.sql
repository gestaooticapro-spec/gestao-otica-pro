create table if not exists public.usage_assistant_feedback (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  store_id bigint not null references public.stores(id),
  user_id uuid not null references auth.users(id),
  question text not null check (char_length(question) between 1 and 1800),
  answer text not null check (char_length(answer) between 1 and 6000),
  created_at timestamptz not null default now()
);

create index if not exists usage_assistant_feedback_store_created_idx
  on public.usage_assistant_feedback (store_id, created_at desc);

alter table public.usage_assistant_feedback enable row level security;
revoke all on public.usage_assistant_feedback from anon, authenticated;
grant select, insert on public.usage_assistant_feedback to service_role;
