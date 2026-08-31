-- Preserva os campos empresariais ao mesclar cadastros PJ duplicados.
alter function public.merge_daily_health_duplicate_records(uuid, bigint, text, text, bigint, bigint[], uuid, uuid, bigint)
  rename to merge_daily_health_duplicate_records_legacy;

create function public.merge_daily_health_duplicate_records(
  p_tenant_id uuid,
  p_store_id bigint,
  p_issue_type text,
  p_fingerprint text,
  p_target_id bigint,
  p_source_ids bigint[],
  p_operation_key uuid,
  p_actor_user_id uuid,
  p_actor_employee_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_all_ids bigint[] := array_prepend(p_target_id, coalesce(p_source_ids, '{}'::bigint[]));
  v_distinct integer;
begin
  if p_issue_type = 'duplicate_customer' then
    select count(distinct person_type) into v_distinct
    from public.customers where id = any(v_all_ids);
    if v_distinct > 1 then
      raise exception 'tipos de pessoa diferentes impedem a mesclagem';
    end if;

    select count(distinct cnpj) filter (where nullif(btrim(cnpj), '') is not null)
      into v_distinct from public.customers where id = any(v_all_ids);
    if v_distinct > 1 then
      raise exception 'CNPJs diferentes impedem a mesclagem';
    end if;

    update public.customers target set
      cnpj = coalesce(nullif(btrim(target.cnpj), ''), (select nullif(btrim(source.cnpj), '') from public.customers source where source.id = any(p_source_ids) and nullif(btrim(source.cnpj), '') is not null order by source.created_at, source.id limit 1)),
      razao_social = coalesce(nullif(btrim(target.razao_social), ''), (select nullif(btrim(source.razao_social), '') from public.customers source where source.id = any(p_source_ids) and nullif(btrim(source.razao_social), '') is not null order by source.created_at, source.id limit 1)),
      nome_fantasia = coalesce(nullif(btrim(target.nome_fantasia), ''), (select nullif(btrim(source.nome_fantasia), '') from public.customers source where source.id = any(p_source_ids) and nullif(btrim(source.nome_fantasia), '') is not null order by source.created_at, source.id limit 1)),
      inscricao_estadual = coalesce(nullif(btrim(target.inscricao_estadual), ''), (select nullif(btrim(source.inscricao_estadual), '') from public.customers source where source.id = any(p_source_ids) and nullif(btrim(source.inscricao_estadual), '') is not null order by source.created_at, source.id limit 1))
    where target.id = p_target_id and target.store_id = p_store_id;
  end if;

  return public.merge_daily_health_duplicate_records_legacy(
    p_tenant_id, p_store_id, p_issue_type, p_fingerprint, p_target_id,
    p_source_ids, p_operation_key, p_actor_user_id, p_actor_employee_id
  );
end;
$$;

revoke all on function public.merge_daily_health_duplicate_records(uuid, bigint, text, text, bigint, bigint[], uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.merge_daily_health_duplicate_records(uuid, bigint, text, text, bigint, bigint[], uuid, uuid, bigint) to service_role;
