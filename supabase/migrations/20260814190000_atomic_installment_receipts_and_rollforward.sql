-- Mantem o valor nominal contratado da parcela separado dos saldos que foram
-- transferidos entre vencimentos. O saldo efetivo e sempre:
-- nominal + transferido_entrada - pago - transferido_saida.
alter table public.financiamento_parcelas
  add column if not exists valor_transferido_entrada numeric(14,2) not null default 0,
  add column if not exists valor_transferido_saida numeric(14,2) not null default 0;

alter table public.financiamento_parcelas
  drop constraint if exists financiamento_parcelas_transferencias_nao_negativas,
  add constraint financiamento_parcelas_transferencias_nao_negativas check (
    valor_transferido_entrada >= 0 and valor_transferido_saida >= 0
  );

alter table public.installment_receipt_operations
  add column if not exists transferred_amount numeric(14,2) not null default 0,
  add column if not exists destination_installment_id bigint;

-- Todo o recebimento ocorre dentro da mesma transacao. O lock ordenado das
-- parcelas impede duas baixas concorrentes de perderem atualizacoes.
create or replace function public.receive_installment_payment(
  p_installment_id bigint,
  p_sale_id bigint,
  p_store_id bigint,
  p_employee_id bigint,
  p_user_id uuid,
  p_tenant_id uuid,
  p_received_amount numeric,
  p_interest_amount numeric,
  p_received_on date,
  p_strategy text,
  p_receipts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origin public.financiamento_parcelas%rowtype;
  v_installment public.financiamento_parcelas%rowtype;
  v_next public.financiamento_parcelas%rowtype;
  v_financing public.financiamento_loja%rowtype;
  v_sale public.vendas%rowtype;
  v_employee public.employees%rowtype;
  v_operation_id bigint;
  v_financing_id bigint;
  v_principal numeric(14,2);
  v_received numeric(14,2) := round(coalesce(p_received_amount, 0), 2);
  v_interest numeric(14,2) := round(coalesce(p_interest_amount, 0), 2);
  v_receipts_total numeric(14,2);
  v_payment_method text;
  v_strategy text;
  v_origin_balance numeric(14,2);
  v_installment_balance numeric(14,2);
  v_remaining numeric(14,2);
  v_applied numeric(14,2);
  v_transfer numeric(14,2) := 0;
  v_destination_id bigint;
  v_allocations jsonb := '[]'::jsonb;
  v_allocation jsonb;
  v_allocation_remaining numeric(14,2);
  v_receipt_index integer := 0;
  v_receipt_remaining numeric(14,2) := 0;
  v_receipt jsonb;
  v_piece numeric(14,2);
  v_payment public.pagamentos%rowtype;
  v_payments jsonb := '[]'::jsonb;
  v_payment_ids jsonb := '[]'::jsonb;
  v_installment_ids jsonb := '[]'::jsonb;
  v_installments_before jsonb;
  v_installments_after jsonb;
  v_sale_before jsonb;
  v_sale_after jsonb;
  v_affected_count integer;
  v_historical_balance numeric(14,2);
begin
  if v_received <= 0 then
    raise exception 'O valor recebido deve ser maior que zero.';
  end if;
  if v_interest < 0 or v_interest > v_received then
    raise exception 'O valor de juros e invalido.';
  end if;
  v_principal := round(v_received - v_interest, 2);

  if jsonb_typeof(p_receipts) <> 'array' or jsonb_array_length(p_receipts) = 0 then
    raise exception 'Informe ao menos uma forma de recebimento.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_receipts) item
    where trim(coalesce(item->>'forma_pagamento', '')) = ''
       or coalesce((item->>'valor')::numeric, 0) <= 0
  ) then
    raise exception 'As formas de recebimento sao invalidas.';
  end if;

  select round(coalesce(sum((item->>'valor')::numeric), 0), 2),
         string_agg(item->>'forma_pagamento', ' + ' order by ordinality)
    into v_receipts_total, v_payment_method
  from jsonb_array_elements(p_receipts) with ordinality as receipt(item, ordinality);

  if v_receipts_total <> v_received then
    raise exception 'A soma das formas de recebimento difere do total informado.';
  end if;

  select financiamento_id into v_financing_id
  from public.financiamento_parcelas
  where id = p_installment_id;
  if v_financing_id is null then raise exception 'Parcela nao encontrada.'; end if;

  -- Todas as chamadas concorrentes deste carne adquirem locks na mesma ordem.
  perform id
  from public.financiamento_parcelas
  where financiamento_id = v_financing_id
  order by numero_parcela, id
  for update;

  select * into v_origin
  from public.financiamento_parcelas
  where id = p_installment_id;

  select * into v_financing
  from public.financiamento_loja
  where id = v_origin.financiamento_id;
  if not found or v_financing.venda_id <> p_sale_id then
    raise exception 'Carne e venda nao correspondem.';
  end if;

  select * into v_sale from public.vendas where id = p_sale_id and store_id = p_store_id;
  if not found then raise exception 'Venda nao encontrada nesta loja.'; end if;

  if v_origin.store_id <> p_store_id
     or v_origin.tenant_id is distinct from p_tenant_id then
    raise exception 'Parcela nao pertence a loja informada.';
  end if;

  select * into v_employee
  from public.employees
  where id = p_employee_id and store_id = p_store_id and is_active = true;
  if not found then raise exception 'Funcionario nao autorizado nesta loja.'; end if;

  v_origin_balance := greatest(0, round(
    coalesce(v_origin.valor_parcela, 0)
    + coalesce(v_origin.valor_transferido_entrada, 0)
    - coalesce(v_origin.valor_pago, 0)
    - coalesce(v_origin.valor_transferido_saida, 0), 2
  ));

  if lower(coalesce(v_origin.status, '')) <> 'pendente' or v_origin_balance <= 0 then
    raise exception 'Esta parcela ja esta quitada.';
  end if;
  if v_principal <= 0 then
    raise exception 'Informe um valor de principal para abater a parcela.';
  end if;

  v_strategy := case
    when v_principal < v_origin_balance and p_strategy = 'somar_proxima' then 'somar_proxima'
    when v_principal < v_origin_balance then 'baixa_parcial'
    else 'quitacao_total'
  end;

  if v_strategy = 'somar_proxima' then
    select * into v_next
    from public.financiamento_parcelas
    where financiamento_id = v_origin.financiamento_id
      and numero_parcela > v_origin.numero_parcela
      and lower(coalesce(status, '')) = 'pendente'
    order by numero_parcela, id
    limit 1;
    if not found then
      raise exception 'Nao existe proxima parcela para receber o saldo restante.';
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(fp) order by fp.numero_parcela, fp.id), '[]'::jsonb)
    into v_installments_before
  from public.financiamento_parcelas fp
  where fp.financiamento_id = v_origin.financiamento_id;

  select to_jsonb(v_sale) into v_sale_before;

  insert into public.installment_receipt_operations (
    tenant_id, store_id, financiamento_id, venda_id, customer_id,
    origin_installment_id, received_amount, interest_amount, payment_method,
    strategy, received_on, received_by_employee_id, created_by_user_id,
    installments_before, sale_before, state
  ) values (
    p_tenant_id, p_store_id, v_origin.financiamento_id, p_sale_id,
    v_origin.customer_id, v_origin.id, v_received, v_interest,
    v_payment_method, v_strategy, p_received_on, p_employee_id, p_user_id,
    v_installments_before, v_sale_before, 'pending'
  ) returning id into v_operation_id;

  if v_strategy = 'somar_proxima' then
    v_transfer := round(v_origin_balance - v_principal, 2);
    v_destination_id := v_next.id;

    update public.financiamento_parcelas
    set valor_pago = round(coalesce(valor_pago, 0) + v_principal, 2),
        valor_transferido_saida = round(coalesce(valor_transferido_saida, 0) + v_transfer, 2),
        status = 'Pago',
        data_pagamento = p_received_on
    where id = v_origin.id;

    update public.financiamento_parcelas
    set valor_transferido_entrada = round(coalesce(valor_transferido_entrada, 0) + v_transfer, 2)
    where id = v_next.id;

    v_allocations := jsonb_build_array(jsonb_build_object(
      'id', v_origin.id,
      'numero_parcela', v_origin.numero_parcela,
      'valor', round(v_principal + v_interest, 2)
    ));
  else
    v_remaining := v_principal;

    for v_installment in
      select *
      from public.financiamento_parcelas
      where financiamento_id = v_origin.financiamento_id
        and numero_parcela >= v_origin.numero_parcela
        and lower(coalesce(status, '')) = 'pendente'
      order by numero_parcela, id
    loop
      exit when v_remaining <= 0;
      v_installment_balance := greatest(0, round(
        coalesce(v_installment.valor_parcela, 0)
        + coalesce(v_installment.valor_transferido_entrada, 0)
        - coalesce(v_installment.valor_pago, 0)
        - coalesce(v_installment.valor_transferido_saida, 0), 2
      ));
      if v_installment_balance <= 0 then continue; end if;

      v_applied := least(v_remaining, v_installment_balance);
      update public.financiamento_parcelas
      set valor_pago = round(coalesce(valor_pago, 0) + v_applied, 2),
          status = case when v_applied = v_installment_balance then 'Pago' else 'Pendente' end,
          data_pagamento = case when v_applied = v_installment_balance then p_received_on else null end
      where id = v_installment.id;

      v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
        'id', v_installment.id,
        'numero_parcela', v_installment.numero_parcela,
        'valor', round(v_applied + case when v_installment.id = v_origin.id then v_interest else 0 end, 2)
      ));
      v_remaining := round(v_remaining - v_applied, 2);
    end loop;

    if v_remaining > 0 then
      raise exception 'O valor principal ultrapassa o saldo das parcelas deste carne.';
    end if;
  end if;

  -- Divide cada alocacao pelas formas de recebimento sem perder a relacao
  -- entre o recibo fisico e as parcelas efetivamente abatidas.
  v_receipt := p_receipts->v_receipt_index;
  v_receipt_remaining := round((v_receipt->>'valor')::numeric, 2);

  for v_allocation in select value from jsonb_array_elements(v_allocations)
  loop
    v_allocation_remaining := round((v_allocation->>'valor')::numeric, 2);
    while v_allocation_remaining > 0 loop
      if v_receipt is null then
        raise exception 'Nao foi possivel distribuir as formas de recebimento.';
      end if;
      v_piece := least(v_allocation_remaining, v_receipt_remaining);

      insert into public.pagamentos (
        tenant_id, store_id, venda_id, parcela_id, customer_id, employee_id,
        created_by_user_id, valor_pago, forma_pagamento, data_pagamento,
        created_at, parcelas, receipt_operation_id, obs
      ) values (
        p_tenant_id, p_store_id, p_sale_id, (v_allocation->>'id')::bigint,
        v_origin.customer_id, p_employee_id, p_user_id, v_piece,
        v_receipt->>'forma_pagamento', p_received_on,
        (p_received_on::date + time '12:00') at time zone 'UTC', 1,
        v_operation_id,
        format('Ref. Venda #%s - Parc. %s - Cliente: %s', p_sale_id,
          v_allocation->>'numero_parcela', coalesce(v_origin.obs, ''))
      ) returning * into v_payment;

      v_payments := v_payments || jsonb_build_array(to_jsonb(v_payment));
      v_payment_ids := v_payment_ids || jsonb_build_array(v_payment.id);
      if not (v_installment_ids @> jsonb_build_array((v_allocation->>'id')::bigint)) then
        v_installment_ids := v_installment_ids || jsonb_build_array((v_allocation->>'id')::bigint);
      end if;

      v_allocation_remaining := round(v_allocation_remaining - v_piece, 2);
      v_receipt_remaining := round(v_receipt_remaining - v_piece, 2);
      if v_receipt_remaining = 0 then
        v_receipt_index := v_receipt_index + 1;
        v_receipt := p_receipts->v_receipt_index;
        v_receipt_remaining := case when v_receipt is null then 0 else round((v_receipt->>'valor')::numeric, 2) end;
      end if;
    end loop;
  end loop;

  if v_receipt is not null or v_receipt_remaining <> 0 then
    raise exception 'Sobrou valor sem parcela na distribuicao do recebimento.';
  end if;

  if v_sale.is_historical_import is true then
    select round(coalesce(sum(greatest(0,
      coalesce(valor_parcela, 0)
      + coalesce(valor_transferido_entrada, 0)
      - coalesce(valor_pago, 0)
      - coalesce(valor_transferido_saida, 0)
    )), 0), 2)
    into v_historical_balance
    from public.financiamento_parcelas
    where financiamento_id = v_origin.financiamento_id;

    update public.vendas
    set valor_restante = v_historical_balance, status = 'Fechada'
    where id = p_sale_id and store_id = p_store_id;
  end if;

  select coalesce(jsonb_agg(to_jsonb(fp) order by fp.numero_parcela, fp.id), '[]'::jsonb)
    into v_installments_after
  from public.financiamento_parcelas fp
  where fp.financiamento_id = v_origin.financiamento_id;
  select to_jsonb(v) into v_sale_after from public.vendas v where id = p_sale_id;

  select count(*) into v_affected_count
  from jsonb_array_elements(v_installments_after) after_item
  left join jsonb_array_elements(v_installments_before) before_item
    on before_item->>'id' = after_item->>'id'
  where before_item is null or before_item <> after_item;

  update public.installment_receipt_operations
  set installments_after = v_installments_after,
      sale_after = v_sale_after,
      payments_created = v_payments,
      affected_installment_count = greatest(1, v_affected_count),
      transferred_amount = v_transfer,
      destination_installment_id = v_destination_id,
      state = 'completed',
      completed_at = now()
  where id = v_operation_id;

  return jsonb_build_object(
    'operation_id', v_operation_id,
    'payment_ids', v_payment_ids,
    'receipt_installment_ids', v_installment_ids,
    'strategy', v_strategy,
    'transferred_amount', v_transfer,
    'destination_installment_id', v_destination_id
  );
