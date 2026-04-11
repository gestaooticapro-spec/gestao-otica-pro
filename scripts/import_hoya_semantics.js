import path from 'path'
import fs from 'fs/promises'
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
  '.tabelas/pesquisa_semantica_hoya_insert_ready.json'
const versionId =
  args.find((arg) => arg.startsWith('--version-id='))?.split('=')[1] ||
  '08f91e88-40f5-4521-b476-d09c7f1955cf'

const FAMILY_ALIASES = {
  'sportive (progressiva)': ['Hoyalux Sportive Progressiva'],
  'sportive (visao simples)': ['Sportive Visao Simples'],
  sportive: ['Hoyalux Sportive Progressiva', 'Sportive Visao Simples'],
  enroute: ['EnRoute Progressiva', 'EnRoute Visao Simples'],
  'hoyalux id workstyle 3': ['WorkStyle 3'],
  'hoyalux worksmart room': ['WorkSmart Room'],
  'linha ocupacional (workstyle 3 / worksmart room)': ['WorkStyle 3', 'WorkSmart Room'],
  'solucoes ocupacionais (workstyle / worksmart)': ['WorkStyle 3', 'WorkSmart Room'],
  'hoyalux id lifestyle 3 (e 4/4i)': ['Hoyalux iD LifeStyle 4', 'Hoyalux iD LifeStyle 4i'],
  'hoyalux id lifestyle 3 / 4': ['Hoyalux iD LifeStyle 4', 'Hoyalux iD LifeStyle 4i'],
  hilux: ['HILUX Esfericas Surfacadas', 'HILUX Prontas Esfericas'],
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function resolveFamilyTargets(name) {
  const key = normalizeName(name)
  if (FAMILY_ALIASES[key]) return FAMILY_ALIASES[key]
  return [name]
}

async function loadInput() {
  const raw = await fs.readFile(inputPath, 'utf-8')
  return JSON.parse(raw)
}

async function enrichFamilies(entries) {
  const familyEntries = entries.filter((item) =>
    ['family', 'subfamily'].includes(String(item.entity_type || '').toLowerCase()),
  )
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
    const targets = resolveFamilyTargets(entry.entity_name)
    let matchedAny = false

    for (const target of targets) {
      const family = familyByName.get(normalizeName(target))
      if (!family) continue

      matchedAny = true
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

    if (!matchedAny) {
      missing.push(entry.entity_name)
    }
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
  const treatmentEntries = entries.filter(
    (item) => String(item.entity_type || '').toLowerCase() === 'treatment',
  )
  if (!treatmentEntries.length) return { updated: 0, missing: [] }

  const { data: treatments, error } = await supabase
    .from('global_treatments')
    .select('id,nome,features')
    .eq('version_id', versionId)

  if (error) throw error

  const treatmentByName = new Map(
    treatments.map((treatment) => [normalizeName(treatment.nome), treatment]),
  )

  let updated = 0
  const missing = []

  for (const entry of treatmentEntries) {
    const key = normalizeName(entry.entity_name)
    const treatment = treatmentByName.get(key)
    if (!treatment) {
      missing.push(entry.entity_name)
      continue
    }

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
    }

    const mergedFeatures = {
      ...(treatment.features || {}),
      semantic_profile: semanticProfile,
    }

    const { error: updateError } = await supabase
      .from('global_treatments')
      .update({ features: mergedFeatures })
      .eq('id', treatment.id)

    if (updateError) throw updateError
    updated += 1
  }

  return { updated, missing }
}

async function main() {
  const entries = await loadInput()

  const familyResult = await enrichFamilies(entries)
  const treatmentResult = await enrichTreatments(entries)

  console.log(`HOYA semantica aplicada.`)
  console.log(`Perfis de familia: ${familyResult.updated}`)
  if (familyResult.missing.length) {
    console.log(`Familias nao encontradas: ${familyResult.missing.join(', ')}`)
  }

  console.log(`Tratamentos atualizados: ${treatmentResult.updated}`)
  if (treatmentResult.missing.length) {
    console.log(`Tratamentos nao encontrados: ${treatmentResult.missing.join(', ')}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
