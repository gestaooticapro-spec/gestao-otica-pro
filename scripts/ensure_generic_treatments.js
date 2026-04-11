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
const versionId =
  args.find((arg) => arg.startsWith('--version-id='))?.split('=')[1] ||
  '08f91e88-40f5-4521-b476-d09c7f1955cf'
const semanticPath =
  args.find((arg) => arg.startsWith('--semantic='))?.split('=')[1] ||
  '.tabelas/pesquisa_ranking_tratamentos_confiavel.json'

const GENERIC_TREATMENTS = [
  { nome: 'Antirreflexo', tipo: 'antirreflexo', category: 'antirreflexo' },
  { nome: 'Filtro Luz Azul', tipo: 'filtro_luz_azul', category: 'filtro_luz_azul' },
  { nome: 'Fotossensível', tipo: 'fotossensivel', category: 'fotossensivel' },
  { nome: 'Polarizado', tipo: 'polarizado', category: 'polarizado' },
  { nome: 'Solar', tipo: 'solar', category: 'solar' },
  { nome: 'Proteção UV', tipo: 'uv', category: 'filtro_luz_azul' },
  { nome: 'Espelhado', tipo: 'espelhado', category: 'espelhado' },
  { nome: 'Durabilidade', tipo: 'durabilidade', category: 'durabilidade' },
]

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function mergeUnique(values = []) {
  return Array.from(new Set(values.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())))
}

async function loadSemantics() {
  const raw = await fs.readFile(semanticPath, 'utf-8')
  return JSON.parse(raw)
}

function buildGenericSemantic(entries, category) {
  const byCategory = entries.filter((item) => (item.category || '').toLowerCase() === category)
  if (!byCategory.length) {
    return {
      usage_tags: [],
      benefit_tags: [],
      technology_tags: [],
      material_tags: [],
      positioning: 'indefinido',
      commercial_summary: null,
      recommendation_notes: null,
      evidence_level: 'baixo',
      evidence_type: 'apoio_secundario',
      source_urls: [],
      source_quotes_or_points: [],
      category,
    }
  }

  const usage_tags = mergeUnique(byCategory.flatMap((item) => item.usage_tags || []))
  const benefit_tags = mergeUnique(byCategory.flatMap((item) => item.benefit_tags || []))
  const technology_tags = mergeUnique(byCategory.flatMap((item) => item.technology_tags || []))
  const material_tags = mergeUnique(byCategory.flatMap((item) => item.material_tags || []))
  const source_urls = mergeUnique(byCategory.flatMap((item) => item.source_urls || []))
  const source_quotes_or_points = mergeUnique(
    byCategory.flatMap((item) => item.source_quotes_or_points || []),
  )

  return {
    usage_tags,
    benefit_tags,
    technology_tags,
    material_tags,
    positioning: 'indefinido',
    commercial_summary: null,
    recommendation_notes: null,
    evidence_level: 'medio',
    evidence_type: 'oficial',
    source_urls,
    source_quotes_or_points,
    category,
  }
}

async function main() {
  const semantics = await loadSemantics()

  const { data: treatments, error } = await supabase
    .from('global_treatments')
    .select('id,nome,features')
    .eq('version_id', versionId)

  if (error) throw error

  const existingByName = new Map(treatments.map((t) => [normalizeName(t.nome), t]))

  let created = 0
  let updated = 0

  for (const generic of GENERIC_TREATMENTS) {
    const semantic = buildGenericSemantic(semantics, generic.category)
    const payload = {
      nome: generic.nome,
      tipo: generic.tipo,
      version_id: versionId,
      features: {
        semantic_profile: semantic,
      },
    }

    const existing = existingByName.get(normalizeName(generic.nome))
    if (existing) {
      const { error: updateError } = await supabase
        .from('global_treatments')
        .update({ features: payload.features, tipo: generic.tipo })
        .eq('id', existing.id)

      if (updateError) throw updateError
      updated += 1
      continue
    }

    const { error: insertError } = await supabase.from('global_treatments').insert(payload)
    if (insertError) throw insertError
    created += 1
  }

  console.log(`Tratamentos genéricos criados: ${created}`)
  console.log(`Tratamentos genéricos atualizados: ${updated}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
