-- Razao social e nome fantasia para clientes PJ.
alter table public.customers
  add column if not exists razao_social text,
  add column if not exists nome_fantasia text;

update public.customers
set razao_social = nullif(trim(full_name), '')
where person_type = 'PJ' and razao_social is null;
