-- PREPARE ONLY: the fiscal origin cannot disappear after durable admission.
-- App checks are advisory; these locks/triggers fence other SQL writers too.
begin;
create function fiscal_recovery_gop.lock_origin(p_org uuid,p_store bigint,p_reference bigint) returns void
language plpgsql set search_path=pg_catalog as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('fiscal-origin:'||p_org::text||':'||p_store::text||':'||p_reference::text,0));
end $$;
create function fiscal_recovery_gop.guard_sale_origin() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if tg_op='UPDATE' then
    if new.id=old.id and new.store_id is not distinct from old.store_id and new.tenant_id is not distinct from old.tenant_id then return new;end if;
  end if;
  if old.store_id=1 then
    perform fiscal_recovery_gop.lock_origin(old.tenant_id,old.store_id,old.id);
    if exists(select 1 from fiscal_recovery_gop.attempts a join public.fiscal_invoices i on i.id=a.invoice_id
      where a.organization_id=old.tenant_id and a.store_id=old.store_id and i.work_order_id=old.id) then
      raise exception 'RECOVERY_FISCAL_ORIGIN_OWNED';end if;
  end if;
  if tg_op='DELETE' then return old;else return new;end if;
end $$;
create function fiscal_recovery_gop.guard_order_origin() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare sale public.vendas;
begin
  if tg_op='UPDATE' then if new.id=old.id and new.venda_id is not distinct from old.venda_id and
    new.tenant_id is not distinct from old.tenant_id and new.store_id is not distinct from old.store_id then return new;end if;end if;
  select * into sale from public.vendas where id=old.venda_id;
  if sale.store_id=1 then
    -- Both references are covered because older action signatures called a
    -- venda ID work_order_id. Deterministic lock order avoids crossed deadlocks.
    perform fiscal_recovery_gop.lock_origin(sale.tenant_id,sale.store_id,least(old.id,old.venda_id));
    if old.id<>old.venda_id then perform fiscal_recovery_gop.lock_origin(sale.tenant_id,sale.store_id,greatest(old.id,old.venda_id));end if;
    if exists(select 1 from fiscal_recovery_gop.attempts a join public.fiscal_invoices i on i.id=a.invoice_id
      where a.organization_id=sale.tenant_id and a.store_id=sale.store_id and i.work_order_id in (old.id,old.venda_id)) then
      raise exception 'RECOVERY_FISCAL_ORIGIN_OWNED';end if;
  end if;
  if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger gop_recovery_sale_origin before delete or update of id,store_id,tenant_id on public.vendas
  for each row execute function fiscal_recovery_gop.guard_sale_origin();
create trigger gop_recovery_order_origin before delete or update of id,venda_id,tenant_id,store_id on public.service_orders
  for each row execute function fiscal_recovery_gop.guard_order_origin();
revoke all on function fiscal_recovery_gop.lock_origin(uuid,bigint,bigint) from public,anon,authenticated,service_role;
revoke all on function fiscal_recovery_gop.guard_sale_origin() from public,anon,authenticated,service_role;
revoke all on function fiscal_recovery_gop.guard_order_origin() from public,anon,authenticated,service_role;
commit;
