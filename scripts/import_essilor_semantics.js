import fs from 'fs/promises'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Erro: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const args = process.argv.slice(2)
const inputPath =
  args.find((arg) => !arg.startsWith('--')) ||
  '.tabelas/pesquisa_tratamento_essilor_kodak_insert_ready.json'
const versionId =
  args.find((arg) => arg.startsWith('--version-id='))?.split('=')[1] ||
  '99497d03-50bf-46b7-a7ab-8cb19e80db5a'

const FAMILY_HINTS = [
  { match: /varilux xr/i, family: 'Varilux XR Series' },
  { match: /varilux/i, family: 'Varilux' },
  { match: /eyezen start/i, family: 'Eyezen' },
  { match: /eyezen boost/i, family: 'Eyezen' },
  { match: /eyezen/i, family: 'Eyezen' },
  { match: /stellest/i, family: 'Stellest' },
  { match: /kodak/i, family: 'Kodak' },
]

const TREATMENT_HINTS = [/crizal/i, /transitions/i, /blue uv/i, /blue guard/i, /optifog/i, /verniz/i, /trio easy clean/i]

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

async function loadInput() {
  const raw = await fs.readFile(inputPath, 'utf-8')
  return JSON.parse(raw)
}

function mapToFamilyName(entry) {
  const name = entry.entity_name || ''
  for (const hint of FAMILY_HINTS) {
    if (hint.match.test(name)) return hint.family
  }
  return name
}

function findFamilyMatch(familyByName, target) {
  const normalizedTarget = normalizeName(target)
  const exact = familyByName.get(normalizedTarget)
  if (exact) return exact
  for (const [key, family] of familyByName.entries()) {
    if (key.includes(normalizedTarget) || normalizedTarget.includes(key)) {
      return family
    }
  }
  return null
}

function looksLikeTreatment(name) {
  return TREATMENT_HINTS.some((hint) => hint.test(name))
}

async function enrichFamilies(entries) {
  const familyEntries = entries.filter((item) => {
    const type = String(item.entity_type || '').toLowerCase()
    if (type === 'family') return true
    if (type === 'treatment') return !looksLikeTreatment(item.entity_name || '')
    return false
  })
  if (!familyEntries.length) return { updated: 0, missing: [] }

  const { data: families, error } = await supabase
    .from('global_lens_families')
    .select('id,nome,source_page_reference')
    .eq('version_id', versionId)

  if (error) throw error

  const familyByName = new Map(families.map((family) => [normalizeName(family.nome), family]))
  const missing = []

  const rows = []
  const seenFamilyIds = new Set()
  for (const entry of familyEntries) {
    const target = mapToFamilyName(entry)
    let family = findFamilyMatch(familyByName, target)
    if (!family && /eyezen/i.test(target)) {
      family = findFamilyMatch(familyByName, 'Lentes Essilor')
    }
    if (!family) {
      missing.push(entry.entity_name)
      continue
    }
    if (seenFamilyIds.has(family.id)) continue
    seenFamilyIds.add(family.id)

    rows.push({
      family_id: family.id,
      profile_scope: 'family',
      usage_tags: entry.usage_tags || [],
      benefit_tags: entry.benefit_tags || [],
      commercial_summary: entry.commercial_summary || null,
      recommendation_notes: entry.recommendation_notes || null,
      source_page_reference: family.source_page_reference || null,
    })
  }

  if (!rows.length) return { updated: 0, missing }

  const familyIds = rows.map((row) => row.family_id)
  const { error: deleteError } = await supabase
    .from('global_usage_profiles')
    .delete()
    .eq('profile_scope', 'family')
    .in('family_id', familyIds)

  if (deleteError) throw deleteError

  const { error: insertError } = await supabase.from('global_usage_profiles').insert(rows)
  if (insertError) throw insertError

  for (const row of rows) {
    const { error: updateError } = await supabase
      .from('global_lens_families')
      .update({
        tags_uso: row.usage_tags,
        tags_beneficios: row.benefit_tags,
      })
      .eq('id', row.family_id)

    if (updateError) throw updateError
  }

  return { updated: rows.length, missing }
}

async function enrichTreatments(entries) {
  const treatmentEntries = entries.filter((item) => {
    const type = String(item.entity_type || '').toLowerCase()
    return type === 'treatment' && looksLikeTreatment(item.entity_name || '')
  })
  if (!treatmentEntries.length) return { updated: 0, created: 0, missing: [] }

  const { data: treatments, error } = await supabase
    .from('global_treatments')
    .select('id,nome,features,version_id,tipo')
    .eq('version_id', versionId)

  if (error) throw error

  const treatmentByName = new Map(treatments.map((t) => [normalizeName(t.nome), t]))

  let updated = 0
  let created = 0
  const missing = []

  for (const entry of treatmentEntries) {
    const name = entry.entity_name
    const semanticProfile = {
      usage_tags: entry.usage_tags || [],
      benefit_tags: entry.benefit_tags || [],
      technology_tags: entry.technology_tags || [],
      material_tags: entry.material_tags || [],
      positioning: entry.positioning || null,
      commercial_summary: entry.commercial_summary || null,
      recommendation_notes: entry.recommendation_notes || null,
      evidence_level: entry.evidence_level || null,
      evidence_type: entry.evidence_type || null,
      source_urls: entry.source_urls || [],
      source_quotes_or_points: entry.source_quotes_or_points || [],
      category: entry.category || null,
      manufacturer_or_brand: entry.manufacturer_or_brand || null,
    }

    const existing = treatmentByName.get(normalizeName(name))
    if (!existing) {
      const { error: insertError } = await supabase.from('global_treatments').insert({
        version_id: versionId,
        laboratorio: 'Essilor',
        nome: name,
        tipo: entry.category || 'tratamento',
        features: { semantic_profile: semanticProfile },
      })
      if (insertError) throw insertError
      created += 1
      continue
    }

    const mergedFeatures = {
      ...(existing.features || {}),
      semantic_profile: semanticProfile,
    }

    const { error: updateError } = await supabase
      .from('global_treatments')
      .update({ features: mergedFeatures, tipo: entry.category || existing.tipo })
      .eq('id', existing.id)

    if (updateError) throw updateError
    updated += 1
  }

  return { updated, created, missing }
}

async function main() {
  const entries = await loadInput()

  const familyResult = await enrichFamilies(entries)
  const treatmentResult = await enrichTreatments(entries)

  console.log('Essilor semantica aplicada.')
  console.log(`Perfis de familia: ${familyResult.updated}`)
  if (familyResult.missing.length) {
    console.log(`Familias nao encontradas: ${familyResult.missing.join(', ')}`)
  }

  console.log(`Tratamentos criados: ${treatmentResult.created}`)
  console.log(`Tratamentos atualizados: ${treatmentResult.updated}`)
  if (treatmentResult.missing.length) {
    console.log(`Tratamentos nao encontrados: ${treatmentResult.missing.join(', ')}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
