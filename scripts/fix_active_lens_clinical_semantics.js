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
  auth: { autoRefreshToken: false, persistSession: false },
})

const args = process.argv.slice(2)
const storeId = Number(args.find((arg) => arg.startsWith('--store='))?.split('=')[1] || '1')
const commit = args.includes('--commit')
const pageSize = 1000
const chunkSize = 150

const deterministicFamilyCategories = new Map([
  // HOYA
  ['hoya::Amplitude', 'multifocal'],
  ['hoya::ARGOS', 'multifocal'],
  ['hoya::EnRoute Progressiva', 'multifocal'],
  ['hoya::EnRoute Visao Simples', 'visao_simples'],
  ['hoya::HILUX Esfericas Surfacadas', 'visao_simples'],
  ['hoya::HILUX Prontas Esfericas', 'visao_simples'],
  ['hoya::Hoyalux Balansis', 'multifocal'],
  ['hoya::Hoyalux Daynamic', 'multifocal'],
  ['hoya::Hoyalux iD LifeStyle 4', 'multifocal'],
  ['hoya::Hoyalux iD LifeStyle 4i', 'multifocal'],
  ['hoya::Hoyalux iD MySelf', 'multifocal'],
  ['hoya::Hoyalux iD MyStyle V+', 'multifocal'],
  ['hoya::Hoyalux Sportive Progressiva', 'multifocal'],
  ['hoya::MiYOSMART', 'controle_miopia'],
  ['hoya::NULUX iDENTITY V+', 'visao_simples'],
  ['hoya::NULUX Prontas Asfericas EYAS 2.0', 'visao_simples'],
  ['hoya::NULUX TrueForm', 'visao_simples'],
  ['hoya::Pentax', 'visao_simples'],
  ['hoya::Sportive Visao Simples', 'visao_simples'],
  ['hoya::SYNC III', 'visao_simples'],
  ['hoya::WorkSmart Room', 'ocupacional'],
  ['hoya::WorkStyle 3', 'ocupacional'],

  // Essilor
  ['essilor::VS Essilor Surfaçada', 'visao_simples'],

  // Gamalab
  ['gamalab::Easy M', 'multifocal'],
  ['gamalab::Hoyalux Amplus', 'multifocal'],
  ['gamalab::Hoyalux Argos', 'multifocal'],
  ['gamalab::Lentes Prontas Lumina', 'visao_simples'],
  ['gamalab::Solamax Digital', 'multifocal'],
])

async function fetchAll(queryFactory) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1)
    if (error) throw error

    const page = data || []
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

function chunkValues(values, size = chunkSize) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function fetchIn(table, columns, field, values) {
  if (!values.length) return []

  const rows = []
  for (const chunk of chunkValues(values)) {
    rows.push(
      ...(await fetchAll(() =>
        supabase
          .from(table)
          .select(columns)
          .in(field, chunk),
      )),
    )
  }
  return rows
}

async function main() {
  const activations = await fetchAll(() =>
    supabase
      .from('tenant_catalog_activations')
      .select('id,global_version_id')
      .eq('store_id', storeId)
      .eq('status', 'active'),
  )

  const versionIds = [...new Set(activations.map((activation) => activation.global_version_id))]
  const versions = await fetchIn('global_catalog_versions', 'id,laboratorio,versao', 'id', versionIds)
  const versionById = new Map(versions.map((version) => [version.id, version]))
  const families = await fetchIn(
    'global_lens_families',
    'id,version_id,nome,clinical_category',
    'version_id',
    versionIds,
  )

  const familyPatches = []
  for (const family of families) {
    const version = versionById.get(family.version_id)
    const key = `${String(version?.laboratorio || '').toLowerCase()}::${family.nome}`
    const wantedCategory = deterministicFamilyCategories.get(key)
    if (wantedCategory && family.clinical_category !== wantedCategory) {
      familyPatches.push({ id: family.id, nome: family.nome, from: family.clinical_category, to: wantedCategory })
      family.clinical_category = wantedCategory
    }
  }

  const familyIds = families.map((family) => family.id)
  const offers = await fetchIn(
    'global_lens_offers',
    'id,family_id,clinical_category,canonical_label,raw_label',
    'family_id',
    familyIds,
  )
  const familyById = new Map(families.map((family) => [family.id, family]))

  const offerPatchesByCategory = new Map()
  for (const offer of offers) {
    const family = familyById.get(offer.family_id)
    if (!family) continue
    if (family.clinical_category === 'mista' || family.clinical_category === 'indefinida') continue
    if (offer.clinical_category === family.clinical_category) continue

    const rows = offerPatchesByCategory.get(family.clinical_category) || []
    rows.push(offer)
    offerPatchesByCategory.set(family.clinical_category, rows)
  }

  console.log(`DRY-RUN: ${commit ? 'NAO (COMMIT)' : 'SIM'}`)
  console.log(`Familias a corrigir: ${familyPatches.length}`)
  for (const patch of familyPatches) {
    console.log(`- ${patch.nome}: ${patch.from} -> ${patch.to}`)
  }
  console.log('Ofertas a alinhar por categoria:')
  for (const [category, rows] of offerPatchesByCategory.entries()) {
    console.log(`- ${category}: ${rows.length}`)
  }

  if (!commit) {
    console.log('\nRode com --commit para aplicar.')
    return
  }

  for (const patch of familyPatches) {
    const { error } = await supabase
      .from('global_lens_families')
      .update({ clinical_category: patch.to })
      .eq('id', patch.id)
    if (error) throw error
  }

  for (const [category, rows] of offerPatchesByCategory.entries()) {
    for (const chunk of chunkValues(rows.map((row) => row.id), 500)) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({ clinical_category: category })
        .in('id', chunk)
      if (error) throw error
    }
  }

  console.log('\n[COMMIT] Semantica clinica corrigida.')
}

main().catch((error) => {
  console.error('Falha ao corrigir semantica clinica:', error.message || error)
  process.exit(1)
})
