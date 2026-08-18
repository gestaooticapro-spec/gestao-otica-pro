-- Estornos sao serializados pela capa do carne, na mesma ordem usada por
-- recebimentos e renegociacoes. Uma renegociacao e fronteira do historico.
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

  perform 1
  from public.financiamento_loja
  where id = v_operation.financiamento_id
  for update;
  if not found then
    raise exception 'Carne da operacao nao encontrado.';
  end if;

  if v_operation.strategy = 'legacy_reconciliation' then
    raise exception 'Conciliacoes historicas nao podem ser estornadas por esta operacao.';
  end if;
  if jsonb_typeof(v_operation.installments_before) <> 'array'
     or jsonb_typeof(v_operation.installments_after) <> 'array' then
    raise exception 'O historico desta operacao nao possui snapshots reversiveis.';
  end if;
  if exists (
    select 1 from public.installment_renegotiations r
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

-- Alguns bancos antigos possuem este estorno; outros nunca instalaram a RPC.
-- Quando ela existe, preservamos o corpo como interno e instalamos o wrapper
-- seguro. Quando nao existe, nao a recriamos nem ativamos por esta migration.
do $migration$
begin
  if to_regprocedure('public.reverse_legacy_exact_installment_receipt_internal(bigint,bigint,uuid,text)') is null then
    if to_regprocedure('public.reverse_legacy_exact_installment_receipt(bigint,bigint,uuid,text)') is not null then
      alter function public.reverse_legacy_exact_installment_receipt(bigint, bigint, uuid, text)
        rename to reverse_legacy_exact_installment_receipt_internal;
    end if;
  end if;

  if to_regprocedure('public.reverse_legacy_exact_installment_receipt_internal(bigint,bigint,uuid,text)') is not null then
    revoke all on function public.reverse_legacy_exact_installment_receipt_internal(bigint, bigint, uuid, text) from public, anon, authenticated, service_role;

    execute $legacy$
      create or replace function public.reverse_legacy_exact_installment_receipt(
        p_installment_id bigint,
        p_authorizing_employee_id bigint,
        p_user_id uuid,
        p_reason text
      ) returns jsonb language plpgsql security definer set search_path = public as $body$
      declare
        v_financing_id bigint;
        v_payment_date date;
      begin
        select financiamento_id into v_financing_id from public.financiamento_parcelas where id = p_installment_id;
        if v_financing_id is null then raise exception 'Parcela nao encontrada.'; end if;
        perform 1 from public.financiamento_loja where id = v_financing_id for update;
        if not found then raise exception 'Carne da parcela nao encontrado.'; end if;
        select coalesce(data_pagamento::date, created_at::date) into v_payment_date
        from public.pagamentos where parcela_id = p_installment_id and receipt_operation_id is null
        order by id desc limit 1;
        if exists (
          select 1 from public.installment_renegotiations r
          where r.financiamento_id = v_financing_id
            and r.created_at::date >= coalesce(v_payment_date, current_date)
        ) then
          raise exception 'Este pagamento antecede uma renegociacao e nao pode ser estornado. Renegocie novamente para corrigir o acordo atual.';
        end if;
        return public.reverse_legacy_exact_installment_receipt_internal(
          p_installment_id, p_authorizing_employee_id, p_user_id, p_reason
        );
      end;
      $body$;
    $legacy$;
    revoke all on function public.reverse_legacy_exact_installment_receipt(bigint, bigint, uuid, text) from public, anon, authenticated;
    grant execute on function public.reverse_legacy_exact_installment_receipt(bigint, bigint, uuid, text) to service_role;
  end if;
end;
$migration$;
