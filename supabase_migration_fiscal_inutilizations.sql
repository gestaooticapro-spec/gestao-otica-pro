-- Histórico local de inutilizações NFC-e/NF-e para emissão de comprovantes
create table if not exists public.fiscal_inutilizations (
    id bigserial primary key,
    store_id bigint not null references public.stores(id) on delete cascade,
    tenant_id uuid null,
    environment text not null check (environment in ('production', 'homologation')),
    model text not null default 'NFCe',
    year integer not null,
    serie integer not null,
    numero_inicial integer not null,
    numero_final integer not null,
    justificativa text not null,
    protocol text null,
    external_id text null,
    status text null,
    response_json jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_fiscal_inutilizations_store_year
    on public.fiscal_inutilizations (store_id, year, environment);

create unique index if not exists uq_fiscal_inutilizations_external
    on public.fiscal_inutilizations (external_id)
    where external_id is not null;

create or replace function public.set_updated_at_fiscal_inutilizations()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_set_updated_at_fiscal_inutilizations on public.fiscal_inutilizations;
create trigger trg_set_updated_at_fiscal_inutilizations
before update on public.fiscal_inutilizations
for each row execute function public.set_updated_at_fiscal_inutilizations();
