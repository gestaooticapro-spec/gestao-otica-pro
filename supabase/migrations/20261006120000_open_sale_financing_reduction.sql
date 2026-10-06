-- Uma venda em aberto pode devolver parte do saldo do carne para pagamento direto.
-- Recebimentos anteriores continuam pertencendo ao carne e sao preservados.
alter table public.installment_renegotiations
  add column if not exists balance_after numeric(14,2),
  add column if not exists amount_returned_to_sale numeric(14,2) not null default 0;

update public.installment_renegotiations
set balance_after = balance_renegotiated
where balance_after is null;

alter table public.installment_renegotiations
  alter column balance_after set not null,
  drop constraint if exists installment_renegotiations_balance_after_check,
  add constraint installment_renegotiations_balance_after_check
    check (balance_after > 0 and amount_returned_to_sale >= 0
      and balance_after + amount_returned_to_sale = balance_renegotiated);

create or replace function public.renegotiate_store_financing(
  p_financing_id bigint,
  p_sale_id bigint,
  p_store_id bigint,
  p_employee_id bigint,
  p_user_id uuid,
  p_tenant_id uuid,
  p_installments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fin public.financiamento_loja%rowtype;
  v_sale public.vendas%rowtype;
  v_row public.financiamento_parcelas%rowtype;
  v_item jsonb;
  v_snapshot jsonb;
  v_created jsonb := '[]'::jsonb;
  v_balance numeric(14,2) := 0;
  v_item_total numeric(14,2) := 0;
  v_returned_to_sale numeric(14,2) := 0;
  v_financed_total_after numeric(14,2);
  v_row_paid numeric(14,2);
  v_row_balance numeric(14,2);
  v_had_receipt boolean;
  v_preserved_count integer := 0;
  v_next_number integer := 0;
  v_created_count integer := 0;
  v_renegotiation_id bigint;
  v_new_installment public.financiamento_parcelas%rowtype;
  v_first_due date;
begin
  if coalesce(jsonb_typeof(p_installments), '') <> 'array'
     or jsonb_array_length(p_installments) = 0 then
    raise exception 'Informe ao menos uma nova parcela para a renegociacao.';
  end if;

  select * into v_fin
  from public.financiamento_loja
  where id = p_financing_id
    and venda_id = p_sale_id
    and store_id = p_store_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Carne nao encontrado para esta venda.';
  end if;

  select * into v_sale
  from public.vendas
  where id = p_sale_id
    and store_id = p_store_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Venda nao encontrada.';
  end if;
  if lower(coalesce(v_sale.status, '')) = 'cancelada' then
    raise exception 'Venda cancelada nao pode ser renegociada.';
  end if;
  if v_sale.is_historical_import is true then
    raise exception 'Carne historico importado nao pode ser renegociado.';
  end if;

  perform 1
  from public.employees
  where id = p_employee_id
    and store_id = p_store_id
    and is_active is true;
  if not found then
    raise exception 'Funcionario nao autorizado nesta loja.';
  end if;

  -- Mesma ordem de bloqueio dos recebimentos: carne, venda, parcelas.
  for v_row in
    select * from public.financiamento_parcelas
    where financiamento_id = p_financing_id
    order by numero_parcela, id
    for update
  loop
    null;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(fp) order by fp.numero_parcela, fp.id), '[]'::jsonb)
  into v_snapshot
  from public.financiamento_parcelas fp
  where fp.financiamento_id = p_financing_id;

  for v_row in
    select * from public.financiamento_parcelas
    where financiamento_id = p_financing_id
    order by numero_parcela, id
  loop
    select coalesce(sum(p.valor_pago), 0)
    into v_row_paid
    from public.pagamentos p
    where p.parcela_id = v_row.id;

    v_row_paid := greatest(coalesce(v_row.valor_pago, 0), coalesce(v_row_paid, 0));
    v_row_balance := case
      when lower(coalesce(v_row.status, '')) = 'pago' then 0
      else greatest(0, round(
        coalesce(v_row.valor_parcela, 0)
        + coalesce(v_row.valor_transferido_entrada, 0)
        - v_row_paid
        - coalesce(v_row.valor_transferido_saida, 0)
        - coalesce(v_row.valor_renegociado_saida, 0), 2
      ))
    end;
    v_balance := v_balance + v_row_balance;
  end loop;
  v_balance := round(v_balance, 2);

  if v_balance <= 0 then
    raise exception 'Este carne nao possui saldo em aberto para renegociar.';
  end if;

  for v_item in select value from jsonb_array_elements(p_installments)
  loop
    if coalesce(round((v_item->>'valor_parcela')::numeric, 2), 0) <= 0
       or nullif(v_item->>'data_vencimento', '') is null then
      raise exception 'As novas parcelas precisam de valor e vencimento validos.';
    end if;
    v_item_total := v_item_total + round((v_item->>'valor_parcela')::numeric, 2);
  end loop;
  v_item_total := round(v_item_total, 2);

  select min((value->>'data_vencimento')::date)
  into v_first_due
  from jsonb_array_elements(p_installments);

  if v_item_total > v_balance then
    raise exception 'A soma das novas parcelas (%) nao pode superar o saldo a renegociar (%).', v_item_total, v_balance;
  end if;

  v_returned_to_sale := round(v_balance - v_item_total, 2);
  if v_returned_to_sale > 0 and lower(coalesce(v_sale.status, '')) <> 'em aberto' then
    raise exception 'O valor do carne so pode ser reduzido quando a venda estiver Em Aberto.';
  end if;

  -- Reduz apenas a parte ainda nao recebida. O principal ja recebido segue na capa,
  -- pois pagamentos de parcelas nao sao pagamentos diretos da venda.
  v_financed_total_after := round(v_fin.valor_total_financiado - v_returned_to_sale, 2);
  if v_financed_total_after < 0 then
    raise exception 'O valor formalizado no carne e inconsistente com o saldo das parcelas.';
  end if;

  insert into public.installment_renegotiations (
    tenant_id, store_id, financiamento_id, venda_id, customer_id,
    authorized_by_employee_id, authorized_by_user_id, balance_renegotiated,
    balance_after, amount_returned_to_sale, installments_before, installments_created
  ) values (
    p_tenant_id, p_store_id, p_financing_id, p_sale_id, v_fin.customer_id,
    p_employee_id, p_user_id, v_balance, v_item_total, v_returned_to_sale, v_snapshot, p_installments
  ) returning id into v_renegotiation_id;

  -- Mantem qualquer parcela que recebeu dinheiro e encerra o saldo antigo dela.
  for v_row in
    select * from public.financiamento_parcelas
    where financiamento_id = p_financing_id
    order by numero_parcela, id
  loop
    select coalesce(sum(p.valor_pago), 0), exists(select 1 from public.pagamentos p where p.parcela_id = v_row.id)
    into v_row_paid, v_had_receipt
    from public.pagamentos p
    where p.parcela_id = v_row.id;
    v_row_paid := greatest(coalesce(v_row.valor_pago, 0), coalesce(v_row_paid, 0));

    if v_had_receipt or v_row_paid > 0.01 then
      v_row_balance := case
        when lower(coalesce(v_row.status, '')) = 'pago' then 0
        else greatest(0, round(
          coalesce(v_row.valor_parcela, 0)
          + coalesce(v_row.valor_transferido_entrada, 0)
          - v_row_paid
          - coalesce(v_row.valor_transferido_saida, 0)
          - coalesce(v_row.valor_renegociado_saida, 0), 2
        ))
      end;

      update public.financiamento_parcelas
      set valor_pago = v_row_paid,
          valor_renegociado_saida = round(coalesce(valor_renegociado_saida, 0) + v_row_balance, 2),
          status = 'Pago',
          data_pagamento = coalesce(
            data_pagamento,
            (select max(p.data_pagamento)::date from public.pagamentos p where p.parcela_id = v_row.id),
            current_date
          ),
          obs = case when v_row_balance > 0.01 then
            concat_ws(' | ', nullif(obs, ''), format('Saldo de R$ %s encerrado na renegociacao #%s', to_char(v_row_balance, 'FM999999990D00'), v_renegotiation_id))
          else obs end
      where id = v_row.id;
      v_preserved_count := v_preserved_count + 1;
    end if;
  end loop;

  delete from public.financiamento_parcelas fp
  where fp.financiamento_id = p_financing_id
    and coalesce(fp.valor_pago, 0) <= 0.01
    and lower(coalesce(fp.status, '')) <> 'pago'
    and not exists (select 1 from public.pagamentos p where p.parcela_id = fp.id);

  select coalesce(max(numero_parcela), 0)
  into v_next_number
  from public.financiamento_parcelas
  where financiamento_id = p_financing_id;

  for v_item in select value from jsonb_array_elements(p_installments)
  loop
    v_next_number := v_next_number + 1;
    insert into public.financiamento_parcelas (
      tenant_id, store_id, financiamento_id, customer_id, numero_parcela,
      data_vencimento, valor_parcela, valor_pago, status,
      valor_transferido_entrada, valor_transferido_saida, valor_renegociado_saida
    ) values (
      p_tenant_id, p_store_id, p_financing_id, v_fin.customer_id, v_next_number,
      (v_item->>'data_vencimento')::date, round((v_item->>'valor_parcela')::numeric, 2), 0, 'Pendente',
      0, 0, 0
    ) returning * into v_new_installment;
    v_created := v_created || jsonb_build_array(to_jsonb(v_new_installment));
    v_created_count := v_created_count + 1;
  end loop;

  update public.installment_renegotiations
  set installments_created = v_created
  where id = v_renegotiation_id;

  update public.financiamento_loja
  set valor_total_financiado = v_financed_total_after,
      quantidade_parcelas = (
        select count(*) from public.financiamento_parcelas where financiamento_id = p_financing_id
      ),
      data_inicio = v_first_due
  where id = p_financing_id;

  perform public.update_venda_financeiro(p_sale_id);
  select * into v_sale from public.vendas where id = p_sale_id;

  return jsonb_build_object(
    'renegotiation_id', v_renegotiation_id,
    'balance_renegotiated', v_balance,
    'balance_after', v_item_total,
    'amount_returned_to_sale', v_returned_to_sale,
    'sale_balance', v_sale.valor_restante,
    'preserved_installment_count', v_preserved_count,
    'created_installment_count', v_created_count
  );
end;
$$;

revoke all on function public.renegotiate_store_financing(bigint, bigint, bigint, bigint, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.renegotiate_store_financing(bigint, bigint, bigint, bigint, uuid, uuid, jsonb) to service_role;
