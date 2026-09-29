-- Executar depois da migracao 20260929120000. Somente leitura.
-- Requer o caso Aguiar Joao com parcelas em aberto na Loja 2.
begin;

do $$
declare
  v_target_id bigint;
  v_cpf_digits text;
begin
  if public.normalize_receivable_customer_name('João') <> 'joao'
    or public.normalize_receivable_customer_name('ÁGUIAR JOÃO') <> 'aguiar joao' then
    raise exception 'Normalizacao de acentos da busca de recebimentos falhou';
  end if;

  if exists (
    select 1 from public.customers c
    where c.receivable_search_name is distinct from public.normalize_receivable_customer_name(c.full_name)
  ) then
    raise exception 'Ha clientes sem nome de busca atualizado';
  end if;

  select c.id, regexp_replace(coalesce(c.cpf, ''), '[^0-9]', '', 'g')
  into v_target_id, v_cpf_digits
  from public.customers c
  where c.store_id = 2
    and c.receivable_search_name like '%aguiar%'
    and c.receivable_search_name like '%joao%'
    and exists (
      select 1 from public.financiamento_parcelas p
      where p.store_id = 2 and p.customer_id = c.id
        and p.valor_parcela > 0.01
        and lower(btrim(p.status::text)) not in ('pago', 'quitado', 'cancelado', 'cancelada')
    )
  order by c.id
  limit 1;

  if v_target_id is null then
    raise exception 'Cliente de referencia da Loja 2 nao encontrado';
  end if;

  if not exists (select 1 from public.search_receivable_customer_ids(2, 'aguiar', null, null, 51) where customer_id = v_target_id)
    or not exists (select 1 from public.search_receivable_customer_ids(2, 'joao', null, null, 51) where customer_id = v_target_id)
    or not exists (select 1 from public.search_receivable_customer_ids(2, 'joao aguiar', null, null, 51) where customer_id = v_target_id) then
    raise exception 'Cliente com parcelas nao apareceu nas buscas por nome';
  end if;

  if length(v_cpf_digits) >= 3
    and not exists (
      select 1 from public.search_receivable_customer_ids(2, v_cpf_digits, null, null, 51)
      where customer_id = v_target_id
    ) then
    raise exception 'Cliente com parcelas nao apareceu na busca por CPF';
  end if;

  if exists (
    select 1
    from public.search_receivable_customer_ids(2, 'joao', null, null, 51) found
    join public.customers c on c.id = found.customer_id
    where c.store_id <> 2
  ) then
    raise exception 'Busca misturou clientes de outra loja';
  end if;

  raise notice 'VALIDACAO_BUSCA_RECEBIMENTOS_OK';
end;
$$;

rollback;
