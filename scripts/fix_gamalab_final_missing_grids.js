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

const commit = process.argv.includes('--commit')
const VERSION_ID = 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'

const LUMINA_GRIDS = [
  {
    offer_id: 'cfbb4385-d69c-421a-a604-21092ccc770b',
    expected_label: 'Lentes Prontas Lumina 1.70 Em Breve',
    sph_min: -12,
    sph_max: 0,
    cyl_min: -4,
    cyl_max: 0,
    raw_grade: '0.00 a -12.00 cil -4.00',
  },
  {
    offer_id: '85b4838f-63e9-49a9-9217-d3d0be0c0477',
    expected_label: 'Lentes Prontas Lumina 1.70 Cilindrico Estendido Em Breve',
    sph_min: -20,
    sph_max: -12.5,
    cyl_min: -2,
    cyl_max: 0,
    raw_grade: '-12.50 a -20.00 cil -2.00',
  },
]

const NO_GRID_SOURCE_NOTE_BY_PAGE = {
  'Pagina 24':
    'Gamalab Marco 2026 p.24: bloco Gama HD Acabadas informa disponibilidade/codigo e preco, mas nao exibe faixa esferica/cilindrica.',
  'Pagina 25':
    'Gamalab Marco 2026 p.25: bloco Solares informa cores/curvas/disponibilidade/codigo e preco, mas nao exibe faixa esferica/cilindrica.',
}

async function fetchAll(table, columns, buildQuery = (query) => query) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await buildQuery(
      supabase.from(table).select(columns).range(from, from + 999),
    )
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  return rows
}

function hasMarker(offer) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  return features.grade_nao_informada_na_fonte === true
}

function markNoGridFeatures(offer) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  return {
    ...features,
    grade_nao_informada_na_fonte: true,
    grade_source_note: NO_GRID_SOURCE_NOTE_BY_PAGE[offer.source_page_reference],
  }
}

function markEmBreveFeatures(offer) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  return {
    ...features,
    em_breve: true,
    pronta_entrega: false,
    disponibilidade_status: 'em_breve',
    availability_note: 'Fonte Gamalab p.22 marca esta oferta como EM BREVE.',
  }
}

async function main() {
  const families = await fetchAll(
    'global_lens_families',
    'id,nome',
    (query) => query.eq('version_id', VERSION_ID),
  )
  const familyIds = families.map((family) => family.id)
  const familyById = new Map(families.map((family) => [family.id, family]))

  const offers = await fetchAll(
    'global_lens_offers',
    'id,family_id,canonical_label,raw_label,source_page_reference,features',
    (query) => query.in('family_id', familyIds).in('source_page_reference', ['Pagina 22', 'Pagina 24', 'Pagina 25']),
  )
  const offerById = new Map(offers.map((offer) => [offer.id, offer]))
  const offerIds = offers.map((offer) => offer.id)
  const grids = offerIds.length
    ? await fetchAll('global_offer_diopter_grids', 'offer_id', (query) => query.in('offer_id', offerIds))
    : []
  const offerIdsWithGrid = new Set(grids.map((grid) => grid.offer_id))

  const gridInserts = []
  const emBreveFeatureUpdates = []
  const noGridUpdates = []
  const errors = []

  for (const grid of LUMINA_GRIDS) {
    const offer = offerById.get(grid.offer_id)
    if (!offer) {
      errors.push(`Oferta Lumina nao encontrada: ${grid.offer_id}`)
      continue
    }
    if (!offerIdsWithGrid.has(offer.id)) {
      gridInserts.push({
        offer_id: offer.id,
        sph_min: grid.sph_min,
        sph_max: grid.sph_max,
        cyl_min: grid.cyl_min,
        cyl_max: grid.cyl_max,
        add_min: null,
        add_max: null,
        metadata: {
          raw_grade: grid.raw_grade,
          source: '.tabelas/gamalab_pvc_imgs/Gamalab_TabelaPrecos2025_02Mar2026_page-0022.jpg',
          source_kind: 'gamalab_finished_lens_availability',
          notes: ['em_breve'],
        },
      })
    }

    const desiredFeatures = markEmBreveFeatures(offer)
    if (JSON.stringify(desiredFeatures) !== JSON.stringify(offer.features || {})) {
      emBreveFeatureUpdates.push({ id: offer.id, label: offer.canonical_label || offer.raw_label, features: desiredFeatures })
    }
  }

  for (const offer of offers) {
    if (!NO_GRID_SOURCE_NOTE_BY_PAGE[offer.source_page_reference]) continue
    if (offerIdsWithGrid.has(offer.id)) continue
    if (hasMarker(offer)) continue
    noGridUpdates.push({
      id: offer.id,
      page: offer.source_page_reference,
      family: familyById.get(offer.family_id)?.nome || '?',
      label: offer.canonical_label || offer.raw_label,
      features: markNoGridFeatures(offer),
    })
  }

  for (const item of gridInserts) {
    const offer = offerById.get(item.offer_id)
    console.log('[insert:grid]', offer?.source_page_reference, '|', offer?.canonical_label || offer?.raw_label)
    console.log(`  sph=[${item.sph_min}, ${item.sph_max}] cyl=[${item.cyl_min}, ${item.cyl_max}] raw="${item.metadata.raw_grade}"`)
  }
  for (const item of emBreveFeatureUpdates) {
    console.log('[update:em-breve]', item.label)
  }
  for (const item of noGridUpdates) {
    console.log('[mark:no-grid-source]', item.page, '|', item.family, '|', item.label)
  }

  console.log('Resumo:')
  console.log('- Grades Lumina a inserir:', gridInserts.length)
  console.log('- Ofertas Lumina Em Breve a ajustar:', emBreveFeatureUpdates.length)
  console.log('- Ofertas p.24/p.25 a marcar como fonte sem grade:', noGridUpdates.length)
  console.log('- Erros:', errors.length)

  if (errors.length) {
    for (const error of errors) console.error(error)
    process.exit(1)
  }

  if (!commit) {
    console.log('Modo seco. Use --commit para aplicar.')
    return
  }

  if (gridInserts.length) {
    const { error } = await supabase.from('global_offer_diopter_grids').insert(gridInserts)
    if (error) throw error
  }
  for (const item of emBreveFeatureUpdates) {
    const { error } = await supabase.from('global_lens_offers').update({ features: item.features }).eq('id', item.id)
    if (error) throw error
  }
  for (const item of noGridUpdates) {
    const { error } = await supabase.from('global_lens_offers').update({ features: item.features }).eq('id', item.id)
    if (error) throw error
  }

  console.log('Aplicado.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
