create table if not exists public.version_history_clicks (
  id uuid primary key default gen_random_uuid(),
  store_id bigint not null references public.stores(id) on delete cascade,
  version text not null,
  clicked_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null
);

create index if not exists version_history_clicks_store_clicked_idx
  on public.version_history_clicks (store_id, clicked_at desc);

alter table public.version_history_clicks enable row level security;

comment on table public.version_history_clicks is
  'Auditoria temporaria de abertura do historico de versoes; acesso somente por rotas autenticadas do servidor.';
