-- Publica os catalogos separados, configura somente a loja ficticia da
-- Neosmart e arquiva a antiga tabela mista depois das validacoes.

do $$
declare
  mixed_version_id constant uuid := '3e375a09-8a6d-4d54-aadb-c4e833e322b8';
  neosmart_store_id constant bigint := 7;
  hoya_prolife_id uuid;
  omegalux_id uuid;
  store_tenant_id uuid;
  store_settings jsonb;
  next_preferences jsonb;
  hoya_activation_id uuid;
  omegalux_activation_id uuid;
  actual_count bigint;
begin
  select id into strict hoya_prolife_id
    from public.global_catalog_versions
   where laboratorio = 'HOYA'
     and versao = 'HOYA Dezembro 2025 com PRO LIFE Julho 2026'
     and status in ('draft', 'published');

  select id into strict omegalux_id
    from public.global_catalog_versions
   where laboratorio = 'OMEGALUX'
     and versao = 'OMEGALUX Julho 2026'
     and status in ('draft', 'published');

  select tenant_id, settings
    into strict store_tenant_id, store_settings
    from public.stores
   where id = neosmart_store_id
     and name = 'Otica Globo 1'
     and tenant_id is not null;

  select count(*) into actual_count
    from public.global_lens_families
   where version_id = hoya_prolife_id;
  if actual_count <> 23 then
    raise exception 'HOYA + PRO LIFE divergente antes da publicacao: % familias.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_lens_offers offer
    join public.global_lens_families family on family.id = offer.family_id
   where family.version_id = hoya_prolife_id;
  if actual_count <> 547 then
    raise exception 'HOYA + PRO LIFE divergente antes da publicacao: % ofertas.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_lens_families
   where version_id = omegalux_id;
  if actual_count <> 3 then
    raise exception 'OMEGALUX divergente antes da publicacao: % familias.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_lens_offers offer
    join public.global_lens_families family on family.id = offer.family_id
   where family.version_id = omegalux_id;
  if actual_count <> 65 then
    raise exception 'OMEGALUX divergente antes da publicacao: % ofertas.', actual_count;
  end if;

  update public.global_catalog_versions
     set status = 'published',
         published_at = coalesce(published_at, timezone('utc'::text, now()))
   where id in (hoya_prolife_id, omegalux_id);

  -- Mantem apenas uma versao HOYA ativa na loja da Neosmart.
  update public.tenant_catalog_activations activation
     set status = 'inactive',
         last_synced_at = timezone('utc'::text, now())
   where activation.store_id = neosmart_store_id
     and activation.status = 'active'
     and activation.global_version_id <> hoya_prolife_id
     and activation.global_version_id in (
       select id from public.global_catalog_versions where laboratorio = 'HOYA'
     );

  insert into public.tenant_catalog_activations (
    tenant_id,
    store_id,
    global_version_id,
    status,
    activated_at,
    last_synced_at
  ) values (
    store_tenant_id,
    neosmart_store_id,
    hoya_prolife_id,
    'active',
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  on conflict (store_id, global_version_id) do update
    set status = 'active',
        activated_at = excluded.activated_at,
        last_synced_at = excluded.last_synced_at
  returning id into hoya_activation_id;

  insert into public.tenant_catalog_activations (
    tenant_id,
    store_id,
    global_version_id,
    status,
    activated_at,
    last_synced_at
  ) values (
    store_tenant_id,
    neosmart_store_id,
    omegalux_id,
    'active',
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  on conflict (store_id, global_version_id) do update
    set status = 'active',
        activated_at = excluded.activated_at,
        last_synced_at = excluded.last_synced_at
  returning id into omegalux_activation_id;

  insert into public.tenant_commercial_offers (
    activation_id,
    tenant_id,
    store_id,
    global_offer_id,
    display_name,
    price_cost,
    is_active
  )
  select
    activation.id,
    store_tenant_id,
    neosmart_store_id,
    offer.id,
    coalesce(offer.canonical_label, offer.raw_label),
    case
      when jsonb_typeof(offer.features -> 'cost_price') = 'number'
        then (offer.features ->> 'cost_price')::numeric
      else null
    end,
    true
    from (
      values (hoya_activation_id, hoya_prolife_id), (omegalux_activation_id, omegalux_id)
    ) as activation(id, version_id)
    join public.global_lens_families family on family.version_id = activation.version_id
    join public.global_lens_offers offer on offer.family_id = family.id
  on conflict (activation_id, global_offer_id) do update
    set display_name = excluded.display_name,
        is_active = true;

  insert into public.tenant_commercial_treatments (
    activation_id,
    tenant_id,
    store_id,
    global_treatment_id,
    display_name,
    is_active
  )
  select
    activation.id,
    store_tenant_id,
    neosmart_store_id,
    treatment.id,
    treatment.nome,
    true
    from (
      values (hoya_activation_id, hoya_prolife_id), (omegalux_activation_id, omegalux_id)
    ) as activation(id, version_id)
    join public.global_treatments treatment on treatment.version_id = activation.version_id
  on conflict (activation_id, global_treatment_id) do update
    set display_name = excluded.display_name,
        is_active = true;

  select coalesce(jsonb_agg(
    case
      when preference ->> 'versionId' = mixed_version_id::text
        or preference ->> 'laboratorio' = 'OMEGALUX / PRO LIFE'
      then jsonb_build_object(
        'versionId', omegalux_id::text,
        'laboratorio', 'OMEGALUX',
        'weight', coalesce((preference ->> 'weight')::integer, 5)
      )
      else preference
    end
  ), '[]'::jsonb)
    into next_preferences
    from jsonb_array_elements(
      coalesce(store_settings #> '{ai_suggestion_config,lab_preferences}', '[]'::jsonb)
    ) preference;

  if not exists (
    select 1 from jsonb_array_elements(next_preferences) preference
     where preference ->> 'versionId' = omegalux_id::text
  ) then
    next_preferences := next_preferences || jsonb_build_array(jsonb_build_object(
      'versionId', omegalux_id::text,
      'laboratorio', 'OMEGALUX',
      'weight', 5
    ));
  end if;

  if not exists (
    select 1 from jsonb_array_elements(next_preferences) preference
     where preference ->> 'versionId' = hoya_prolife_id::text
  ) then
    next_preferences := next_preferences || jsonb_build_array(jsonb_build_object(
      'versionId', hoya_prolife_id::text,
      'laboratorio', 'HOYA',
      'weight', 3
    ));
  end if;

  update public.stores
     set settings = jsonb_set(
       coalesce(store_settings, '{}'::jsonb),
       '{ai_suggestion_config}',
       coalesce(store_settings -> 'ai_suggestion_config', '{}'::jsonb)
         || jsonb_build_object('lab_preferences', next_preferences),
       true
     )
   where id = neosmart_store_id;

  update public.tenant_catalog_activations
     set status = 'inactive',
         last_synced_at = timezone('utc'::text, now())
   where global_version_id = mixed_version_id
     and status = 'active';

  if exists (
    select 1 from public.tenant_catalog_activations
     where global_version_id = mixed_version_id
       and status = 'active'
  ) then
    raise exception 'Ainda existe loja com a tabela mista ativa.';
  end if;

  update public.global_catalog_versions
     set status = 'archived'
   where id = mixed_version_id;

  select count(*) into actual_count
    from public.tenant_commercial_offers
   where activation_id = hoya_activation_id
     and is_active = true;
  if actual_count <> 547 then
    raise exception 'Loja Neosmart deveria ter 547 ofertas HOYA + PRO LIFE; encontrado: %.', actual_count;
  end if;

  select count(*) into actual_count
    from public.tenant_commercial_offers
   where activation_id = omegalux_activation_id
     and is_active = true;
  if actual_count <> 65 then
    raise exception 'Loja Neosmart deveria ter 65 ofertas OMEGALUX; encontrado: %.', actual_count;
  end if;
end;
$$;
