-- Executar depois de 20261006120000. Fixtures descartaveis; nenhum recebimento externo.
begin;

do $$
declare
  v_scope record;
  v_sale bigint;
  v_financing bigint;
  v_received_installment bigint;
  v_payment bigint;
  v_result jsonb;
  v_sale_row public.vendas%rowtype;
  v_fin_row public.financiamento_loja%rowtype;
  v_audit public.installment_renegotiations%rowtype;
  v_installment public.financiamento_parcelas%rowtype;
  v_error text;
  v_audit_count bigint;
  v_before jsonb;
begin
  select s.id as store_id, s.tenant_id, e.id as employee_id, c.id as customer_id
  into v_scope
  from public.stores s
  join public.employees e on e.store_id = s.id and e.is_active is true
  join public.customers c on c.store_id = s.id and c.tenant_id = s.tenant_id
  order by s.id, e.id, c.id
  limit 1;
  if not found then raise exception 'Loja, funcionario e cliente de teste indisponiveis'; end if;

  -- Caso da entrada depois do carne: venda 900, carne 900 -> 700 + saldo 200.
  insert into public.vendas (tenant_id, store_id, customer_id, employee_id, status)
  values (v_scope.tenant_id, v_scope.store_id, v_scope.customer_id, v_scope.employee_id, 'Em Aberto')
  returning id into v_sale;
  insert into public.venda_itens (tenant_id, store_id, venda_id, quantidade, valor_unitario, valor_total_item, descricao)
  values (v_scope.tenant_id, v_scope.store_id, v_sale, 1, 900, 900, 'VALIDACAO_RENEGOCIACAO_ENTRADA');
  insert into public.financiamento_loja (
    tenant_id, store_id, venda_id, customer_id, employee_id,
    valor_total_financiado, quantidade_parcelas, data_inicio
  ) values (v_scope.tenant_id, v_scope.store_id, v_sale, v_scope.customer_id, v_scope.employee_id, 900, 3, current_date)
  returning id into v_financing;
  update public.vendas set financiamento_id = v_financing where id = v_sale;
  insert into public.financiamento_parcelas (
    tenant_id, store_id, financiamento_id, customer_id, numero_parcela, data_vencimento, valor_parcela, valor_pago, status
  ) select v_scope.tenant_id, v_scope.store_id, v_financing, v_scope.customer_id, n, current_date + n * 30, 300, 0, 'Pendente'
    from generate_series(1, 3) n;
  perform public.update_venda_financeiro(v_sale);
  if (select valor_restante from public.vendas where id = v_sale) <> 0 then
    raise exception 'Venda integralmente financiada deveria ter saldo zero';
  end if;

  v_result := public.renegotiate_store_financing(v_financing, v_sale, v_scope.store_id, v_scope.employee_id, null, v_scope.tenant_id,
    jsonb_build_array(
      jsonb_build_object('valor_parcela', 350, 'data_vencimento', current_date + 30),
      jsonb_build_object('valor_parcela', 350, 'data_vencimento', current_date + 60)
    ));
  select * into v_sale_row from public.vendas where id = v_sale;
  select * into v_fin_row from public.financiamento_loja where id = v_financing;
  select * into v_audit from public.installment_renegotiations where id = (v_result->>'renegotiation_id')::bigint;
  if v_sale_row.valor_restante <> 200 or v_sale_row.status <> 'Em Aberto'
     or v_fin_row.valor_total_financiado <> 700
     or v_audit.balance_renegotiated <> 900 or v_audit.balance_after <> 700 or v_audit.amount_returned_to_sale <> 200
     or (v_result->>'sale_balance')::numeric <> 200
     or jsonb_array_length(v_audit.installments_before) <> 3 or jsonb_array_length(v_audit.installments_created) <> 2 then
    raise exception 'Reducao 900 -> 700 nao devolveu 200 com auditoria: %', v_result;
  end if;
  if exists(select 1 from public.pagamentos where venda_id = v_sale)
     or (select sum(valor_parcela) from public.financiamento_parcelas where financiamento_id = v_financing) <> 700 then
    raise exception 'Renegociacao gerou recebimento ou parcelas incorretas';
  end if;

  -- Renegociar novamente o mesmo saldo nao devolve a diferenca duas vezes.
  v_result := public.renegotiate_store_financing(v_financing, v_sale, v_scope.store_id, v_scope.employee_id, null, v_scope.tenant_id,
    jsonb_build_array(jsonb_build_object('valor_parcela', 700, 'data_vencimento', current_date + 30)));
  if (v_result->>'amount_returned_to_sale')::numeric <> 0
     or (select valor_restante from public.vendas where id = v_sale) <> 200
     or (select valor_total_financiado from public.financiamento_loja where id = v_financing) <> 700 then
    raise exception 'Renegociar o mesmo saldo duplicou a devolucao';
  end if;

  -- Um novo pagamento direto recebe somente a diferenca; as parcelas continuam pendentes.
  insert into public.pagamentos (tenant_id, store_id, venda_id, customer_id, employee_id, valor_pago, forma_pagamento, data_pagamento)
  values (v_scope.tenant_id, v_scope.store_id, v_sale, v_scope.customer_id, v_scope.employee_id, 200, 'Dinheiro', current_date);
  perform public.update_venda_financeiro(v_sale);
  if (select valor_restante from public.vendas where id = v_sale) <> 0
     or exists(select 1 from public.financiamento_parcelas where financiamento_id = v_financing and status <> 'Pendente') then
    raise exception 'A entrada nao zerou o saldo ou baixou parcelas indevidamente';
  end if;

  -- Rejeitar aumento e reducao de venda fechada deve preservar integralmente o estado.
  update public.vendas set status = 'Fechada' where id = v_sale;
  select count(*) into v_audit_count from public.installment_renegotiations where financiamento_id = v_financing;
  select jsonb_agg(to_jsonb(fp) order by id) into v_before
  from public.financiamento_parcelas fp where financiamento_id = v_financing;
  v_error := null;
  begin
    perform public.renegotiate_store_financing(v_financing, v_sale, v_scope.store_id, v_scope.employee_id, null, v_scope.tenant_id,
      jsonb_build_array(jsonb_build_object('valor_parcela', 701, 'data_vencimento', current_date + 30)));
  exception when others then v_error := sqlerrm;
  end;
  if v_error is null or v_error not like '%nao pode superar%' then
    raise exception 'Aumento de saldo deveria ser rejeitado: %', v_error;
  end if;
  v_error := null;
  begin
    perform public.renegotiate_store_financing(v_financing, v_sale, v_scope.store_id, v_scope.employee_id, null, v_scope.tenant_id,
      jsonb_build_array(jsonb_build_object('valor_parcela', 600, 'data_vencimento', current_date + 30)));
  exception when others then v_error := sqlerrm;
  end;
  if v_error is null or v_error not like '%Em Aberto%' then
    raise exception 'Reducao de venda fechada deveria ser rejeitada: %', v_error;
  end if;
  if (select count(*) from public.installment_renegotiations where financiamento_id = v_financing) <> v_audit_count
     or (select jsonb_agg(to_jsonb(fp) order by id) from public.financiamento_parcelas fp where financiamento_id = v_financing) is distinct from v_before
     or (select valor_restante from public.vendas where id = v_sale) <> 0
     or (select valor_total_financiado from public.financiamento_loja where id = v_financing) <> 700 then
    raise exception 'Operacao rejeitada alterou parcelas, saldo ou auditoria';
  end if;
  v_result := public.renegotiate_store_financing(v_financing, v_sale, v_scope.store_id, v_scope.employee_id, null, v_scope.tenant_id,
    jsonb_build_array(jsonb_build_object('valor_parcela', 700, 'data_vencimento', current_date + 60)));
  if (v_result->>'amount_returned_to_sale')::numeric <> 0 then
    raise exception 'Venda fechada nao preservou o saldo na redistribuicao';
  end if;

  -- Entrada anterior 100 + carne 900; parcela recebeu 100: pendente 800 -> 700.
  -- O carne formalizado fica 800 (recebido 100 + futuro 700), e a venda recebe saldo 100.
  insert into public.vendas (tenant_id, store_id, customer_id, employee_id, status)
  values (v_scope.tenant_id, v_scope.store_id, v_scope.customer_id, v_scope.employee_id, 'Em Aberto')
  returning id into v_sale;
  insert into public.venda_itens (tenant_id, store_id, venda_id, quantidade, valor_unitario, valor_total_item, descricao)
  values (v_scope.tenant_id, v_scope.store_id, v_sale, 1, 1000, 1000, 'VALIDACAO_RENEGOCIACAO_RECEBIMENTO');
  insert into public.pagamentos (tenant_id, store_id, venda_id, customer_id, employee_id, valor_pago, forma_pagamento, data_pagamento)
  values (v_scope.tenant_id, v_scope.store_id, v_sale, v_scope.customer_id, v_scope.employee_id, 100, 'Dinheiro', current_date);
  insert into public.financiamento_loja (
    tenant_id, store_id, venda_id, customer_id, employee_id, valor_total_financiado, quantidade_parcelas, data_inicio
  ) values (v_scope.tenant_id, v_scope.store_id, v_sale, v_scope.customer_id, v_scope.employee_id, 900, 3, current_date)
  returning id into v_financing;
  update public.vendas set financiamento_id = v_financing where id = v_sale;
  insert into public.financiamento_parcelas (
    tenant_id, store_id, financiamento_id, customer_id, numero_parcela, data_vencimento, valor_parcela, valor_pago, status
  ) select v_scope.tenant_id, v_scope.store_id, v_financing, v_scope.customer_id, n, current_date + n * 30, 300, 0, 'Pendente'
    from generate_series(1, 3) n;
  select id into v_received_installment from public.financiamento_parcelas where financiamento_id = v_financing and numero_parcela = 1;
  insert into public.pagamentos (tenant_id, store_id, venda_id, customer_id, employee_id, parcela_id, valor_pago, forma_pagamento, data_pagamento)
  values (v_scope.tenant_id, v_scope.store_id, v_sale, v_scope.customer_id, v_scope.employee_id, v_received_installment, 100, 'Dinheiro', current_date)
  returning id into v_payment;
  update public.financiamento_parcelas set valor_pago = 100 where id = v_received_installment;
  perform public.update_venda_financeiro(v_sale);
  if (select valor_restante from public.vendas where id = v_sale) <> 0 then
    raise exception 'Recebimento de parcela foi descontado novamente da venda';
  end if;

  v_result := public.renegotiate_store_financing(v_financing, v_sale, v_scope.store_id, v_scope.employee_id, null, v_scope.tenant_id,
    jsonb_build_array(jsonb_build_object('valor_parcela', 700, 'data_vencimento', current_date + 30)));
  select * into v_installment from public.financiamento_parcelas where id = v_received_installment;
  select * into v_audit from public.installment_renegotiations where id = (v_result->>'renegotiation_id')::bigint;
  if v_installment.id is null or v_installment.valor_pago <> 100 or v_installment.valor_renegociado_saida <> 200 or v_installment.status <> 'Pago'
     or not exists(select 1 from public.pagamentos where id = v_payment and parcela_id = v_received_installment and valor_pago = 100)
     or (select valor_total_financiado from public.financiamento_loja where id = v_financing) <> 800
     or (select valor_restante from public.vendas where id = v_sale) <> 100
     or v_audit.balance_renegotiated <> 800 or v_audit.balance_after <> 700 or v_audit.amount_returned_to_sale <> 100
     or (v_result->>'preserved_installment_count')::integer <> 1 then
    raise exception 'Recebimento anterior nao foi preservado corretamente: %', v_result;
  end if;

  -- Repetir uma reducao de um centavo preserva recebimentos e principal formalizado.
  v_result := public.renegotiate_store_financing(v_financing, v_sale, v_scope.store_id, v_scope.employee_id, null, v_scope.tenant_id,
    jsonb_build_array(jsonb_build_object('valor_parcela', 699.99, 'data_vencimento', current_date + 60)));
  if (select valor_total_financiado from public.financiamento_loja where id = v_financing) <> 799.99
     or (select valor_restante from public.vendas where id = v_sale) <> 100.01
     or (v_result->>'amount_returned_to_sale')::numeric <> 0.01
     or (select valor_pago from public.financiamento_parcelas where id = v_received_installment) <> 100 then
    raise exception 'Reducao em centavos nao preservou o principal: %', v_result;
  end if;

  raise notice 'VALIDACAO_RENEGOCIACAO_ENTRADA_OK: 900 -> 700 + 200, recebimentos, repeticao, bloqueios, auditoria e centavos; rollback a seguir';
end;
$$;

rollback;
