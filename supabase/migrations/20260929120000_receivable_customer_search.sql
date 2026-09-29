-- Busca de clientes com parcelas em aberto, sem depender da primeira letra
-- nem limitar parcelas antes de identificar o cliente.
create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.normalize_receivable_customer_name(p_value text)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  return btrim(regexp_replace(lower(unaccent(coalesce(p_value, ''))), '[^[:alnum:]]+', ' ', 'g'));
end;
$$;

alter table public.customers
  add column if not exists receivable_search_name text not null default '';

create or replace function public.set_receivable_customer_name()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.receivable_search_name := public.normalize_receivable_customer_name(new.full_name);
  return new;
end;
$$;

drop trigger if exists customers_set_receivable_search_name on public.customers;
create trigger customers_set_receivable_search_name
  before insert or update of full_name, receivable_search_name on public.customers
  for each row execute function public.set_receivable_customer_name();

update public.customers
set receivable_search_name = public.normalize_receivable_customer_name(full_name)
where receivable_search_name is distinct from public.normalize_receivable_customer_name(full_name);

do $$
declare
  v_opclass_schema text;
begin
  select n.nspname into v_opclass_schema
  from pg_catalog.pg_opclass c
  join pg_catalog.pg_namespace n on n.oid = c.opcnamespace
  join pg_catalog.pg_am a on a.oid = c.opcmethod
  where c.opcname = 'gin_trgm_ops' and a.amname = 'gin'
  limit 1;

  if v_opclass_schema is null then
    raise exception 'Operador gin_trgm_ops indisponivel';
  end if;

  execute format(
    'create index if not exists customers_receivable_search_name_trgm_idx on public.customers using gin (receivable_search_name %I.gin_trgm_ops)',
    v_opclass_schema
  );
end;
$$;

create index if not exists financiamento_parcelas_receivable_customer_idx
  on public.financiamento_parcelas (store_id, customer_id, id)
  where valor_parcela > 0.01;

create or replace function public.search_receivable_customer_ids(
  p_store_id bigint,
  p_term text,
  p_after_name text,
  p_after_id bigint,
  p_limit integer
)
returns table(customer_id bigint, sort_name text)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_normalized_term text := public.normalize_receivable_customer_name(p_term);
  v_tokens text[] := regexp_split_to_array(v_normalized_term, '[[:space:]]+');
  v_digits text := regexp_replace(coalesce(p_term, ''), '[^0-9]', '', 'g');
  v_document_search boolean := coalesce(p_term, '') ~ '^[-0-9[:space:].()/+]+$';
  v_limit integer := least(greatest(coalesce(p_limit, 31), 1), 51);
begin
  if p_store_id is null or p_store_id <= 0 then
    return;
  end if;

  if v_document_search then
    if length(v_digits) < 3 then return; end if;
  elsif length(v_normalized_term) < 3 then
    return;
  end if;

  return query
  select c.id::bigint, c.receivable_search_name
  from public.customers c
  where c.store_id = p_store_id
    and (p_after_name is null or (c.receivable_search_name, c.id::bigint) > (p_after_name, p_after_id))
    and (
      (
        v_document_search
        and (
          position(v_digits in regexp_replace(coalesce(c.cpf, ''), '[^0-9]', '', 'g')) > 0
          or position(v_digits in regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g')) > 0
        )
      )
      or (
        not v_document_search
        and c.receivable_search_name like '%' || v_tokens[1] || '%'
        and not exists (
          select 1 from unnest(v_tokens) as token(value)
          where position(token.value in c.receivable_search_name) = 0
        )
      )
    )
    and exists (
      select 1
      from public.financiamento_parcelas p
      left join public.financiamento_loja f on f.id = p.financiamento_id
      left join public.vendas v on v.id = f.venda_id
      where p.store_id = p_store_id
        and p.customer_id = c.id
        and p.valor_parcela > 0.01
        and lower(btrim(p.status::text)) not in ('pago', 'quitado', 'cancelado', 'cancelada')
        and lower(btrim(coalesce(v.status::text, ''))) <> 'cancelada'
    )
  order by c.receivable_search_name, c.id
  limit v_limit;
end;
$$;

revoke all on function public.search_receivable_customer_ids(bigint, text, text, bigint, integer) from public;
grant execute on function public.search_receivable_customer_ids(bigint, text, text, bigint, integer) to service_role;
