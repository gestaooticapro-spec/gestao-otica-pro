-- Uma renegociacao passa a ser uma fronteira do historico: o snapshot de um
-- recebimento anterior nao pode mais ser restaurado sobre o novo acordo.
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
begin
  select * into v_operation
  from public.installment_receipt_operations
  where id = p_operation_id;

  if not found then
    raise exception 'Operacao de recebimento nao encontrada.';
  end if;
  if v_operation.strategy = 'legacy_reconciliation' then
    raise exception 'Conciliacoes historicas nao podem ser estornadas por esta operacao.';
  end if;
  if jsonb_typeof(v_operation.installments_before) <> 'array'
     or jsonb_typeof(v_operation.installments_after) <> 'array' then
    raise exception 'O historico desta operacao nao possui snapshots reversiveis.';
  end if;
  if exists (
    select 1
    from public.installment_renegotiations r
    where r.financiamento_id = v_operation.financiamento_id
      and r.created_at > v_operation.created_at
  ) then
    raise exception 'Este recebimento antecede uma renegociacao e nao pode ser estornado. Renegocie novamente para corrigir o acordo atual.';
  end if;

  return public.reverse_installment_receipt_operation_internal(
    p_operation_id, p_authorizing_employee_id, p_user_id, p_reason
  );
end;
$$;

revoke all on function public.reverse_installment_receipt_operation(bigint, bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.reverse_installment_receipt_operation(bigint, bigint, uuid, text) to service_role;

-- A rotina de baixa existente ja bloqueia as parcelas. Este adaptador tambem
-- bloqueia a capa do carne antes dela, igualando a ordem usada na renegociacao:
-- financiamento -> venda -> parcelas. Assim uma baixa e uma renegociacao do
-- mesmo carne sempre se serializam.
do $$
begin
  if to_regprocedure('public.receive_installment_payment_core(bigint,bigint,bigint,bigint,uuid,uuid,numeric,numeric,date,text,jsonb)') is null then
    alter function public.receive_installment_payment_internal(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb)
      rename to receive_installment_payment_core;
  end if;
end;
$$;

revoke all on function public.receive_installment_payment_core(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from public, anon, authenticated, service_role;

create or replace function public.receive_installment_payment_internal(
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
  v_financing_id bigint;
begin
  select financiamento_id into v_financing_id
  from public.financiamento_parcelas
  where id = p_installment_id;
  if v_financing_id is null then
    raise exception 'Parcela nao encontrada.';
  end if;

  perform 1
  from public.financiamento_loja
  where id = v_financing_id
  for update;
  if not found then
    raise exception 'Carne nao encontrado.';
  end if;

  return public.receive_installment_payment_core(
    p_installment_id, p_sale_id, p_store_id, p_employee_id, p_user_id,
    p_tenant_id, p_received_amount, p_interest_amount, p_received_on,
    p_strategy, p_receipts
  );
end;
$$;

revoke all on function public.receive_installment_payment_internal(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from public, anon, authenticated, service_role;
