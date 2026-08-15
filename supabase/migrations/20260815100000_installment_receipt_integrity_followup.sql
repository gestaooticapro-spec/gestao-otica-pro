-- Corrige somente parcelas pagas cujo recebimento efetivamente registrado
-- confere com o nominal. Casos sem pagamento permanecem para auditoria manual.
with exact_legacy_payments as (
  select fp.id, round(sum(p.valor_pago), 2) as paid_amount
  from public.financiamento_parcelas fp
  join public.pagamentos p on p.parcela_id = fp.id
  where lower(coalesce(fp.status, '')) = 'pago'
    and coalesce(fp.valor_pago, 0) < fp.valor_parcela - 0.01
    and coalesce(fp.valor_transferido_entrada, 0) = 0
    and coalesce(fp.valor_transferido_saida, 0) = 0
  group by fp.id, fp.valor_parcela
  having abs(round(sum(p.valor_pago), 2) - fp.valor_parcela) <= 0.01
)
update public.financiamento_parcelas fp
set valor_pago = exact_legacy_payments.paid_amount
from exact_legacy_payments
where fp.id = exact_legacy_payments.id;

-- Uma chave representa uma unica intencao do operador. Repeticoes da mesma
-- chamada retornam o resultado anterior e nao geram nova baixa.
create table if not exists public.installment_receipt_idempotency (
  idempotency_key uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  store_id bigint not null references public.stores(id),
  installment_id bigint not null,
  request_payload jsonb not null,
  operation_id bigint references public.installment_receipt_operations(id) on delete set null,
  result_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.installment_receipt_idempotency enable row level security;

alter table public.installment_receipt_operations
  add column if not exists idempotency_key uuid;

create unique index if not exists installment_receipt_operations_idempotency_key_idx
  on public.installment_receipt_operations (idempotency_key)
  where idempotency_key is not null;

do $$
begin
  if to_regprocedure('public.receive_installment_payment_internal(bigint,bigint,bigint,bigint,uuid,uuid,numeric,numeric,date,text,jsonb)') is null then
    alter function public.receive_installment_payment(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb)
      rename to receive_installment_payment_internal;
  end if;
end;
$$;

revoke all on function public.receive_installment_payment_internal(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from public;
revoke all on function public.receive_installment_payment_internal(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from anon;
revoke all on function public.receive_installment_payment_internal(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from authenticated;
revoke all on function public.receive_installment_payment_internal(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from service_role;

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
  v_key uuid;
  v_items jsonb;
  v_request jsonb;
  v_existing public.installment_receipt_idempotency%rowtype;
  v_inserted integer := 0;
  v_result jsonb;
  v_operation_id bigint;
begin
  if jsonb_typeof(p_receipts) = 'object' then
    v_key := nullif(p_receipts->>'idempotency_key', '')::uuid;
    v_items := p_receipts->'items';
  else
    -- Compatibilidade temporaria com clientes anteriores a esta migracao.
    v_items := p_receipts;
  end if;

  if v_key is null then
    return public.receive_installment_payment_internal(
      p_installment_id, p_sale_id, p_store_id, p_employee_id, p_user_id,
      p_tenant_id, p_received_amount, p_interest_amount, p_received_on,
      p_strategy, v_items
    );
  end if;

  v_request := jsonb_build_object(
    'installment_id', p_installment_id,
    'sale_id', p_sale_id,
    'store_id', p_store_id,
    'employee_id', p_employee_id,
    'user_id', p_user_id,
    'tenant_id', p_tenant_id,
    'received_amount', round(coalesce(p_received_amount, 0), 2),
    'interest_amount', round(coalesce(p_interest_amount, 0), 2),
    'received_on', p_received_on,
    'strategy', p_strategy,
    'items', v_items
  );

  insert into public.installment_receipt_idempotency (
    idempotency_key, tenant_id, store_id, installment_id, request_payload
  ) values (
    v_key, p_tenant_id, p_store_id, p_installment_id, v_request
  )
  on conflict (idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_existing
    from public.installment_receipt_idempotency
    where idempotency_key = v_key;

    if not found or v_existing.result_payload is null then
      raise exception 'Este recebimento ainda esta sendo processado.';
    end if;
    if v_existing.request_payload <> v_request then
      raise exception 'A chave desta tentativa ja foi usada com outros valores.';
    end if;
    return v_existing.result_payload;
  end if;

  v_result := public.receive_installment_payment_internal(
    p_installment_id, p_sale_id, p_store_id, p_employee_id, p_user_id,
    p_tenant_id, p_received_amount, p_interest_amount, p_received_on,
    p_strategy, v_items
  );
  v_operation_id := nullif(v_result->>'operation_id', '')::bigint;

  update public.installment_receipt_operations
  set idempotency_key = v_key
  where id = v_operation_id;

  update public.installment_receipt_idempotency
  set operation_id = v_operation_id,
      result_payload = v_result,
      completed_at = now()
  where idempotency_key = v_key;

  return v_result;
end;
$$;

revoke all on function public.receive_installment_payment(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from public;
revoke all on function public.receive_installment_payment(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from anon;
revoke all on function public.receive_installment_payment(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) from authenticated;
grant execute on function public.receive_installment_payment(bigint, bigint, bigint, bigint, uuid, uuid, numeric, numeric, date, text, jsonb) to service_role;
