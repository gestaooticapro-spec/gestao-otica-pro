-- Protege a ativacao de catalogos globais e prepara, em draft, a separacao
-- da tabela OMEGALUX / PRO LIFE. A migration e transacional e interrompe se
-- as contagens de origem nao forem exatamente as auditadas.

create or replace function public.enforce_published_global_catalog_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and not exists (
    select 1
      from public.global_catalog_versions version
     where version.id = new.global_version_id
       and version.status = 'published'
  ) then
    raise exception 'Somente catalogos globais publicados podem ser ativados.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_published_global_catalog_activation
  on public.tenant_catalog_activations;

create trigger trg_enforce_published_global_catalog_activation
before insert or update of status, global_version_id
on public.tenant_catalog_activations
for each row
execute function public.enforce_published_global_catalog_activation();

do $$
declare
  hoya_source_id constant uuid := '08f91e88-40f5-4521-b476-d09c7f1955cf';
  mixed_source_id constant uuid := '3e375a09-8a6d-4d54-aadb-c4e833e322b8';
  hoya_prolife_id uuid;
  omegalux_id uuid;
  actual_count bigint;
begin
  if not exists (
    select 1 from public.global_catalog_versions
     where id = hoya_source_id
       and laboratorio = 'HOYA'
       and versao = 'HOYA Dezembro 2025'
       and status = 'published'
  ) then
    raise exception 'Catalogo HOYA de origem ausente ou divergente.';
  end if;

  if not exists (
    select 1 from public.global_catalog_versions
     where id = mixed_source_id
       and laboratorio = 'OMEGALUX / PRO LIFE'
       and versao = 'OMEGALUX PRO LIFE Julho 2026'
       and status = 'published'
  ) then
    raise exception 'Catalogo OMEGALUX / PRO LIFE de origem ausente ou divergente.';
  end if;

  select count(*) into actual_count
    from public.global_lens_families
   where version_id = hoya_source_id;
  if actual_count <> 22 then
    raise exception 'HOYA deveria ter 22 familias; encontrado: %.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_lens_offers offer
    join public.global_lens_families family on family.id = offer.family_id
   where family.version_id = hoya_source_id;
  if actual_count <> 493 then
    raise exception 'HOYA deveria ter 493 ofertas; encontrado: %.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_lens_families
   where version_id = mixed_source_id
     and nome in ('OMEGALUX 4K', 'OMEGALUX DIGITAL', 'OMEGALUX IN', 'PRO LIFE VI');
  if actual_count <> 4 then
    raise exception 'Catalogo misto deveria ter as quatro familias auditadas; encontrado: %.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_lens_families
   where version_id = mixed_source_id
     and nome not in ('OMEGALUX 4K', 'OMEGALUX DIGITAL', 'OMEGALUX IN', 'PRO LIFE VI');
  if actual_count <> 0 then
    raise exception 'Catalogo misto contem familias fora do escopo aprovado: %.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_lens_offers offer
    join public.global_lens_families family on family.id = offer.family_id
   where family.version_id = mixed_source_id;
  if actual_count <> 119 then
    raise exception 'Catalogo misto deveria ter 119 ofertas; encontrado: %.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_source_evidence
   where version_id in (hoya_source_id, mixed_source_id);
  if actual_count <> 0 then
    raise exception 'As origens passaram a ter evidencias; revisar a estrategia de clonagem antes de continuar.';
  end if;

  select count(*) into actual_count
    from public.catalog_source_pages page
    join public.catalog_source_documents document on document.id = page.document_id
   where document.version_id in (hoya_source_id, mixed_source_id);
  if actual_count <> 0 then
    raise exception 'As origens passaram a ter paginas; revisar a estrategia de clonagem antes de continuar.';
  end if;

  insert into public.global_catalog_versions (
    laboratorio,
    versao,
    source_kind,
    status,
    notes
  ) values (
    'HOYA',
    'HOYA Dezembro 2025 com PRO LIFE Julho 2026',
    'manual',
    'draft',
    'Composicao auditavel da HOYA Dezembro 2025 com a familia PRO LIFE VI da tabela Julho 2026.'
  )
  on conflict (laboratorio, versao) do nothing;

  insert into public.global_catalog_versions (
    laboratorio,
    versao,
    source_kind,
    status,
    notes
  ) values (
    'OMEGALUX',
    'OMEGALUX Julho 2026',
    'manual',
    'draft',
    'Separacao auditavel das familias OMEGALUX da antiga tabela conjunta OMEGALUX / PRO LIFE.'
  )
  on conflict (laboratorio, versao) do nothing;

  select id into strict hoya_prolife_id
    from public.global_catalog_versions
   where laboratorio = 'HOYA'
     and versao = 'HOYA Dezembro 2025 com PRO LIFE Julho 2026';

  select id into strict omegalux_id
    from public.global_catalog_versions
   where laboratorio = 'OMEGALUX'
     and versao = 'OMEGALUX Julho 2026';

  if exists (
    select 1 from public.global_catalog_versions
     where id in (hoya_prolife_id, omegalux_id)
       and status <> 'draft'
  ) then
    raise exception 'As novas versoes ja existem fora de draft; operacao interrompida.';
  end if;

  create temporary table split_version_sources (
    source_version_id uuid not null,
    target_version_id uuid not null,
    family_scope text not null,
    primary key (source_version_id, target_version_id, family_scope)
  ) on commit drop;

  insert into split_version_sources values
    (hoya_source_id, hoya_prolife_id, 'all'),
    (mixed_source_id, hoya_prolife_id, 'prolife'),
    (mixed_source_id, omegalux_id, 'omegalux');

  insert into public.catalog_source_documents (
    version_id,
    laboratorio,
    document_name,
    source_type,
    source_path,
    document_hash,
    extraction_engine,
    extracted_text,
    metadata
  )
  select distinct
    source.target_version_id,
    document.laboratorio,
    document.document_name,
    document.source_type,
    document.source_path,
    document.document_hash,
    document.extraction_engine,
    document.extracted_text,
    document.metadata || jsonb_build_object(
      'split_from_version_id', document.version_id,
      'split_migration', '20260912120000'
    )
    from split_version_sources source
    join public.catalog_source_documents document
      on document.version_id = source.source_version_id
  on conflict (version_id, document_hash) do nothing;

  create temporary table split_document_map on commit drop as
  select distinct
    source.source_version_id,
    source.target_version_id,
    original.id as source_document_id,
    target.id as target_document_id
    from split_version_sources source
    join public.catalog_source_documents original
      on original.version_id = source.source_version_id
    join public.catalog_source_documents target
      on target.version_id = source.target_version_id
     and target.document_hash = original.document_hash;

  create temporary table split_family_sources on commit drop as
  select
    family.id as source_family_id,
    source.target_version_id
    from split_version_sources source
    join public.global_lens_families family
      on family.version_id = source.source_version_id
   where source.family_scope = 'all'
      or (source.family_scope = 'prolife' and family.nome = 'PRO LIFE VI')
      or (source.family_scope = 'omegalux' and family.nome in ('OMEGALUX 4K', 'OMEGALUX DIGITAL', 'OMEGALUX IN'));

  insert into public.global_lens_families (
    version_id,
    source_document_id,
    nome,
    design,
    description_marketing,
    tags_uso,
    tags_beneficios,
    source_page_reference,
    clinical_category,
    geometry_id
  )
  select
    source.target_version_id,
    document_map.target_document_id,
    family.nome,
    family.design,
    family.description_marketing,
    family.tags_uso,
    family.tags_beneficios,
    family.source_page_reference,
    family.clinical_category,
    family.geometry_id
    from split_family_sources source
    join public.global_lens_families family on family.id = source.source_family_id
    left join split_document_map document_map
      on document_map.source_document_id = family.source_document_id
     and document_map.target_version_id = source.target_version_id
  on conflict (version_id, nome) do nothing;

  create temporary table split_family_map on commit drop as
  select
    source.source_family_id,
    source.target_version_id,
    target.id as target_family_id
    from split_family_sources source
    join public.global_lens_families original on original.id = source.source_family_id
    join public.global_lens_families target
      on target.version_id = source.target_version_id
     and target.nome = original.nome;

  create temporary table split_treatment_sources on commit drop as
  select distinct
    treatment.id as source_treatment_id,
    source.target_version_id
    from split_version_sources source
    join public.global_treatments treatment
      on treatment.version_id = source.source_version_id;

  insert into public.global_treatments (
    version_id,
    laboratorio,
    nome,
    tipo,
    tags,
    features
  )
  select
    source.target_version_id,
    target_version.laboratorio,
    treatment.nome,
    treatment.tipo,
    treatment.tags,
    treatment.features
    from split_treatment_sources source
    join public.global_treatments treatment on treatment.id = source.source_treatment_id
    join public.global_catalog_versions target_version on target_version.id = source.target_version_id
  on conflict (version_id, nome) do nothing;

  create temporary table split_treatment_map on commit drop as
  select
    source.source_treatment_id,
    source.target_version_id,
    target.id as target_treatment_id
    from split_treatment_sources source
    join public.global_treatments original on original.id = source.source_treatment_id
    join public.global_treatments target
      on target.version_id = source.target_version_id
     and target.nome = original.nome;

  insert into public.global_lens_offers (
    family_id,
    raw_label,
    canonical_label,
    material,
    indice_refracao,
    is_atomic_offer,
    allows_composition,
    already_includes_treatment,
    features,
    base_price,
    source_page_reference,
    confidence_level,
    import_key,
    clinical_category
  )
  select
    family_map.target_family_id,
    offer.raw_label,
    offer.canonical_label,
    offer.material,
    offer.indice_refracao,
    offer.is_atomic_offer,
    offer.allows_composition,
    offer.already_includes_treatment,
    offer.features,
    offer.base_price,
    offer.source_page_reference,
    offer.confidence_level,
    offer.import_key,
    offer.clinical_category
    from split_family_map family_map
    join public.global_lens_offers offer on offer.family_id = family_map.source_family_id
  on conflict (family_id, import_key) do nothing;

  create temporary table split_offer_map on commit drop as
  select
    family_map.target_version_id,
    original.id as source_offer_id,
    target.id as target_offer_id
    from split_family_map family_map
    join public.global_lens_offers original on original.family_id = family_map.source_family_id
    join public.global_lens_offers target
      on target.family_id = family_map.target_family_id
     and target.import_key = original.import_key;

  insert into public.global_offer_diopter_grids (
    offer_id,
    sph_min,
    sph_max,
    cyl_min,
    cyl_max,
    add_min,
    add_max,
    metadata
  )
  select
    offer_map.target_offer_id,
    grid.sph_min,
    grid.sph_max,
    grid.cyl_min,
    grid.cyl_max,
    grid.add_min,
    grid.add_max,
    grid.metadata
    from split_offer_map offer_map
    join public.global_offer_diopter_grids grid on grid.offer_id = offer_map.source_offer_id;

  insert into public.global_offer_treatments_compatibility (
    offer_id,
    treatment_id,
    special_price,
    notes,
    price_mode
  )
  select
    offer_map.target_offer_id,
    treatment_map.target_treatment_id,
    compatibility.special_price,
    compatibility.notes,
    compatibility.price_mode
    from split_offer_map offer_map
    join public.global_offer_treatments_compatibility compatibility
      on compatibility.offer_id = offer_map.source_offer_id
    join split_treatment_map treatment_map
      on treatment_map.source_treatment_id = compatibility.treatment_id
     and treatment_map.target_version_id = offer_map.target_version_id
  on conflict (offer_id, treatment_id) do nothing;

  insert into public.global_usage_profiles (
    family_id,
    offer_id,
    profile_scope,
    usage_tags,
    benefit_tags,
    commercial_summary,
    recommendation_notes,
    source_page_reference
  )
  select
    family_map.target_family_id,
    offer_map.target_offer_id,
    profile.profile_scope,
    profile.usage_tags,
    profile.benefit_tags,
    profile.commercial_summary,
    profile.recommendation_notes,
    profile.source_page_reference
    from public.global_usage_profiles profile
    left join split_family_map family_map on family_map.source_family_id = profile.family_id
    left join split_offer_map offer_map
      on offer_map.source_offer_id = profile.offer_id
     and offer_map.target_version_id = family_map.target_version_id
   where family_map.target_family_id is not null
     and (
       profile.offer_id is null
       or offer_map.target_offer_id is not null
     );

  select count(*) into actual_count
    from public.global_lens_families
   where version_id = hoya_prolife_id;
  if actual_count <> 23 then
    raise exception 'Draft HOYA + PRO LIFE deveria ter 23 familias; encontrado: %.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_lens_offers offer
    join public.global_lens_families family on family.id = offer.family_id
   where family.version_id = hoya_prolife_id;
  if actual_count <> 547 then
    raise exception 'Draft HOYA + PRO LIFE deveria ter 547 ofertas; encontrado: %.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_treatments
   where version_id = hoya_prolife_id;
  if actual_count <> 19 then
    raise exception 'Draft HOYA + PRO LIFE deveria ter 19 tratamentos; encontrado: %.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_offer_diopter_grids grid
    join public.global_lens_offers offer on offer.id = grid.offer_id
    join public.global_lens_families family on family.id = offer.family_id
   where family.version_id = hoya_prolife_id;
  if actual_count <> 535 then
    raise exception 'Draft HOYA + PRO LIFE deveria ter 535 grades; encontrado: %.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_lens_families
   where version_id = omegalux_id;
  if actual_count <> 3 then
    raise exception 'Draft OMEGALUX deveria ter 3 familias; encontrado: %.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_lens_offers offer
    join public.global_lens_families family on family.id = offer.family_id
   where family.version_id = omegalux_id;
  if actual_count <> 65 then
    raise exception 'Draft OMEGALUX deveria ter 65 ofertas; encontrado: %.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_treatments
   where version_id = omegalux_id;
  if actual_count <> 11 then
    raise exception 'Draft OMEGALUX deveria ter 11 tratamentos; encontrado: %.', actual_count;
  end if;

  select count(*) into actual_count
    from public.global_offer_diopter_grids grid
    join public.global_lens_offers offer on offer.id = grid.offer_id
    join public.global_lens_families family on family.id = offer.family_id
   where family.version_id = omegalux_id;
  if actual_count <> 33 then
    raise exception 'Draft OMEGALUX deveria ter 33 grades; encontrado: %.', actual_count;
  end if;
end;
$$;
