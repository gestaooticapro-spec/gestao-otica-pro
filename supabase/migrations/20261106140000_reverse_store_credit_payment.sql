-- Sem FK para pagamentos: o identificador precisa sobreviver à exclusão.
alter table public.wallet_transactions
  add column if not exists reversed_payment_id bigint;

create unique index if not exists wallet_transactions_reversed_payment_unique
  on public.wallet_transactions(reversed_payment_id)
  where reversed_payment_id is not null;

create or replace function public.reverse_store_credit_payment(
  p_payment_id bigint, p_sale_id bigint, p_store_id bigint,
  p_tenant_id uuid, p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.vendas%rowtype;
  v_payment public.pagamentos%rowtype;
  v_wallet public.customer_wallets%rowtype;
  v_available_debit numeric;
begin
  if p_user_id is null or p_tenant_id is null or not exists (
    select 1 from public.profiles p
    join public.stores s on s.id = p_store_id and s.tenant_id = p.tenant_id
    where p.id = p_user_id and p.tenant_id = p_tenant_id
      and (p.role = 'admin' or p.store_id = p_store_id)
  ) then
    raise exception 'Usuario sem acesso a esta loja.';
  end if;

  select * into v_sale from public.vendas
    where id = p_sale_id and store_id = p_store_id and tenant_id = p_tenant_id
    for update;
  if not found then raise exception 'Venda nao encontrada.'; end if;
  if coalesce(v_sale.is_historical_import, false) or v_sale.status is distinct from 'Em Aberto' then
    raise exception 'Reabra uma venda nao historica antes de remover o pagamento.';
  end if;

  select * into v_payment from public.pagamentos
    where id = p_payment_id and venda_id = p_sale_id
      and store_id = p_store_id and tenant_id = p_tenant_id
    for update;
  if not found then raise exception 'Pagamento nao encontrado ou ja removido.'; end if;
  if v_payment.forma_pagamento is distinct from 'Crédito em Loja'
     or v_payment.parcela_id is not null then
    raise exception 'Este fluxo aceita somente pagamento direto em credito em loja.';
  end if;
  if v_payment.customer_id is null or v_payment.valor_pago is null or v_payment.valor_pago <= 0 then
    raise exception 'Pagamento sem cliente ou valor valido. Revise o lancamento.';
  end if;

  -- Usa quem pagou, mesmo se o titular da venda foi transferido depois.
  select * into v_wallet from public.customer_wallets
    where customer_id = v_payment.customer_id and store_id = p_store_id
      and tenant_id = p_tenant_id
    for update;
  if not found then raise exception 'Carteira original nao encontrada. Revise o lancamento.'; end if;

  -- O legado vincula o débito à venda, não ao pagamento. Exige lastro no
  -- extrato e desconta as devoluções anteriores antes de devolver novo valor.
  select coalesce(-sum(amount), 0) into v_available_debit
    from public.wallet_transactions
    where wallet_id = v_wallet.id and store_id = p_store_id and tenant_id = p_tenant_id
      and related_venda_id = p_sale_id
      and (operation_type = 'Uso_Venda' or reversed_payment_id is not null);
  if v_available_debit < v_payment.valor_pago then
    raise exception 'Debito da carteira nao comprovado no extrato. Revise o lancamento antes de remover.';
  end if;

  insert into public.wallet_transactions (
    tenant_id, store_id, wallet_id, amount, operation_type, description,
    related_venda_id, created_by_user_id, employee_id, reversed_payment_id
  ) values (
    p_tenant_id, p_store_id, v_wallet.id, v_payment.valor_pago, 'Estorno_Pagamento',
    format('Estorno do pagamento #%s da Venda #%s', p_payment_id, p_sale_id),
    p_sale_id, p_user_id, null, p_payment_id
  );
  update public.customer_wallets
    set balance = balance + v_payment.valor_pago, updated_at = now()
    where id = v_wallet.id;
  delete from public.accounts_receivable where origin_payment_id = p_payment_id;
  delete from public.pagamentos where id = p_payment_id;
  perform public.update_venda_financeiro(p_sale_id);
  return jsonb_build_object('payment_id', p_payment_id, 'wallet_id', v_wallet.id,
    'amount', v_payment.valor_pago);
end;
$$;

revoke all on function public.reverse_store_credit_payment(bigint, bigint, bigint, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reverse_store_credit_payment(bigint, bigint, bigint, uuid, uuid) to service_role;
