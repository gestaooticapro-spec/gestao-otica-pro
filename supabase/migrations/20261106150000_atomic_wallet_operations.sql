-- Chaves e snapshots sobrevivem ao estorno/exclusão do pagamento.
alter table public.wallet_transactions
  add column if not exists operation_key uuid,
  add column if not exists operation_payload jsonb,
  add column if not exists payment_id bigint;
create unique index if not exists wallet_transactions_operation_key_unique
  on public.wallet_transactions(tenant_id, operation_key) where operation_key is not null;

create or replace function public.add_store_credit_atomic(
  p_store_id bigint, p_customer_id bigint, p_amount numeric, p_description text,
  p_employee_id bigint, p_sale_id bigint, p_tenant_id uuid, p_user_id uuid, p_key uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_wallet public.customer_wallets%rowtype;
  v_previous public.wallet_transactions%rowtype;
  v_payload jsonb;
  v_id bigint;
begin
  if p_user_id is null or p_tenant_id is null or not exists (
    select 1 from public.profiles p join public.stores s on s.id=p_store_id and s.tenant_id=p.tenant_id
    where p.id=p_user_id and p.tenant_id=p_tenant_id and (p.role='admin' or p.store_id=p_store_id)
  ) then raise exception 'Usuario sem acesso a esta loja.'; end if;
  if p_key is null or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_amount <= 0 or round(p_amount,2) <> p_amount or length(trim(coalesce(p_description,''))) < 3 then
    raise exception 'Dados do credito invalidos.';
  end if;
  if not exists (select 1 from public.customers where id=p_customer_id and store_id=p_store_id and tenant_id=p_tenant_id)
    or not exists (select 1 from public.employees where id=p_employee_id and store_id=p_store_id and tenant_id=p_tenant_id) then
    raise exception 'Cliente ou funcionario fora da loja.';
  end if;
  v_payload := jsonb_build_object('kind','credit','store',p_store_id,'customer',p_customer_id,
    'amount',p_amount,'description',p_description,'employee',p_employee_id,'sale',p_sale_id,'user',p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_key::text,0));
  select * into v_previous from public.wallet_transactions where tenant_id=p_tenant_id and operation_key=p_key;
  if found then
    if v_previous.operation_payload is distinct from v_payload then raise exception 'Tentativa ja utilizada com outros dados.'; end if;
    return jsonb_build_object('transaction_id',v_previous.id,'replayed',true);
  end if;
  -- Mesma ordem de bloqueio do uso e do estorno: venda, depois carteira.
  if p_sale_id is not null then
    perform 1 from public.vendas where id=p_sale_id and store_id=p_store_id
      and tenant_id=p_tenant_id and customer_id=p_customer_id for update;
    if not found then raise exception 'Venda nao encontrada para este cliente.'; end if;
  end if;
  insert into public.customer_wallets(tenant_id,store_id,customer_id,balance)
    values(p_tenant_id,p_store_id,p_customer_id,0) on conflict(store_id,customer_id) do nothing;
  select * into v_wallet from public.customer_wallets
    where store_id=p_store_id and customer_id=p_customer_id and tenant_id=p_tenant_id for update;
  if not found or v_wallet.balance is null then raise exception 'Carteira invalida.'; end if;
  update public.customer_wallets set balance=balance+p_amount,updated_at=now() where id=v_wallet.id;
  insert into public.wallet_transactions(tenant_id,store_id,wallet_id,amount,operation_type,
    description,related_venda_id,employee_id,created_by_user_id,operation_key,operation_payload)
    values(p_tenant_id,p_store_id,v_wallet.id,p_amount,'Credito_Devolucao',p_description,
      p_sale_id,p_employee_id,p_user_id,p_key,v_payload) returning id into v_id;
  return jsonb_build_object('transaction_id',v_id,'replayed',false);
end;
$$;

