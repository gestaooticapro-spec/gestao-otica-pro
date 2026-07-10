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
const TARGET_PAGES = new Set(['Pagina 20', 'Pagina 21'])

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

async function main() {
  const families = await fetchAll(
    'global_lens_families',
    'id,nome',
    (query) => query.eq('version_id', VERSION_ID),
  )
  const familyById = new Map(families.map((family) => [family.id, family]))
  const familyIds = families.map((family) => family.id)

  const offers = await fetchAll(
    'global_lens_offers',
    'id,family_id,canonical_label,raw_label,source_page_reference,features',
    (query) => query.in('family_id', familyIds).in('source_page_reference', [...TARGET_PAGES]),
  )
  const offerIds = offers.map((offer) => offer.id)
  const grids = offerIds.length
    ? await fetchAll('global_offer_diopter_grids', 'offer_id', (query) => query.in('offer_id', offerIds))
    : []
  const offerIdsWithGrid = new Set(grids.map((grid) => grid.offer_id))

  const updates = []
  for (const offer of offers) {
    if (offerIdsWithGrid.has(offer.id)) continue
    if (hasMarker(offer)) continue

    const family = familyById.get(offer.family_id)
    const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
    updates.push({
      id: offer.id,
      label: offer.canonical_label || offer.raw_label,
      family: family?.nome || '?',
      page: offer.source_page_reference,
      features: {
        ...features,
        grade_nao_informada_na_fonte: true,
        grade_source_note:
          'Gamalab Marco 2026 p.20/p.21 informa precos por produto/tratamento, mas nao exibe faixa esferica/cilindrica/adicao/altura para essas linhas.',
      },
    })
  }

  for (const item of updates) {
    console.log('[mark:no-grid-source]', item.page, '|', item.family, '|', item.label)
  }

  console.log('Resumo:')
  console.log('- Ofertas Gamalab p.20/p.21 analisadas:', offers.length)
  console.log('- Ofertas com grade ja existente:', offerIdsWithGrid.size)
  console.log('- Ofertas a marcar como fonte sem grade:', updates.length)

  if (!commit) {
    console.log('Modo seco. Use --commit para aplicar.')
    return
  }

  for (const item of updates) {
    const { error } = await supabase
      .from('global_lens_offers')
      .update({ features: item.features })
      .eq('id', item.id)
    if (error) throw error
  }

  console.log('Aplicado.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
