-- Alinha a unicidade do CNPJ ao escopo de cliente por loja.
drop index if exists public.customers_cnpj_key;

create unique index if not exists customers_store_cnpj_key
  on public.customers (store_id, cnpj)
  where cnpj is not null;
