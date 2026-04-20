require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const data = [
  {
    family_name: 'Varilux XR Pro',
    visual_design_type: 'progressive',
    distance_present: true, distance_width: 95,
    intermediate_present: true, intermediate_width: 85, corridor_opening: 85,
    near_present: true, near_width: 95,
    corridor_length: 50, lateral_blur: 5,
    inset: 50, distance_reference_height: 50, near_reference_height: 50, fitting_height: 50
  },
  {
    family_name: 'Varilux XR Track',
    visual_design_type: 'progressive',
    distance_present: true, distance_width: 95,
    intermediate_present: true, intermediate_width: 85, corridor_opening: 85,
    near_present: true, near_width: 95,
    corridor_length: 50, lateral_blur: 5,
    inset: 50, distance_reference_height: 50, near_reference_height: 50, fitting_height: 50
  },
  {
    family_name: 'Varilux XR Design',
    visual_design_type: 'progressive',
    distance_present: true, distance_width: 90,
    intermediate_present: true, intermediate_width: 80, corridor_opening: 80,
    near_present: true, near_width: 90,
    corridor_length: 50, lateral_blur: 10,
    inset: 50, distance_reference_height: 50, near_reference_height: 50, fitting_height: 50
  },
  {
    family_name: 'Varilux XR Track Lite',
    visual_design_type: 'personalized',
    distance_present: true, distance_width: null,
    intermediate_present: true, intermediate_width: null, corridor_opening: 0,
    near_present: true, near_width: null,
    corridor_length: null, lateral_blur: null,
    inset: null, distance_reference_height: null, near_reference_height: null, fitting_height: null
  },
  {
    family_name: 'Varilux Physio Extensee Track',
    visual_design_type: 'progressive',
    distance_present: true, distance_width: 85,
    intermediate_present: true, intermediate_width: 75, corridor_opening: 75,
    near_present: true, near_width: 85,
    corridor_length: 60, lateral_blur: 20,
    inset: 50, distance_reference_height: 50, near_reference_height: 50, fitting_height: 50
  },
  {
    family_name: 'Varilux Physio Extensee',
    visual_design_type: 'progressive',
    distance_present: true, distance_width: 85,
    intermediate_present: true, intermediate_width: 75, corridor_opening: 75,
    near_present: true, near_width: 85,
    corridor_length: 60, lateral_blur: 20,
    inset: 50, distance_reference_height: 50, near_reference_height: 50, fitting_height: 50
  },
  {
    family_name: 'Varilux Comfort Max',
    visual_design_type: 'progressive',
    distance_present: true, distance_width: 70,
    intermediate_present: true, intermediate_width: 60, corridor_opening: 60,
    near_present: true, near_width: 70,
    corridor_length: 50, lateral_blur: 40,
    inset: 50, distance_reference_height: 50, near_reference_height: 50, fitting_height: 50
  },
  {
    family_name: 'Varilux Liberty 3.0',
    visual_design_type: 'progressive',
    distance_present: true, distance_width: 60,
    intermediate_present: true, intermediate_width: 45, corridor_opening: 45,
    near_present: true, near_width: 60,
    corridor_length: 50, lateral_blur: 60,
    inset: 50, distance_reference_height: 50, near_reference_height: 50, fitting_height: 50
  },
  {
    family_name: 'Varilux Digitime',
    visual_design_type: 'occupational',
    distance_present: false, distance_width: 0,
    intermediate_present: true, intermediate_width: 90, corridor_opening: 90,
    near_present: true, near_width: 90,
    corridor_length: 40, lateral_blur: 15,
    inset: 50, distance_reference_height: 0, near_reference_height: 50, fitting_height: 50
  },
  {
    family_name: 'Varilux Roadpilot',
    visual_design_type: 'occupational',
    distance_present: true, distance_width: 95,
    intermediate_present: true, intermediate_width: 80, corridor_opening: 80,
    near_present: false, near_width: 0,
    corridor_length: 60, lateral_blur: 25,
    inset: 50, distance_reference_height: 50, near_reference_height: 0, fitting_height: 50
  },
  {
    family_name: 'Varilux Sport',
    visual_design_type: 'occupational',
    distance_present: true, distance_width: 100,
    intermediate_present: true, intermediate_width: 60, corridor_opening: 60,
    near_present: true, near_width: 30,
    corridor_length: 50, lateral_blur: 35,
    inset: 50, distance_reference_height: 50, near_reference_height: 50, fitting_height: 50
  },
  {
    family_name: 'Kodak Precise',
    visual_design_type: 'progressive',
    distance_present: true, distance_width: 50,
    intermediate_present: true, intermediate_width: 40, corridor_opening: 40,
    near_present: true, near_width: 50,
    corridor_length: 50, lateral_blur: 60,
    inset: 60, distance_reference_height: 85, near_reference_height: 25, fitting_height: 65
  },
  {
    family_name: 'Kodak Precise UHD',
    visual_design_type: 'progressive',
    distance_present: true, distance_width: 55,
    intermediate_present: true, intermediate_width: 45, corridor_opening: 45,
    near_present: true, near_width: 55,
    corridor_length: 50, lateral_blur: 55,
    inset: 60, distance_reference_height: 80, near_reference_height: 25, fitting_height: 65
  },
  {
    family_name: 'Kodak Network UHD',
    visual_design_type: 'progressive',
    distance_present: true, distance_width: 65,
    intermediate_present: true, intermediate_width: 50, corridor_opening: 50,
    near_present: true, near_width: 65,
    corridor_length: 50, lateral_blur: 45,
    inset: 60, distance_reference_height: 70, near_reference_height: 25, fitting_height: 65
  },
  {
    family_name: 'Kodak Unique UHD',
    visual_design_type: 'progressive',
    distance_present: true, distance_width: 75,
    intermediate_present: true, intermediate_width: 60, corridor_opening: 60,
    near_present: true, near_width: 80,
    corridor_length: 50, lateral_blur: 35,
    inset: 60, distance_reference_height: 60, near_reference_height: 25, fitting_height: 65
  },
  {
    family_name: 'Kodak Unique Infinite',
    visual_design_type: 'progressive',
    distance_present: true, distance_width: 85,
    intermediate_present: true, intermediate_width: 75, corridor_opening: 75,
    near_present: true, near_width: 85,
    corridor_length: 50, lateral_blur: 25,
    inset: 60, distance_reference_height: 50, near_reference_height: 25, fitting_height: 65
  },
]

async function run() {
  const { data: inserted, error } = await sb
    .from('global_lens_geometry')
    .upsert(data, { onConflict: 'family_name' })
    .select('id, family_name, visual_design_type')

  if (error) {
    console.error('Erro:', error)
    process.exit(1)
  }

  console.log(`✓ ${inserted.length} registros inseridos/atualizados:`)
  inserted.forEach(r => console.log(`  ${r.family_name} [${r.visual_design_type}]`))
}

run()
