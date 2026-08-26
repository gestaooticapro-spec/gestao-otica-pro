alter table public.daily_health_data_quality_review_events
  add column if not exists operation_key uuid,
  add column if not exists target_record_id bigint;

create unique index if not exists daily_health_data_quality_events_operation_key_idx
  on public.daily_health_data_quality_review_events (operation_key)
  where operation_key is not null;

create or replace function public.merge_daily_health_duplicate_records(
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
  v_source_ids bigint[];
  v_all_ids bigint[];
  v_parent regclass;
  v_expected integer;
  v_found integer;
  v_before_records jsonb;
  v_moved_rows jsonb := '{}'::jsonb;
  v_dependency_counts jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_count integer;
  v_after jsonb;
  v_existing jsonb;
  v_existing_store_id bigint;
  v_existing_issue_type text;
  v_existing_target_id bigint;
  v_dependency record;
  v_wallet_count integer;
  v_distinct integer;
begin
  if p_operation_key is null then
    raise exception 'operation_key obrigatoria';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_key::text, 0));

  select after_data, store_id, issue_type, target_record_id
    into v_existing, v_existing_store_id, v_existing_issue_type, v_existing_target_id
  from public.daily_health_data_quality_review_events
  where operation_key = p_operation_key;
  if found then
    if v_existing_store_id <> p_store_id
      or v_existing_issue_type <> p_issue_type
      or v_existing_target_id <> p_target_id then
      raise exception 'operation_key ja utilizada em outra mesclagem';
    end if;
    return v_existing;
  end if;

  if p_issue_type not in ('duplicate_customer', 'duplicate_product') then
    raise exception 'tipo de mesclagem invalido';
  end if;

  if not exists (
    select 1 from public.stores
    where id = p_store_id and tenant_id = p_tenant_id
  ) then
    raise exception 'loja fora da empresa informada';
  end if;

  select array_agg(distinct source_id order by source_id)
    into v_source_ids
  from unnest(coalesce(p_source_ids, '{}'::bigint[])) source_id
  where source_id > 0 and source_id <> p_target_id;

  if coalesce(cardinality(v_source_ids), 0) = 0 then
    raise exception 'nenhum cadastro de origem informado';
  end if;

  v_all_ids := array_prepend(p_target_id, v_source_ids);
  v_expected := cardinality(v_all_ids);
  v_parent := case when p_issue_type = 'duplicate_customer' then 'public.customers'::regclass else 'public.products'::regclass end;

  if p_issue_type = 'duplicate_customer' then
    perform id from public.customers where store_id = p_store_id and id = any(v_all_ids) for update;
    select count(*) into v_found from public.customers where store_id = p_store_id and id = any(v_all_ids);
    if v_found <> v_expected then raise exception 'grupo de clientes mudou ou pertence a outra loja'; end if;

    select count(distinct regexp_replace(coalesce(cpf, ''), '\D', '', 'g')) filter (where regexp_replace(coalesce(cpf, ''), '\D', '', 'g') <> '')
      into v_distinct from public.customers where id = any(v_all_ids);
    if v_distinct > 1 then raise exception 'CPFs diferentes impedem a mesclagem'; end if;
    select count(distinct lower(btrim(rg))) filter (where nullif(btrim(rg), '') is not null)
      into v_distinct from public.customers where id = any(v_all_ids);
    if v_distinct > 1 then raise exception 'RGs diferentes impedem a mesclagem'; end if;
    select count(distinct birth_date) filter (where birth_date is not null)
      into v_distinct from public.customers where id = any(v_all_ids);
    if v_distinct > 1 then raise exception 'datas de nascimento diferentes impedem a mesclagem'; end if;
    select count(*) into v_wallet_count from public.customer_wallets where customer_id = any(v_all_ids);
    if v_wallet_count > 1 then raise exception 'carteiras de credito precisam ser consolidadas antes da mesclagem'; end if;

    select jsonb_agg(to_jsonb(customer_row) order by customer_row.id)
      into v_before_records from public.customers customer_row where id = any(v_all_ids);

    update public.customers target set
      cpf = coalesce(nullif(btrim(target.cpf), ''), (select nullif(btrim(source.cpf), '') from public.customers source where source.id = any(v_source_ids) and nullif(btrim(source.cpf), '') is not null order by source.created_at, source.id limit 1)),
      rg = coalesce(nullif(btrim(target.rg), ''), (select nullif(btrim(source.rg), '') from public.customers source where source.id = any(v_source_ids) and nullif(btrim(source.rg), '') is not null order by source.created_at, source.id limit 1)),
      birth_date = coalesce(target.birth_date, (select source.birth_date from public.customers source where source.id = any(v_source_ids) and source.birth_date is not null order by source.created_at, source.id limit 1)),
      phone = coalesce(nullif(btrim(target.phone), ''), (select nullif(btrim(source.phone), '') from public.customers source where source.id = any(v_source_ids) and nullif(btrim(source.phone), '') is not null order by source.created_at, source.id limit 1)),
      fone_movel = coalesce(nullif(btrim(target.fone_movel), ''), (select nullif(btrim(source.fone_movel), '') from public.customers source where source.id = any(v_source_ids) and nullif(btrim(source.fone_movel), '') is not null order by source.created_at, source.id limit 1)),
      email = coalesce(nullif(btrim(target.email), ''), (select nullif(btrim(source.email), '') from public.customers source where source.id = any(v_source_ids) and nullif(btrim(source.email), '') is not null order by source.created_at, source.id limit 1)),
      rua = coalesce(nullif(btrim(target.rua), ''), (select nullif(btrim(source.rua), '') from public.customers source where source.id = any(v_source_ids) and nullif(btrim(source.rua), '') is not null order by source.created_at, source.id limit 1)),
      numero = coalesce(nullif(btrim(target.numero), ''), (select nullif(btrim(source.numero), '') from public.customers source where source.id = any(v_source_ids) and nullif(btrim(source.numero), '') is not null order by source.created_at, source.id limit 1)),
      bairro = coalesce(nullif(btrim(target.bairro), ''), (select nullif(btrim(source.bairro), '') from public.customers source where source.id = any(v_source_ids) and nullif(btrim(source.bairro), '') is not null order by source.created_at, source.id limit 1)),
      cidade = coalesce(nullif(btrim(target.cidade), ''), (select nullif(btrim(source.cidade), '') from public.customers source where source.id = any(v_source_ids) and nullif(btrim(source.cidade), '') is not null order by source.created_at, source.id limit 1)),
      uf = coalesce(nullif(btrim(target.uf), ''), (select nullif(btrim(source.uf), '') from public.customers source where source.id = any(v_source_ids) and nullif(btrim(source.uf), '') is not null order by source.created_at, source.id limit 1)),
      cep = coalesce(nullif(btrim(target.cep), ''), (select nullif(btrim(source.cep), '') from public.customers source where source.id = any(v_source_ids) and nullif(btrim(source.cep), '') is not null order by source.created_at, source.id limit 1)),
      complemento = coalesce(nullif(btrim(target.complemento), ''), (select nullif(btrim(source.complemento), '') from public.customers source where source.id = any(v_source_ids) and nullif(btrim(source.complemento), '') is not null order by source.created_at, source.id limit 1)),
      notes = coalesce(nullif(btrim(target.notes), ''), (select nullif(btrim(source.notes), '') from public.customers source where source.id = any(v_source_ids) and nullif(btrim(source.notes), '') is not null order by source.created_at, source.id limit 1)),
      is_spc = coalesce(target.is_spc, false) or exists (select 1 from public.customers source where source.id = any(v_source_ids) and source.is_spc = true)
    where target.id = p_target_id;
  else
    perform id from public.products where store_id = p_store_id and id = any(v_all_ids) for update;
    select count(*) into v_found from public.products where store_id = p_store_id and id = any(v_all_ids);
    if v_found <> v_expected then raise exception 'grupo de produtos mudou ou pertence a outra loja'; end if;

    select count(distinct regexp_replace(lower(coalesce(referencia, '')), '[^a-z0-9]', '', 'g')) filter (where regexp_replace(lower(coalesce(referencia, '')), '[^a-z0-9]', '', 'g') <> '')
      into v_distinct from public.products where id = any(v_all_ids);
    if v_distinct > 1 then raise exception 'referencias diferentes impedem a mesclagem'; end if;
    select count(distinct regexp_replace(lower(coalesce(codigo_barras, '')), '[^a-z0-9]', '', 'g')) filter (where regexp_replace(lower(coalesce(codigo_barras, '')), '[^a-z0-9]', '', 'g') <> '')
      into v_distinct from public.products where id = any(v_all_ids);
    if v_distinct > 1 then raise exception 'codigos de barras diferentes impedem a mesclagem'; end if;
    select count(distinct tipo_produto) filter (where tipo_produto is not null)
      into v_distinct from public.products where id = any(v_all_ids);
    if v_distinct > 1 then raise exception 'tipos de produto diferentes impedem a mesclagem'; end if;

    select jsonb_agg(to_jsonb(product_row) order by product_row.id)
      into v_before_records from public.products product_row where id = any(v_all_ids);

    update public.products target set
      marca = coalesce(nullif(btrim(target.marca), ''), (select nullif(btrim(source.marca), '') from public.products source where source.id = any(v_source_ids) and nullif(btrim(source.marca), '') is not null order by source.created_at, source.id limit 1)),
      referencia = coalesce(nullif(btrim(target.referencia), ''), (select nullif(btrim(source.referencia), '') from public.products source where source.id = any(v_source_ids) and nullif(btrim(source.referencia), '') is not null order by source.created_at, source.id limit 1)),
      codigo_barras = coalesce(nullif(btrim(target.codigo_barras), ''), (select nullif(btrim(source.codigo_barras), '') from public.products source where source.id = any(v_source_ids) and nullif(btrim(source.codigo_barras), '') is not null order by source.created_at, source.id limit 1)),
      categoria = coalesce(nullif(btrim(target.categoria), ''), (select nullif(btrim(source.categoria), '') from public.products source where source.id = any(v_source_ids) and nullif(btrim(source.categoria), '') is not null order by source.created_at, source.id limit 1)),
      preco_custo = case when coalesce(target.preco_custo, 0) > 0 then target.preco_custo else (select max(source.preco_custo) from public.products source where source.id = any(v_source_ids) and source.preco_custo > 0) end,
      estoque_atual = coalesce(target.estoque_atual, 0) + coalesce((select sum(source.estoque_atual) from public.products source where source.id = any(v_source_ids)), 0),
      estoque_minimo = greatest(coalesce(target.estoque_minimo, 0), coalesce((select max(source.estoque_minimo) from public.products source where source.id = any(v_source_ids)), 0)),
      gerencia_estoque = coalesce(target.gerencia_estoque, false) or exists (select 1 from public.products source where source.id = any(v_source_ids) and source.gerencia_estoque = true),
      supplier_id = coalesce(target.supplier_id, (select source.supplier_id from public.products source where source.id = any(v_source_ids) and source.supplier_id is not null order by source.created_at, source.id limit 1))
    where target.id = p_target_id;
  end if;

  for v_dependency in
    select
      constraint_row.conrelid::regclass as dependent_table,
      dependent_attribute.attname as dependent_column
    from pg_constraint constraint_row
    join pg_attribute dependent_attribute
      on dependent_attribute.attrelid = constraint_row.conrelid
     and dependent_attribute.attnum = constraint_row.conkey[1]
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = v_parent
      and cardinality(constraint_row.conkey) = 1
      and cardinality(constraint_row.confkey) = 1
    order by constraint_row.conrelid::regclass::text, dependent_attribute.attname
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(dependent_row)), ''[]''::jsonb) from %s dependent_row where %I = any($1)',
      v_dependency.dependent_table,
      v_dependency.dependent_column
    ) into v_rows using v_source_ids;
    v_count := jsonb_array_length(v_rows);
    if v_count > 0 then
      v_moved_rows := v_moved_rows || jsonb_build_object(v_dependency.dependent_table::text || '.' || v_dependency.dependent_column, v_rows);
      v_dependency_counts := v_dependency_counts || jsonb_build_object(v_dependency.dependent_table::text || '.' || v_dependency.dependent_column, v_count);
      execute format(
        'update %s set %I = $1 where %I = any($2)',
        v_dependency.dependent_table,
        v_dependency.dependent_column,
        v_dependency.dependent_column
      ) using p_target_id, v_source_ids;
    end if;
  end loop;

  if p_issue_type = 'duplicate_customer' then
    delete from public.customers where id = any(v_source_ids);
  else
    delete from public.products where id = any(v_source_ids);
  end if;

  v_after := jsonb_build_object(
    'targetId', p_target_id,
    'removedIds', to_jsonb(v_source_ids),
    'dependencyCounts', v_dependency_counts,
    'mergedAt', now()
  );

  insert into public.daily_health_data_quality_review_events (
    tenant_id, store_id, issue_type, fingerprint, record_ids, action,
    before_data, after_data, actor_user_id, actor_employee_id,
    operation_key, target_record_id
  ) values (
    p_tenant_id, p_store_id, p_issue_type, p_fingerprint, v_all_ids,
    case when p_issue_type = 'duplicate_customer' then 'merge_customer' else 'merge_product' end,
    jsonb_build_object('records', v_before_records, 'movedReferences', v_moved_rows),
    v_after, p_actor_user_id, p_actor_employee_id,
    p_operation_key, p_target_id
  );

  return v_after;
end;
$$;

revoke all on function public.merge_daily_health_duplicate_records(uuid, bigint, text, text, bigint, bigint[], uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.merge_daily_health_duplicate_records(uuid, bigint, text, text, bigint, bigint[], uuid, uuid, bigint) to service_role;
