-- A validação da tela não serializa chamadas simultâneas. O banco confere o
-- saldo canônico com a venda bloqueada, antes de aceitar cada pagamento direto.
create or replace function public.guard_direct_payment_sale_balance()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sale public.vendas%rowtype;
  v_old_sale bigint;
  v_old_payment bigint;
  v_total numeric;
  v_paid numeric;
  v_financed numeric;
  v_remaining numeric;
begin
  if tg_op='UPDATE' then
    v_old_sale := old.venda_id;
    v_old_payment := old.id;
  end if;
  -- Ordem determinística também quando um pagamento muda de venda.
  perform 1 from public.vendas where id in(new.venda_id,v_old_sale) order by id for update;
  if new.parcela_id is not null then return new; end if;
  select * into v_sale from public.vendas where id=new.venda_id;
  if not found then raise exception 'Venda nao encontrada para registrar o pagamento.'; end if;
  -- Importação histórica possui regras e saldo próprios; não reprocessar legado.
  if coalesce(v_sale.is_historical_import,false) then return new; end if;
  if new.tenant_id is distinct from v_sale.tenant_id or new.store_id is distinct from v_sale.store_id then
    raise exception 'Pagamento fora da loja ou empresa da venda.';
  end if;
  if new.receipt_operation_id is not null then
    raise exception 'Recebimento de carne precisa identificar a parcela.';
  end if;
  if v_sale.status in ('Cancelada','Devolvida') then raise exception 'Venda indisponivel para pagamento.'; end if;
  if new.valor_pago is null or new.valor_pago::text in ('NaN','Infinity','-Infinity')
    or new.valor_pago <= 0 then raise exception 'Valor do pagamento invalido.'; end if;

  select round(coalesce(sum(valor_total_item),0),2) into v_total
    from public.venda_itens where venda_id=new.venda_id;
  select round(coalesce(sum(valor_pago),0),2) into v_paid
    from public.pagamentos where venda_id=new.venda_id and parcela_id is null
      and (v_old_payment is null or id<>v_old_payment);
  select round(coalesce(sum(valor_total_financiado),0),2) into v_financed
    from public.financiamento_loja where venda_id=new.venda_id;
  v_remaining := greatest(0,round(v_total-coalesce(v_sale.valor_desconto,0),2))-v_paid-v_financed;
  if new.valor_pago > v_remaining then
    raise exception 'O pagamento nao pode superar o saldo disponivel da venda. Registre somente o valor liquido, apos devolver o troco.';
  end if;
  return new;
end;
$$;

-- O recálculo na mesma transação deixa o saldo visível à próxima tentativa e
-- evita aceitar dois pagamentos com base em valor_restante desatualizado.
create or replace function public.recalculate_direct_payment_sale_balance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op='UPDATE' and old.parcela_id is null then
    if exists(select 1 from public.vendas where id=old.venda_id and not coalesce(is_historical_import,false)) then
      perform public.update_venda_financeiro(old.venda_id);
    end if;
  end if;
  if new.parcela_id is null and (tg_op='INSERT' or old.venda_id is distinct from new.venda_id or old.parcela_id is not null) then
    if exists(select 1 from public.vendas where id=new.venda_id and not coalesce(is_historical_import,false)) then
      perform public.update_venda_financeiro(new.venda_id);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_direct_payment_sale_balance() from public,anon,authenticated;
revoke all on function public.recalculate_direct_payment_sale_balance() from public,anon,authenticated;
drop trigger if exists guard_direct_payment_sale_balance on public.pagamentos;
create trigger guard_direct_payment_sale_balance
before insert or update of valor_pago,venda_id,parcela_id,receipt_operation_id,tenant_id,store_id on public.pagamentos
for each row execute function public.guard_direct_payment_sale_balance();
drop trigger if exists recalculate_direct_payment_sale_balance on public.pagamentos;
create trigger recalculate_direct_payment_sale_balance
after insert or update of valor_pago,venda_id,parcela_id,receipt_operation_id,tenant_id,store_id on public.pagamentos
for each row execute function public.recalculate_direct_payment_sale_balance();
