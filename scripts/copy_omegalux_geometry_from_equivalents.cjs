const dotenv = require('dotenv')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const commit = process.argv.includes('--commit')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Erro: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const GEOMETRY_COLUMNS = [
  'family_name',
  'visual_design_type',
  'distance_present',
  'distance_width',
  'intermediate_present',
  'intermediate_width',
  'corridor_opening',
  'near_present',
  'near_width',
  'corridor_length',
  'lateral_blur',
  'inset',
  'distance_reference_height',
  'near_reference_height',
  'fitting_height',
  'pins',
].join(', ')

const MAPPINGS = [
  { target: 'OMEGALUX IN', source: 'Varilux Liberty 3.0', confidence: 'confirmed_by_store' },
  { target: 'OMEGALUX DIGITAL', source: 'Varilux Comfort Max', confidence: 'confirmed_by_store' },
  { target: 'OMEGALUX 4K', source: 'Varilux XR Pro', confidence: 'confirmed_by_store' },
]

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function cloneGeometry(source, mapping) {
  return {
    family_name: mapping.target,
    visual_design_type: source.visual_design_type,
    distance_present: source.distance_present,
    distance_width: source.distance_width,
    intermediate_present: source.intermediate_present,
    intermediate_width: source.intermediate_width,
    corridor_opening: source.corridor_opening ?? source.intermediate_width ?? 0,
    near_present: source.near_present,
    near_width: source.near_width,
    corridor_length: source.corridor_length,
    lateral_blur: source.lateral_blur,
    inset: source.inset,
    distance_reference_height: source.distance_reference_height,
    near_reference_height: source.near_reference_height,
    fitting_height: source.fitting_height,
    pins: source.pins ?? null,
    updated_at: new Date().toISOString(),
  }
}

async function main() {
  const { data, error } = await supabase
    .from('global_lens_geometry')
    .select(GEOMETRY_COLUMNS)
    .in('family_name', MAPPINGS.map((mapping) => mapping.source))

  if (error) throw error

  const geometryByName = new Map((data || []).map((row) => [normalize(row.family_name), row]))
  const ready = []
  const skipped = []

  for (const mapping of MAPPINGS) {
    const source = geometryByName.get(normalize(mapping.source))
    if (!source) {
      skipped.push({ ...mapping, status: 'source_geometry_missing' })
      continue
    }
    ready.push({
      ...mapping,
      status: 'ready',
      payload: cloneGeometry(source, mapping),
    })
  }

  if (commit && ready.length) {
    const { error: upsertError } = await supabase
      .from('global_lens_geometry')
      .upsert(ready.map((item) => item.payload), { onConflict: 'family_name' })
    if (upsertError) throw upsertError
  }

  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    commit,
    copied_count: ready.length,
    skipped_count: skipped.length,
    copied: ready.map((item) => ({
      target: item.target,
      source: item.source,
      confidence: item.confidence,
      visual_design_type: item.payload.visual_design_type,
      corridor_opening: item.payload.corridor_opening,
    })),
    skipped,
  }, null, 2))
}

main().catch((error) => {
  console.error('Falha ao copiar geometria OMEGALUX / PRO LIFE:', error.message || error)
  process.exit(1)
})
