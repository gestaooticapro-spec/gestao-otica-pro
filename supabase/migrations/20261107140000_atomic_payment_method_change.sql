-- Auditoria sem FK para preservar os snapshots mesmo se o pagamento for removido.
create table if not exists public.payment_method_change_operations (
  id bigint generated always as identity primary key,
  tenant_id uuid not null, store_id bigint not null, payment_id bigint not null,
  authorized_by_user_id uuid not null, authorized_by_employee_id bigint not null,
  payment_before jsonb not null, payment_after jsonb not null,
  receivables_before jsonb not null, receivables_after jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.payment_method_change_operations enable row level security;
revoke all on public.payment_method_change_operations from public,anon,authenticated;
grant select,insert on public.payment_method_change_operations to service_role;
grant usage,select on sequence public.payment_method_change_operations_id_seq to service_role;

create or replace function public.change_payment_method_with_audit(
  p_payment_id bigint,p_store_id bigint,p_new_payment_method text,p_installments integer,
  p_authorized_by_employee_id bigint,p_authorized_by_user_id uuid
)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_payment public.pagamentos%rowtype;
  v_sale public.vendas%rowtype;
  v_sale_id bigint;
  v_tenant uuid;
  v_method text := nullif(trim(p_new_payment_method),'');
  v_count integer;
  v_cents bigint;
  v_base bigint;
  v_before jsonb;
  v_after jsonb;
  v_payment_after jsonb;
begin
  if v_method is null or v_method not in ('Dinheiro','PIX Remoto','PIX na maquininha','Cartão Débito','Cartão Crédito','Cheque-Pré') then
    raise exception 'Forma de pagamento nao permitida nesta edicao.';
  end if;
  if p_installments is null or p_installments < 1 or p_installments > 12 then
    raise exception 'Informe de 1 a 12 parcelas.';
  end if;
  v_count := case when v_method in ('Cartão Crédito','Cheque-Pré') then p_installments else 1 end;
  select s.tenant_id into v_tenant from public.stores s join public.profiles p on p.tenant_id=s.tenant_id
    where s.id=p_store_id and p.id=p_authorized_by_user_id and (p.role='admin' or p.store_id=s.id);
  if not found then raise exception 'Usuario sem acesso a esta loja.'; end if;

  -- Venda antes do pagamento, na mesma ordem das operacoes de remocao/carteira.
  select venda_id into v_sale_id from public.pagamentos where id=p_payment_id
    and store_id=p_store_id and tenant_id=v_tenant;
  if not found then raise exception 'Pagamento nao encontrado.'; end if;
  select * into v_sale from public.vendas where id=v_sale_id and store_id=p_store_id and tenant_id=v_tenant for update;
  if not found then raise exception 'Venda inconsistente com a loja do pagamento.'; end if;
  if coalesce(v_sale.is_historical_import,false) or v_sale.status not in ('Em Aberto','Fechada') or v_sale.status is null then
    raise exception 'Venda indisponivel para esta edicao.';
  end if;
  select * into v_payment from public.pagamentos where id=p_payment_id and venda_id=v_sale_id
    and store_id=p_store_id and tenant_id=v_tenant for update;
  if not found then raise exception 'Pagamento nao encontrado ou alterado. Atualize a tela.'; end if;
  if not exists(select 1 from public.employees where id=p_authorized_by_employee_id
    and store_id=p_store_id and tenant_id=v_tenant and is_active=true) then
    raise exception 'Funcionario autorizador invalido ou inativo.';
  end if;
  if v_payment.employee_id is not null and v_payment.employee_id<>p_authorized_by_employee_id then
    raise exception 'Apenas o funcionario que realizou este pagamento pode altera-lo.';
  end if;
  if v_payment.parcela_id is not null or v_payment.receipt_operation_id is not null then
    raise exception 'Recebimento de carne exige seu fluxo proprio de revisao.';
  end if;
  if v_payment.forma_pagamento='Crédito em Loja' then
    raise exception 'Credito em Loja exige a rotina propria da carteira.';
  end if;
  if v_payment.forma_pagamento='Pix Sicredi' or exists(select 1 from public.pix_sale_charges where settlement_pagamento_id=p_payment_id) then
    raise exception 'Pix integrado exige revisao da conciliacao.';
  end if;
  if v_payment.valor_pago is null or v_payment.valor_pago::text in ('NaN','Infinity','-Infinity') or v_payment.valor_pago<=0
    or round(v_payment.valor_pago,2) is distinct from v_payment.valor_pago
    or v_payment.data_pagamento is null then raise exception 'Valor ou data do pagamento invalidos.'; end if;

  perform 1 from public.accounts_receivable where origin_payment_id=p_payment_id order by id for update;
  if exists(select 1 from public.accounts_receivable where origin_payment_id=p_payment_id
    and (store_id is distinct from p_store_id or tenant_id is distinct from v_tenant)) then
    raise exception 'Recebiveis inconsistentes com a loja ou empresa.';
  end if;
  -- Campos opcionais de baixa/conciliacao sao inspecionados via JSON, sem supor
  -- colunas inexistentes. Status desconhecido nunca e considerado pendente.
  if exists(select 1 from public.accounts_receivable r where origin_payment_id=p_payment_id
    and (r.status is distinct from 'Pendente' or exists(
      select 1 from jsonb_each(to_jsonb(r)) f
      where f.key ~* '(paid|received|settled|reconcil|conciliad|recebid|baixa)'
        and f.value not in ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb,'"0"'::jsonb)
    ))) then raise exception 'Recebivel recebido, conciliado ou sem status pendente. Solicite revisao financeira.'; end if;
  if v_payment.forma_pagamento=v_method and coalesce(v_payment.parcelas,1)=v_count then return; end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) into v_before
    from public.accounts_receivable r where origin_payment_id=p_payment_id;

  delete from public.accounts_receivable where origin_payment_id=p_payment_id;
  update public.pagamentos set forma_pagamento=v_method,parcelas=v_count where id=p_payment_id;
  if v_method in ('Cartão Crédito','Cheque-Pré') then
    v_cents := round(v_payment.valor_pago*100)::bigint;
    if v_cents < v_count then raise exception 'Valor insuficiente para a quantidade de parcelas.'; end if;
    v_base := v_cents/v_count;
    insert into public.accounts_receivable(tenant_id,store_id,description,amount,due_date,status,type,origin_payment_id)
      select v_tenant,p_store_id,format('Venda #%s - %s (%s/%s)',v_sale_id,v_method,i+1,v_count),
        (v_base+case when i=0 then v_cents-v_base*v_count else 0 end)::numeric/100,
        v_payment.data_pagamento::date+i*30,'Pendente',v_method,p_payment_id
      from generate_series(0,v_count-1) i;
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) into v_after
    from public.accounts_receivable r where origin_payment_id=p_payment_id;
  select to_jsonb(p) into v_payment_after from public.pagamentos p where id=p_payment_id;
  insert into public.payment_method_change_audit(payment_id,store_id,previous_payment_method,new_payment_method,
    authorized_by_employee_id,authorized_by_user_id)
    values(p_payment_id,p_store_id,coalesce(v_payment.forma_pagamento,'Não informado'),v_method,
      p_authorized_by_employee_id,p_authorized_by_user_id);
  insert into public.payment_method_change_operations(tenant_id,store_id,payment_id,authorized_by_user_id,
    authorized_by_employee_id,payment_before,payment_after,receivables_before,receivables_after)
    values(v_tenant,p_store_id,p_payment_id,p_authorized_by_user_id,p_authorized_by_employee_id,
      to_jsonb(v_payment),v_payment_after,v_before,v_after);
end;
$$;
revoke all on function public.change_payment_method_with_audit(bigint,bigint,text,integer,bigint,uuid) from public,anon,authenticated;
grant execute on function public.change_payment_method_with_audit(bigint,bigint,text,integer,bigint,uuid) to service_role;
