-- As funcoes financeiras sao chamadas exclusivamente pelas server actions,
-- usando service_role. Grants explicitos do Supabase nao sao removidos por um
-- REVOKE de PUBLIC e, por isso, precisam ser revogados individualmente.
revoke all on function public.receive_installment_payment(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from public;
revoke all on function public.receive_installment_payment(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from anon;
revoke all on function public.receive_installment_payment(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from authenticated;
grant execute on function public.receive_installment_payment(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) to service_role;

revoke all on function public.receive_installment_payment_internal(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from public;
revoke all on function public.receive_installment_payment_internal(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from anon;
revoke all on function public.receive_installment_payment_internal(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from authenticated;
revoke all on function public.receive_installment_payment_internal(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from service_role;

-- Defesa em profundidade: mesmo uma chamada feita pelo proprietario das
-- funcoes nao pode criar recebimentos para uma venda cancelada.
create or replace function public.reject_cancelled_sale_financial_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.vendas v
    where v.id = new.venda_id and lower(coalesce(v.status, '')) = 'cancelada'
  ) then
    raise exception 'Nao e permitido registrar recebimento em uma venda cancelada.';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_cancelled_sale_financial_entry() from public;
revoke all on function public.reject_cancelled_sale_financial_entry() from anon;
revoke all on function public.reject_cancelled_sale_financial_entry() from authenticated;

drop trigger if exists reject_cancelled_sale_receipt_operation on public.installment_receipt_operations;
create trigger reject_cancelled_sale_receipt_operation
before insert on public.installment_receipt_operations
for each row execute function public.reject_cancelled_sale_financial_entry();

drop trigger if exists reject_cancelled_sale_payment on public.pagamentos;
create trigger reject_cancelled_sale_payment
before insert on public.pagamentos
for each row execute function public.reject_cancelled_sale_financial_entry();

-- A implementacao original do estorno fica privada. A funcao publica valida o
-- formato do snapshot e bloqueia conciliacoes legadas antes de delegar.
do $$
begin
  if to_regprocedure('public.reverse_installment_receipt_operation_internal(bigint,bigint,uuid,text)') is null then
    alter function public.reverse_installment_receipt_operation(bigint, bigint, uuid, text)
      rename to reverse_installment_receipt_operation_internal;
  end if;
end;
$$;

revoke all on function public.reverse_installment_receipt_operation_internal(bigint, bigint, uuid, text) from public;
revoke all on function public.reverse_installment_receipt_operation_internal(bigint, bigint, uuid, text) from anon;
revoke all on function public.reverse_installment_receipt_operation_internal(bigint, bigint, uuid, text) from authenticated;
revoke all on function public.reverse_installment_receipt_operation_internal(bigint, bigint, uuid, text) from service_role;

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

  return public.reverse_installment_receipt_operation_internal(
    p_operation_id, p_authorizing_employee_id, p_user_id, p_reason
  );
end;
$$;

revoke all on function public.reverse_installment_receipt_operation(bigint, bigint, uuid, text) from public;
revoke all on function public.reverse_installment_receipt_operation(bigint, bigint, uuid, text) from anon;
revoke all on function public.reverse_installment_receipt_operation(bigint, bigint, uuid, text) from authenticated;
grant execute on function public.reverse_installment_receipt_operation(bigint, bigint, uuid, text) to service_role;
