-- Pagamentos vinculados a parcelas pertencem ao carne e nao podem ser
-- descontados novamente do saldo da venda. O saldo da venda considera apenas
-- pagamentos diretos (parcela_id is null) e o valor formalizado no carne.

create or replace function public.update_venda_financeiro(p_venda_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_itens numeric(14,2) := 0;
  v_desconto numeric(14,2) := 0;
  v_total_pago_direto numeric(14,2) := 0;
  v_total_financiado numeric(14,2) := 0;
  v_valor_final numeric(14,2) := 0;
begin
  select round(coalesce(sum(valor_total_item), 0), 2)
    into v_total_itens
  from public.venda_itens
  where venda_id = p_venda_id;

  select round(coalesce(valor_desconto, 0), 2)
    into v_desconto
  from public.vendas
  where id = p_venda_id;

  v_valor_final := greatest(0, round(v_total_itens - v_desconto, 2));

  select round(coalesce(sum(valor_pago), 0), 2)
    into v_total_pago_direto
  from public.pagamentos
  where venda_id = p_venda_id
    and parcela_id is null;

  select round(coalesce(sum(valor_total_financiado), 0), 2)
    into v_total_financiado
  from public.financiamento_loja
  where venda_id = p_venda_id;

  update public.vendas
  set valor_total = v_total_itens,
      valor_final = v_valor_final,
      valor_restante = round(v_valor_final - v_total_pago_direto - v_total_financiado, 2)
  where id = p_venda_id;
end;
$$;

-- Reprocessa somente vendas normais que possuem recebimentos de parcelas.
-- A migration e idempotente: executar novamente produz os mesmos saldos.
do $$
declare
  v_sale record;
begin
  for v_sale in
    select distinct v.id
    from public.vendas v
    join public.pagamentos p on p.venda_id = v.id and p.parcela_id is not null
    where coalesce(v.is_historical_import, false) = false
  loop
    perform public.update_venda_financeiro(v_sale.id);
  end loop;
end;
$$;

