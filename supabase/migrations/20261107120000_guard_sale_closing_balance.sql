-- Protege a transicao de status, sem alterar a insercao inicial da Expressa.
create or replace function public.guard_sale_closing_balance()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_total numeric;
  v_paid numeric;
  v_financed numeric;
begin
  if new.status is distinct from 'Fechada' or old.status = 'Fechada'
    or coalesce(new.is_historical_import,false) then return new; end if;
  if old.status is distinct from 'Em Aberto' then
    raise exception 'Somente uma venda em aberto pode ser finalizada.';
  end if;
  -- O UPDATE ja bloqueou a venda; pagamentos diretos usam o mesmo bloqueio.
  select round(coalesce(sum(valor_total_item),0),2) into v_total
    from public.venda_itens where venda_id=new.id;
  select round(coalesce(sum(valor_pago),0),2) into v_paid
    from public.pagamentos where venda_id=new.id and parcela_id is null;
  select round(coalesce(sum(valor_total_financiado),0),2) into v_financed
    from public.financiamento_loja where venda_id=new.id;
  new.valor_total := v_total;
  new.valor_final := greatest(0,round(v_total-coalesce(new.valor_desconto,0),2));
  new.valor_restante := round(new.valor_final-v_paid-v_financed,2);
  if new.valor_restante > 0 then
    raise exception 'Ainda ha saldo a receber. Cubra todo o valor com pagamentos ou carne antes de finalizar.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_sale_closing_balance() from public,anon,authenticated;
drop trigger if exists guard_sale_closing_balance on public.vendas;
create trigger guard_sale_closing_balance before update of status on public.vendas
for each row execute function public.guard_sale_closing_balance();

create or replace function public.close_sale_with_balance_check(
  p_sale_id bigint,p_store_id bigint,p_tenant_id uuid,p_user_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sale public.vendas%rowtype;
begin
  if p_user_id is null or p_tenant_id is null or not exists (
    select 1 from public.profiles p join public.stores s on s.id=p_store_id and s.tenant_id=p.tenant_id
    where p.id=p_user_id and p.tenant_id=p_tenant_id and (p.role='admin' or p.store_id=p_store_id)
  ) then raise exception 'Usuario sem acesso a esta loja.'; end if;
  select * into v_sale from public.vendas where id=p_sale_id and store_id=p_store_id
    and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Venda nao encontrada.'; end if;
  if coalesce(v_sale.is_historical_import,false) or v_sale.status is distinct from 'Em Aberto' then
    raise exception 'Somente uma venda em aberto nao historica pode ser finalizada.';
  end if;
  update public.vendas set status='Fechada',data_fechamento=now()
    where id=p_sale_id returning * into v_sale;
  return to_jsonb(v_sale);
end;
$$;
revoke all on function public.close_sale_with_balance_check(bigint,bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function public.close_sale_with_balance_check(bigint,bigint,uuid,uuid) to service_role;
