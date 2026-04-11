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
  '.tabelas/pesquisa_ranking_tratamentos_insert_ready.json'

const versionId =
  args.find((arg) => arg.startsWith('--version-id='))?.split('=')[1] || null

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

async function main() {
  const entries = await loadInput()
  if (!entries.length) {
    console.log('Nenhum tratamento para importar.')
    return
  }

  const { data: treatments, error } = await supabase
    .from('global_treatments')
    .select('id,nome,features,version_id')

  if (error) throw error

  const filtered = versionId
    ? treatments.filter((t) => String(t.version_id) === String(versionId))
    : treatments

  const treatmentByName = new Map(filtered.map((t) => [normalizeName(t.nome), t]))

  let updated = 0
  const missing = []

  for (const entry of entries) {
    const name = entry.entity_name
    const treatment = treatmentByName.get(normalizeName(name))
    if (!treatment) {
      missing.push(name)
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
      manufacturer_or_brand: entry.manufacturer_or_brand || null,
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

  console.log(`Tratamentos atualizados: ${updated}`)
  if (missing.length) {
    console.log(`Tratamentos não encontrados: ${missing.join(', ')}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
