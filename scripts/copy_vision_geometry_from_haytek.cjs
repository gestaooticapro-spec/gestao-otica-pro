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
  'id',
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

const GEOMETRY_COLUMNS_NO_PINS = GEOMETRY_COLUMNS.replace(', pins', '')

const VISION_TO_SOURCES = [
  {
    vision: 'Vision Drive',
    sources: [
      { family: 'Haytek Drive', confidence: 'direct_semantics' },
      { family: 'Varilux Roadpilot', confidence: 'occupational_drive_fallback' },
      { family: 'Varilux Sport', confidence: 'occupational_drive_fallback' },
    ],
  },
  {
    vision: 'Vision Office',
    sources: [
      { family: 'Haytek Office', confidence: 'direct_semantics' },
      { family: 'Varilux Digitime', confidence: 'occupational_office_fallback' },
      { family: 'Varilux Sport', confidence: 'occupational_office_fallback' },
    ],
  },
  { vision: 'Vision Plus 4K Premium', sources: [{ family: 'Haytek Pro ID', confidence: 'confirmed_mapping' }] },
  { vision: 'Vision Plus 4K', sources: [{ family: 'Haytek Top', confidence: 'confirmed_mapping' }] },
  { vision: 'Vision Plus Individual', sources: [{ family: 'Haytek Smart', confidence: 'confirmed_mapping' }] },
  { vision: 'Vision Plus Pro', sources: [{ family: 'Haytek Light', confidence: 'confirmed_mapping' }] },
  { vision: 'Vision Plus HD', sources: [{ family: 'Haytek Go!', confidence: 'confirmed_mapping' }] },
  { vision: 'Vision Plus Lite', sources: [{ family: 'Haytek Go!', confidence: 'heuristic_entry_level' }] },
  { vision: 'Vision Plus Basic', sources: [{ family: 'Haytek Go!', confidence: 'heuristic_entry_level' }] },
  { vision: 'Vision Plus Extensee', sources: [{ family: 'Haytek Light', confidence: 'heuristic_wide_field' }] },
  { vision: 'Vision Plus', sources: [{ family: 'Haytek Go!', confidence: 'heuristic_generic_entry' }] },
]

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchAll(table, columns) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + 999)

    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  return rows
}

function cloneGeometry(source, familyName, sourceFamilyName, confidence) {
  return {
    family_name: familyName,
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

async function readGeometryRows() {
  let { data, error } = await supabase
    .from('global_lens_geometry')
    .select(GEOMETRY_COLUMNS)
    .order('family_name')

  if (error && error.message?.toLowerCase().includes('pins')) {
    const fallback = await supabase
      .from('global_lens_geometry')
      .select(GEOMETRY_COLUMNS_NO_PINS)
      .order('family_name')
    data = fallback.data
    error = fallback.error
  }

  if (error) throw error
  return data || []
}

async function main() {
  const [versions, families, geometries] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome'),
    readGeometryRows(),
  ])

  const versionByLab = new Map(versions.map((version) => [normalize(version.laboratorio), version]))
  const visionVersion = versionByLab.get('vision')
  const haytekVersion = versionByLab.get('haytek')

  if (!visionVersion || !haytekVersion) {
    throw new Error('Versoes Vision/Haytek nao encontradas.')
  }

  const familyByVersionAndName = new Map(
    families.map((family) => [`${family.version_id}|${normalize(family.nome)}`, family]),
  )
  const familyByNormalizedName = new Map(families.map((family) => [normalize(family.nome), family]))

  const geometryByFamilyName = new Map(geometries.map((row) => [normalize(row.family_name), row]))

  const operations = []
  for (const mapping of VISION_TO_SOURCES) {
    const visionFamily = familyByVersionAndName.get(`${visionVersion.id}|${normalize(mapping.vision)}`)
    if (!visionFamily) {
      operations.push({ vision: mapping.vision, status: 'skip_vision_missing' })
      continue
    }

    let resolvedSource = null
    for (const candidate of mapping.sources) {
      const sourceGeometry = geometryByFamilyName.get(normalize(candidate.family))
      if (sourceGeometry) {
        resolvedSource = {
          sourceGeometry,
          sourceName: candidate.family,
          confidence: candidate.confidence,
        }
        break
      }
    }

    if (!resolvedSource) {
      operations.push({
        vision: visionFamily.nome,
        status: 'skip_source_geometry_missing',
        candidates: mapping.sources.map((candidate) => candidate.family),
      })
      continue
    }

    operations.push({
      vision: visionFamily.nome,
      source: resolvedSource.sourceName,
      status: 'ready',
      confidence: resolvedSource.confidence,
      source_geometry: {
        family_name: resolvedSource.sourceGeometry.family_name,
        visual_design_type: resolvedSource.sourceGeometry.visual_design_type,
        corridor_opening: resolvedSource.sourceGeometry.corridor_opening,
      },
      payload: cloneGeometry(
        resolvedSource.sourceGeometry,
        visionFamily.nome,
        resolvedSource.sourceGeometry.family_name,
        resolvedSource.confidence,
      ),
    })
  }

  const ready = operations.filter((item) => item.status === 'ready')
  const skipped = operations.filter((item) => item.status !== 'ready')

  if (commit && ready.length) {
    const payload = ready.map((item) => item.payload)
    const { error } = await supabase
      .from('global_lens_geometry')
      .upsert(payload, { onConflict: 'family_name' })

    if (error) throw error
  }

  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    commit,
    copied_count: ready.length,
    skipped_count: skipped.length,
    copied: ready.map((item) => ({
      vision: item.vision,
      source: item.source,
      confidence: item.confidence,
      source_family: item.source_geometry.family_name,
      corridor_opening: item.payload.corridor_opening,
    })),
    skipped,
  }, null, 2))
}

main().catch((error) => {
  console.error('Falha ao copiar geometria Vision:', error.message || error)
  process.exit(1)
})
