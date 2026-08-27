alter table public.daily_health_data_quality_review_events
  add column if not exists reversal_of_operation_key uuid;

create unique index if not exists daily_health_data_quality_events_reversal_idx
  on public.daily_health_data_quality_review_events (reversal_of_operation_key)
  where reversal_of_operation_key is not null;

create or replace function public.undo_daily_health_record_merge(
  p_tenant_id uuid,
  p_store_id bigint,
  p_merge_operation_key uuid,
  p_undo_operation_key uuid,
  p_actor_user_id uuid,
  p_actor_employee_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_merge public.daily_health_data_quality_review_events%rowtype;
  v_existing public.daily_health_data_quality_review_events%rowtype;
  v_parent regclass;
  v_before_records jsonb;
  v_moved_rows jsonb;
  v_target_before jsonb;
  v_target_after jsonb;
  v_current_target jsonb;
  v_expected_fields jsonb;
  v_current_fields jsonb;
  v_changed_fields text[];
  v_source_ids bigint[];
  v_source_record jsonb;
  v_dependency record;
  v_dependency_table_text text;
  v_dependency_column text;
  v_dependency_table regclass;
  v_primary_columns text[];
  v_primary_column text;
  v_reference_row jsonb;
  v_where text;
  v_found integer;
  v_result jsonb;
begin
  if p_merge_operation_key is null or p_undo_operation_key is null then
    raise exception 'chaves da operacao sao obrigatorias';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_merge_operation_key::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_undo_operation_key::text, 0));

  select * into v_existing
  from public.daily_health_data_quality_review_events
  where operation_key = p_undo_operation_key;
  if found then
    if v_existing.store_id <> p_store_id
      or v_existing.reversal_of_operation_key <> p_merge_operation_key then
      raise exception 'operation_key ja utilizada em outra recuperacao';
    end if;
    return v_existing.after_data;
  end if;

  select * into v_merge
  from public.daily_health_data_quality_review_events
  where operation_key = p_merge_operation_key
  for update;
  if not found
    or v_merge.tenant_id <> p_tenant_id
    or v_merge.store_id <> p_store_id
    or v_merge.action not in ('merge_customer', 'merge_product') then
    raise exception 'mesclagem nao encontrada para esta loja';
  end if;

  if exists (
    select 1 from public.daily_health_data_quality_review_events
    where reversal_of_operation_key = p_merge_operation_key
  ) then
    raise exception 'esta mesclagem ja foi desfeita';
  end if;

  v_before_records := coalesce(v_merge.before_data -> 'records', '[]'::jsonb);
  v_moved_rows := coalesce(v_merge.before_data -> 'movedReferences', '{}'::jsonb);
  v_target_after := v_merge.after_data -> 'targetRecord';
  select record into v_target_before
  from jsonb_array_elements(v_before_records) record
  where (record ->> 'id')::bigint = v_merge.target_record_id;

  if v_target_before is null or v_target_after is null then
    raise exception 'a auditoria desta mesclagem nao permite recuperacao automatica';
  end if;

  select array_agg((record ->> 'id')::bigint order by (record ->> 'id')::bigint)
    into v_source_ids
  from jsonb_array_elements(v_before_records) record
  where (record ->> 'id')::bigint <> v_merge.target_record_id;
  if coalesce(cardinality(v_source_ids), 0) = 0 then
    raise exception 'a auditoria nao contem cadastros secundarios';
  end if;

  if v_merge.issue_type = 'duplicate_customer' then
    v_parent := 'public.customers'::regclass;
    v_changed_fields := array['cpf','rg','birth_date','phone','fone_movel','email','rua','numero','bairro','cidade','uf','cep','complemento','notes','is_spc'];
    select to_jsonb(customer_row) into v_current_target
    from public.customers customer_row
    where id = v_merge.target_record_id and store_id = p_store_id
    for update;
    select count(*) into v_found from public.customers where id = any(v_source_ids);
  elsif v_merge.issue_type = 'duplicate_product' then
    v_parent := 'public.products'::regclass;
    v_changed_fields := array['marca','referencia','codigo_barras','categoria','preco_custo','estoque_atual','estoque_minimo','gerencia_estoque','supplier_id'];
    select to_jsonb(product_row) into v_current_target
    from public.products product_row
    where id = v_merge.target_record_id and store_id = p_store_id
    for update;
    select count(*) into v_found from public.products where id = any(v_source_ids);
  else
    raise exception 'tipo de mesclagem invalido';
  end if;

  if v_current_target is null then
    raise exception 'o cadastro principal nao existe mais';
  end if;
  if v_found > 0 then
    raise exception 'um cadastro secundario ja foi recriado; revise o caso manualmente';
  end if;

  select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
    into v_current_fields
  from jsonb_each(v_current_target) field
  where field.key = any(v_changed_fields);
  select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
    into v_expected_fields
  from jsonb_each(v_target_after) field
  where field.key = any(v_changed_fields);
  if v_current_fields is distinct from v_expected_fields then
    raise exception 'o cadastro principal foi alterado depois da mesclagem; a recuperacao automatica foi bloqueada';
  end if;

  for v_dependency in select key, value from jsonb_each(v_moved_rows)
  loop
    v_dependency_column := regexp_replace(v_dependency.key, '^.*\.', '');
    v_dependency_table_text := left(v_dependency.key, length(v_dependency.key) - length(v_dependency_column) - 1);
    v_dependency_table := to_regclass(v_dependency_table_text);
    if v_dependency_table is null or not exists (
      select 1
      from pg_constraint constraint_row
      join pg_attribute dependent_attribute
        on dependent_attribute.attrelid = constraint_row.conrelid
       and dependent_attribute.attnum = constraint_row.conkey[1]
      where constraint_row.contype = 'f'
        and constraint_row.conrelid = v_dependency_table
        and constraint_row.confrelid = v_parent
        and cardinality(constraint_row.conkey) = 1
        and cardinality(constraint_row.confkey) = 1
        and dependent_attribute.attname = v_dependency_column
    ) then
      raise exception 'o vinculo % nao corresponde mais ao cadastro principal', v_dependency.key;
    end if;

    select array_agg(primary_attribute.attname order by key_column.ordinality)
      into v_primary_columns
    from pg_index primary_index
    join lateral unnest(primary_index.indkey::smallint[]) with ordinality key_column(attnum, ordinality) on true
    join pg_attribute primary_attribute
      on primary_attribute.attrelid = primary_index.indrelid
     and primary_attribute.attnum = key_column.attnum
    where primary_index.indrelid = v_dependency_table
      and primary_index.indisprimary;
    if coalesce(cardinality(v_primary_columns), 0) = 0 then
      raise exception 'o vinculo % nao possui identificacao segura para recuperacao', v_dependency.key;
    end if;

    for v_reference_row in select value from jsonb_array_elements(v_dependency.value)
    loop
      v_where := '';
      foreach v_primary_column in array v_primary_columns
      loop
        if not v_reference_row ? v_primary_column then
          raise exception 'a auditoria do vinculo % esta incompleta', v_dependency.key;
        end if;
        v_where := concat_ws(' and ', nullif(v_where, ''), format('%I::text = %L', v_primary_column, v_reference_row ->> v_primary_column));
      end loop;
      execute format('select count(*) from %s where %s and %I = $1', v_dependency_table, v_where, v_dependency_column)
        into v_found using v_merge.target_record_id;
      if v_found <> 1 then
        raise exception 'um vinculo transferido foi alterado depois da mesclagem; a recuperacao automatica foi bloqueada';
      end if;
    end loop;
  end loop;

  if v_merge.issue_type = 'duplicate_customer' then
    update public.customers target set
      cpf = restored.cpf, rg = restored.rg, birth_date = restored.birth_date,
      phone = restored.phone, fone_movel = restored.fone_movel, email = restored.email,
      rua = restored.rua, numero = restored.numero, bairro = restored.bairro,
      cidade = restored.cidade, uf = restored.uf, cep = restored.cep,
      complemento = restored.complemento, notes = restored.notes, is_spc = restored.is_spc
    from jsonb_populate_record(null::public.customers, v_target_before) restored
    where target.id = v_merge.target_record_id;

    for v_source_record in select record from jsonb_array_elements(v_before_records) record where (record ->> 'id')::bigint <> v_merge.target_record_id
    loop
      insert into public.customers select (jsonb_populate_record(null::public.customers, v_source_record)).*;
    end loop;
  else
    update public.products target set
      marca = restored.marca, referencia = restored.referencia,
      codigo_barras = restored.codigo_barras, categoria = restored.categoria,
      preco_custo = restored.preco_custo, estoque_atual = restored.estoque_atual,
      estoque_minimo = restored.estoque_minimo, gerencia_estoque = restored.gerencia_estoque,
      supplier_id = restored.supplier_id
    from jsonb_populate_record(null::public.products, v_target_before) restored
    where target.id = v_merge.target_record_id;

    for v_source_record in select record from jsonb_array_elements(v_before_records) record where (record ->> 'id')::bigint <> v_merge.target_record_id
    loop
      insert into public.products select (jsonb_populate_record(null::public.products, v_source_record)).*;
    end loop;
  end if;

  for v_dependency in select key, value from jsonb_each(v_moved_rows)
  loop
    v_dependency_column := regexp_replace(v_dependency.key, '^.*\.', '');
    v_dependency_table_text := left(v_dependency.key, length(v_dependency.key) - length(v_dependency_column) - 1);
    v_dependency_table := to_regclass(v_dependency_table_text);
    select array_agg(primary_attribute.attname order by key_column.ordinality)
      into v_primary_columns
    from pg_index primary_index
    join lateral unnest(primary_index.indkey::smallint[]) with ordinality key_column(attnum, ordinality) on true
    join pg_attribute primary_attribute
      on primary_attribute.attrelid = primary_index.indrelid
     and primary_attribute.attnum = key_column.attnum
    where primary_index.indrelid = v_dependency_table and primary_index.indisprimary;

    for v_reference_row in select value from jsonb_array_elements(v_dependency.value)
    loop
      v_where := '';
      foreach v_primary_column in array v_primary_columns
      loop
        v_where := concat_ws(' and ', nullif(v_where, ''), format('%I::text = %L', v_primary_column, v_reference_row ->> v_primary_column));
      end loop;
      execute format('update %s set %I = $1 where %s', v_dependency_table, v_dependency_column, v_where)
        using (v_reference_row ->> v_dependency_column)::bigint;
    end loop;
  end loop;

  v_result := jsonb_build_object(
    'mergeOperationKey', p_merge_operation_key,
    'targetId', v_merge.target_record_id,
    'restoredIds', to_jsonb(v_source_ids),
    'undoneAt', now()
  );

  insert into public.daily_health_data_quality_review_events (
    tenant_id, store_id, issue_type, fingerprint, record_ids, action,
    before_data, after_data, actor_user_id, actor_employee_id,
    operation_key, target_record_id, reversal_of_operation_key
  ) values (
    p_tenant_id, p_store_id, v_merge.issue_type, v_merge.fingerprint, v_merge.record_ids,
    case when v_merge.issue_type = 'duplicate_customer' then 'undo_merge_customer' else 'undo_merge_product' end,
    jsonb_build_object('mergeEventId', v_merge.id), v_result,
    p_actor_user_id, p_actor_employee_id, p_undo_operation_key,
    v_merge.target_record_id, p_merge_operation_key
  );

  return v_result;
end;
$$;

revoke all on function public.undo_daily_health_record_merge(uuid, bigint, uuid, uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.undo_daily_health_record_merge(uuid, bigint, uuid, uuid, uuid, bigint) to service_role;
