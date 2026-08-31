-- Clientes existentes permanecem PF; novos cadastros podem representar PJ.
alter table public.customers
  add column if not exists person_type text,
  add column if not exists cnpj text;

update public.customers
set person_type = 'PF'
where person_type is null;

alter table public.customers
  alter column person_type set default 'PF',
  alter column person_type set not null;

alter table public.customers
  drop constraint if exists customers_person_type_check;

alter table public.customers
  add constraint customers_person_type_check
  check (person_type in ('PF', 'PJ'));

create unique index if not exists customers_store_cnpj_key
  on public.customers (store_id, cnpj)
  where cnpj is not null;

create index if not exists customers_store_person_type_idx
  on public.customers (store_id, person_type);