create or replace function public.pay_sale_with_store_credit(
  p_sale_id bigint, p_store_id bigint, p_customer_id bigint, p_employee_id bigint,
  p_amount numeric, p_date date, p_obs text, p_tenant_id uuid, p_user_id uuid, p_key uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sale public.vendas%rowtype;
  v_wallet public.customer_wallets%rowtype;
  v_previous public.wallet_transactions%rowtype;
  v_payment public.pagamentos%rowtype;
  v_payload jsonb;
begin
  if p_user_id is null or p_tenant_id is null or not exists (
    select 1 from public.profiles p join public.stores s on s.id=p_store_id and s.tenant_id=p.tenant_id
    where p.id=p_user_id and p.tenant_id=p_tenant_id and (p.role='admin' or p.store_id=p_store_id)
  ) then raise exception 'Usuario sem acesso a esta loja.'; end if;
  if p_key is null or p_date is null or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_amount <= 0 or round(p_amount,2) <> p_amount then raise exception 'Dados do pagamento invalidos.'; end if;
  if not exists (select 1 from public.employees where id=p_employee_id and store_id=p_store_id and tenant_id=p_tenant_id) then
    raise exception 'Funcionario fora da loja.';
  end if;
  v_payload := jsonb_build_object('kind','payment','sale',p_sale_id,'store',p_store_id,'customer',p_customer_id,
    'employee',p_employee_id,'amount',p_amount,'date',p_date,'obs',p_obs,'user',p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_key::text,0));
  -- Replay vem antes da validação de saldo/status: a primeira chamada pode ter quitado a venda.
  select * into v_previous from public.wallet_transactions where tenant_id=p_tenant_id and operation_key=p_key;
  if found then
    if v_previous.operation_payload is distinct from v_payload then raise exception 'Tentativa ja utilizada com outros dados.'; end if;
    select * into v_payment from public.pagamentos where id=v_previous.payment_id
      and tenant_id=p_tenant_id and store_id=p_store_id and venda_id=p_sale_id for share;
    if not found then raise exception 'Este pagamento ja foi removido. Inicie uma nova operacao.'; end if;
    return to_jsonb(v_payment);
  end if;
  select * into v_sale from public.vendas
    where id=p_sale_id and store_id=p_store_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Venda nao encontrada.'; end if;
  if coalesce(v_sale.is_historical_import,false) or v_sale.status is distinct from 'Em Aberto'
    or v_sale.customer_id is distinct from p_customer_id then
    raise exception 'Venda nao esta aberta para este cliente.';
  end if;
  perform public.update_venda_financeiro(p_sale_id);
  select * into v_sale from public.vendas where id=p_sale_id;
  if coalesce(v_sale.valor_restante,0) < p_amount then raise exception 'O pagamento supera o saldo disponivel da venda.'; end if;
  select * into v_wallet from public.customer_wallets
    where customer_id=p_customer_id and store_id=p_store_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Cliente nao possui carteira digital.'; end if;
  if v_wallet.balance is null or v_wallet.balance < p_amount then raise exception 'Saldo insuficiente na carteira.'; end if;

  insert into public.pagamentos(tenant_id,store_id,venda_id,customer_id,employee_id,
    valor_pago,forma_pagamento,parcelas,data_pagamento,obs,created_by_user_id,created_at)
    values(p_tenant_id,p_store_id,p_sale_id,p_customer_id,p_employee_id,p_amount,'Crédito em Loja',1,
      p_date,p_obs,p_user_id,(p_date::timestamp + interval '12 hours') at time zone 'UTC') returning * into v_payment;
  update public.customer_wallets set balance=balance-p_amount,updated_at=now() where id=v_wallet.id;
  insert into public.wallet_transactions(tenant_id,store_id,wallet_id,amount,operation_type,
    description,related_venda_id,employee_id,created_by_user_id,operation_key,operation_payload,payment_id)
    values(p_tenant_id,p_store_id,v_wallet.id,-p_amount,'Uso_Venda',format('Pagamento na Venda #%s',p_sale_id),
      p_sale_id,p_employee_id,p_user_id,p_key,v_payload,v_payment.id);
  perform public.update_venda_financeiro(p_sale_id);
  return to_jsonb(v_payment);
end;
$$;

revoke all on function public.add_store_credit_atomic(bigint,bigint,numeric,text,bigint,bigint,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.add_store_credit_atomic(bigint,bigint,numeric,text,bigint,bigint,uuid,uuid,uuid) to service_role;
revoke all on function public.pay_sale_with_store_credit(bigint,bigint,bigint,bigint,numeric,date,text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pay_sale_with_store_credit(bigint,bigint,bigint,bigint,numeric,date,text,uuid,uuid,uuid) to service_role;
