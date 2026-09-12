-- Copia a geometria calibrada da PRO LIFE VI para a OMEGALUX 4K.
-- A OMEGALUX 4K estava com a geometria da Varilux XR Pro.

do $$
declare
  source_count integer;
  target_count integer;
  copied_count integer;
begin
  select count(*) into source_count
    from public.global_lens_geometry
   where family_name = 'PRO LIFE VI';

  select count(*) into target_count
    from public.global_lens_geometry
   where family_name = 'OMEGALUX 4K';

  if source_count <> 1 then
    raise exception 'Geometria da PRO LIFE VI ausente ou duplicada (%).', source_count;
  end if;

  if target_count <> 1 then
    raise exception 'Geometria da OMEGALUX 4K ausente ou duplicada (%).', target_count;
  end if;

  update public.global_lens_geometry as target
     set visual_design_type = source.visual_design_type,
         distance_present = source.distance_present,
         distance_width = source.distance_width,
         intermediate_present = source.intermediate_present,
         intermediate_width = source.intermediate_width,
         corridor_opening = coalesce(source.corridor_opening, source.intermediate_width, 0),
         near_present = source.near_present,
         near_width = source.near_width,
         corridor_length = source.corridor_length,
         lateral_blur = source.lateral_blur,
         inset = source.inset,
         distance_reference_height = source.distance_reference_height,
         near_reference_height = source.near_reference_height,
         fitting_height = source.fitting_height,
         pins = source.pins,
         updated_at = timezone('utc'::text, now())
    from public.global_lens_geometry as source
   where target.family_name = 'OMEGALUX 4K'
     and source.family_name = 'PRO LIFE VI';

  get diagnostics copied_count = row_count;
  if copied_count <> 1 then
    raise exception 'Falha ao copiar geometria da PRO LIFE VI para a OMEGALUX 4K (% linhas).', copied_count;
  end if;
end $$;