end;
$$;

revoke all on function public.receive_installment_payment(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from public;
revoke all on function public.receive_installment_payment(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from anon;
revoke all on function public.receive_installment_payment(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from authenticated;
grant execute on function public.receive_installment_payment(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) to service_role;

-- O snapshot passa a restaurar tambem os saldos transferidos.
create or replace function public.reverse_installment_receipt_operation(
  p_operation_id bigint,
  p_authorizing_employee_id bigint,
  p_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation public.installment_receipt_operations%rowtype;
  v_manager public.employees%rowtype;
  v_snapshot jsonb;
  v_newer_operation_id bigint;
  v_payment_ids jsonb;
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Informe um motivo com pelo menos 5 caracteres.';
  end if;

  select * into v_operation
  from public.installment_receipt_operations
  where id = p_operation_id
  for update;
  if not found then raise exception 'Operacao de recebimento nao encontrada.'; end if;
  if v_operation.state <> 'completed' or v_operation.reversed_at is not null then
    raise exception 'Esta operacao nao esta disponivel para reversao.';
  end if;

  select * into v_manager
  from public.employees
  where id = p_authorizing_employee_id
    and store_id = v_operation.store_id
    and is_active = true
    and lower(role) = 'gerente';
  if not found then raise exception 'A reversao exige autorizacao de um gerente ativo da loja.'; end if;

  select id into v_newer_operation_id
  from public.installment_receipt_operations
  where financiamento_id = v_operation.financiamento_id
    and state = 'completed'
    and reversed_at is null
    and (created_at, id) > (v_operation.created_at, v_operation.id)
  order by created_at desc, id desc
  limit 1;
  if v_newer_operation_id is not null then
    raise exception 'Reverta primeiro o recebimento mais recente deste carne.';
  end if;

  select coalesce(jsonb_agg(id order by id), '[]'::jsonb) into v_payment_ids
  from public.pagamentos where receipt_operation_id = v_operation.id;
  delete from public.pagamentos where receipt_operation_id = v_operation.id;

  delete from public.financiamento_parcelas fp
  where fp.financiamento_id = v_operation.financiamento_id
    and exists (select 1 from jsonb_array_elements(v_operation.installments_after) item where (item->>'id')::bigint = fp.id)
    and not exists (select 1 from jsonb_array_elements(v_operation.installments_before) item where (item->>'id')::bigint = fp.id);

  for v_snapshot in select value from jsonb_array_elements(v_operation.installments_before)
  loop
    update public.financiamento_parcelas
    set numero_parcela = (v_snapshot->>'numero_parcela')::integer,
        data_vencimento = (v_snapshot->>'data_vencimento')::date,
        valor_parcela = (v_snapshot->>'valor_parcela')::numeric,
        valor_pago = nullif(v_snapshot->>'valor_pago', '')::numeric,
        valor_transferido_entrada = coalesce(nullif(v_snapshot->>'valor_transferido_entrada', '')::numeric, 0),
        valor_transferido_saida = coalesce(nullif(v_snapshot->>'valor_transferido_saida', '')::numeric, 0),
        data_pagamento = nullif(v_snapshot->>'data_pagamento', '')::date,
        status = v_snapshot->>'status',
        customer_id = nullif(v_snapshot->>'customer_id', '')::bigint,
        obs = v_snapshot->>'obs'
    where id = (v_snapshot->>'id')::bigint
      and financiamento_id = v_operation.financiamento_id;
  end loop;

  update public.vendas
  set valor_restante = nullif(v_operation.sale_before->>'valor_restante', '')::numeric,
      status = v_operation.sale_before->>'status',
      financiamento_id = nullif(v_operation.sale_before->>'financiamento_id', '')::bigint
  where id = v_operation.venda_id and store_id = v_operation.store_id;

  update public.installment_receipt_operations
  set state = 'reversed', reversed_at = now(),
      reversed_by_employee_id = p_authorizing_employee_id,
      reversed_by_user_id = p_user_id, reversal_reason = trim(p_reason)
  where id = v_operation.id;

  return jsonb_build_object(
    'operation_id', v_operation.id,
    'origin_installment_id', v_operation.origin_installment_id,
    'payment_ids', v_payment_ids
  );
end;
$$;

revoke all on function public.reverse_installment_receipt_operation(bigint, bigint, uuid, text) from public;
revoke all on function public.reverse_installment_receipt_operation(bigint, bigint, uuid, text) from anon;
revoke all on function public.reverse_installment_receipt_operation(bigint, bigint, uuid, text) from authenticated;
grant execute on function public.reverse_installment_receipt_operation(bigint, bigint, uuid, text) to service_role;
