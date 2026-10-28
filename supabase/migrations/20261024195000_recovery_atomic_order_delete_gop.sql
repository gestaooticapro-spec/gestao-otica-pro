-- PREPARE ONLY. Stock columns/constraint reviewed in the GOP catalog.
-- Same reservation-only deletion semantics as deleteServiceOrder, one commit.
begin;
create function public.gop_recovery_delete_order_v1(p_sale bigint,p_order bigint,p_store bigint,p_actor uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare sale public.vendas; service_order public.service_orders; movement record; order_count integer; legacy_link boolean;
begin
  if p_store is distinct from 1 or p_actor is null then raise exception 'RECOVERY_DELETE_ACCESS_DENIED';end if;
  -- Same reference locks as admission and final origin triggers. They are held
  -- only during this transaction; no application/network work occurs inside it.
  perform fiscal_recovery_gop.lock_origin('40b34e90-4c9d-4446-b775-770a3e77d6c0',p_store,least(p_sale,p_order));
  if p_sale<>p_order then perform fiscal_recovery_gop.lock_origin('40b34e90-4c9d-4446-b775-770a3e77d6c0',p_store,greatest(p_sale,p_order));end if;
  select * into sale from public.vendas where id=p_sale and store_id=p_store for update;
  if sale.id is null or sale.tenant_id<>'40b34e90-4c9d-4446-b775-770a3e77d6c0'::uuid or
    not exists(select 1 from public.profiles where id=p_actor and tenant_id=sale.tenant_id and (store_id=p_store or role='admin')) then
    raise exception 'RECOVERY_DELETE_ACCESS_DENIED';end if;
  select * into service_order from public.service_orders where id=p_order and venda_id=p_sale for update;
  if service_order.id is null then raise exception 'RECOVERY_DELETE_ORDER_NOT_FOUND';end if;
  if service_order.store_id is distinct from p_store or service_order.tenant_id is distinct from sale.tenant_id then
    raise exception 'RECOVERY_DELETE_ACCESS_DENIED';end if;
  if sale.is_historical_import is true then raise exception 'RECOVERY_DELETE_HISTORICAL';end if;
  if exists(select 1 from fiscal_recovery_gop.attempts a join public.fiscal_invoices i on i.id=a.invoice_id
    where a.organization_id=sale.tenant_id and a.store_id=p_store and i.work_order_id in (p_sale,p_order)) then
    raise exception 'RECOVERY_FISCAL_ORIGIN_OWNED';end if;
  if exists(select 1 from public.post_sales where service_order_id=p_order) then raise exception 'RECOVERY_DELETE_POST_SALE';end if;
  select count(*) into order_count from public.service_orders where venda_id=p_sale;
  select exists(select 1 from public.fiscal_invoices where work_order_id=p_order and organization_id=sale.tenant_id and store_id=p_store) into legacy_link;
  if legacy_link and order_count<=1 then raise exception 'RECOVERY_DELETE_LEGACY_FISCAL_LINK';end if;
  -- Lock every affected movement before checking whether any manual/definitive
  -- movement makes deletion unavailable. All later errors roll back restores.
  perform 1 from public.stock_movements where related_os_id=p_order order by id for update;
  if exists(select 1 from public.stock_movements where related_os_id=p_order and
    (tenant_id is distinct from sale.tenant_id or store_id is distinct from p_store or not (
      lower(coalesce(motivo,'')) like 'reserva automatica%' or lower(coalesce(motivo,'')) like 'reserva manual%' or
      lower(coalesce(motivo,'')) like 'troca de lente reservada%' or lower(coalesce(motivo,'')) like 'estorno de reserva%'))) then
    raise exception 'RECOVERY_DELETE_STOCK_BLOCKED';end if;
  for movement in select * from public.stock_movements where related_os_id=p_order and tipo in ('Reserva','Saida') and
    (lower(coalesce(motivo,'')) like 'reserva automatica%' or lower(coalesce(motivo,'')) like 'reserva manual%') order by id loop
    if movement.quantidade is null or movement.quantidade<=0 then raise exception 'RECOVERY_DELETE_STOCK_INVALID';end if;
    if movement.variant_id is not null then
      update public.product_variants set estoque_atual=coalesce(estoque_atual,0)+movement.quantidade
        where id=movement.variant_id and tenant_id=sale.tenant_id and store_id=p_store and product_id=movement.product_id;
      if not found then raise exception 'RECOVERY_DELETE_VARIANT_MISSING';end if;
    end if;
    -- The installed GOP database has no increment_stock RPC. Restore both the
    -- aggregate product and optional variant with scoped, atomic SQL updates.
    update public.products set estoque_atual=coalesce(estoque_atual,0)+movement.quantidade
      where id=movement.product_id and tenant_id=sale.tenant_id and store_id=p_store;
    if not found then raise exception 'RECOVERY_DELETE_PRODUCT_MISSING';end if;
    insert into public.stock_movements(tenant_id,store_id,product_id,variant_id,tipo,quantidade,motivo,custo_unitario_momento,
      registrado_por_id,employee_id,related_os_id,related_venda_id,created_at)
      values(movement.tenant_id,movement.store_id,movement.product_id,movement.variant_id,'Entrada',movement.quantidade,
        'Estorno de Reserva (OS #'||p_order||' excluida da Venda #'||p_sale||')',movement.custo_unitario_momento,
        movement.registrado_por_id,movement.employee_id,p_order,movement.related_venda_id,clock_timestamp());
    update public.stock_movements set tipo='Devolucao' where id=movement.id;
  end loop;
  update public.stock_movements set related_os_id=null where related_os_id=p_order;
  if legacy_link then update public.fiscal_invoices set work_order_id=null where work_order_id=p_order and organization_id=sale.tenant_id and store_id=p_store;end if;
  if service_order.source_optical_evaluation_id is not null then
    update public.optical_evaluations set exported_service_order_id=null,updated_at=clock_timestamp()
      where id=service_order.source_optical_evaluation_id and store_id=p_store;
  end if;
  delete from public.venda_itens_os_links where service_order_id=p_order;
  delete from public.service_orders where id=p_order and venda_id=p_sale;
  if not found then raise exception 'RECOVERY_DELETE_ORDER_CHANGED';end if;
  return true;
end $$;
revoke all on function public.gop_recovery_delete_order_v1(bigint,bigint,bigint,uuid) from public,anon,authenticated;
grant execute on function public.gop_recovery_delete_order_v1(bigint,bigint,bigint,uuid) to service_role;
commit;
