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

const ESSILOR_GRID_INSERTS = [
  {
    id: 'ecb643d3-d946-4607-a8c2-cb8e00890d99',
    sph_min: -20,
    sph_max: 14,
    cyl_min: 0,
    cyl_max: -8,
    raw_grade: '-20.00 / +14.00 / -8.00',
    source: 'Essilor PVC/PVO Abril 2026 p.12, VS Surfacadas, Stylis 1.74',
  },
  {
    id: '6da9bf2f-43f4-424b-8f30-cd0d1e8a978a',
    sph_min: -14,
    sph_max: 10,
    cyl_min: 0,
    cyl_max: -8,
    raw_grade: '-14.00 / +10.00 / -8.00',
    source: 'Essilor PVC/PVO Abril 2026 p.12, VS Surfacadas, Stylis 1.67',
  },
  {
    id: '926fc5fc-7874-4e95-94ab-f4748c455955',
    sph_min: -12,
    sph_max: 9.25,
    cyl_min: 0,
    cyl_max: -6,
    raw_grade: '-12.00 / +9.25 / -6.00',
    source: 'Essilor PVC/PVO Abril 2026 p.12, VS Surfacadas, Airwear',
  },
  {
    id: 'd56bbb50-90bf-4622-869a-d294bf9e4ee9',
    sph_min: -12,
    sph_max: 9.25,
    cyl_min: 0,
    cyl_max: -6,
    raw_grade: '-12.00 / +9.25 / -6.00',
    source: 'Essilor PVC/PVO Abril 2026 p.12, VS Surfacadas, Airwear',
  },
  {
    id: '9476038c-76d5-4b35-9ff6-874597531ed7',
    sph_min: -10,
    sph_max: 6.5,
    cyl_min: 0,
    cyl_max: -6,
    raw_grade: '-10.00 / +6.50 / -6.00',
    source: 'Essilor PVC/PVO Abril 2026 p.12, VS Surfacadas, Orma + Blue UV',
  },
]

const OPTILAB_NO_GRID_MARKERS = [
  '40fcf9fe-c86b-4fc0-8dd3-ed04f9dec9c4',
  '04000cc8-1b44-4b52-bbd1-114899cc8fc0',
  '4d7fdfc6-1dbc-4e40-a6f6-1e3a1e7f9c6d',
  'fd2d15a1-3b9c-4dcd-b1b2-ee1e610ee9a5',
]

async function main() {
  const targetIds = [...ESSILOR_GRID_INSERTS.map((item) => item.id), ...OPTILAB_NO_GRID_MARKERS]
  const { data: offers, error: offerErr } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,raw_label,features')
    .in('id', targetIds)
  if (offerErr) throw offerErr

  const offerById = new Map((offers || []).map((offer) => [offer.id, offer]))

  const { data: existingGrids, error: gridErr } = await supabase
    .from('global_offer_diopter_grids')
    .select('id,offer_id')
    .in('offer_id', targetIds)
  if (gridErr) throw gridErr

  const gridOfferIds = new Set((existingGrids || []).map((grid) => grid.offer_id))
  const gridInserts = []
  const featureUpdates = []

  for (const item of ESSILOR_GRID_INSERTS) {
    const offer = offerById.get(item.id)
    if (!offer) {
      console.log('[skip:missing-offer]', item.id)
      continue
    }
    if (gridOfferIds.has(item.id)) {
      console.log('[skip:has-grid]', offer.canonical_label || offer.raw_label)
      continue
    }

    console.log('[grid:insert]', offer.canonical_label || offer.raw_label, item.raw_grade)
    gridInserts.push({
      offer_id: item.id,
      sph_min: item.sph_min,
      sph_max: item.sph_max,
      cyl_min: item.cyl_min,
      cyl_max: item.cyl_max,
      add_min: null,
      add_max: null,
      metadata: {
        raw_grade: item.raw_grade,
        source_evidence: item.source,
        review_note: 'Inserido em revisao de grades; fonte local confirma faixa na pagina 12.',
      },
    })
  }

  for (const id of OPTILAB_NO_GRID_MARKERS) {
    const offer = offerById.get(id)
    if (!offer) {
      console.log('[skip:missing-offer]', id)
      continue
    }

    const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
    const nextFeatures = {
      ...features,
      grade_nao_informada_na_fonte: true,
      grade_source_note:
        'Optilab PVC Digital v2 p.43 lista cores/codigos/preco para solares planas acabadas, mas nao informa faixa esferica/cilindrica.',
    }
    const changed =
      features.grade_nao_informada_na_fonte !== nextFeatures.grade_nao_informada_na_fonte ||
      features.grade_source_note !== nextFeatures.grade_source_note

    if (!changed) {
      console.log('[skip:marker-ok]', offer.canonical_label || offer.raw_label)
      continue
    }

    console.log('[features:mark-no-grid-source]', offer.canonical_label || offer.raw_label)
    featureUpdates.push({ id, features: nextFeatures })
  }

  console.log('Resumo:')
  console.log('- Grades Essilor a inserir:', gridInserts.length)
  console.log('- Ofertas Optilab a marcar sem grade na fonte:', featureUpdates.length)

  if (!commit) {
    console.log('Modo seco. Use --commit para aplicar.')
    return
  }

  if (gridInserts.length) {
    const { error } = await supabase.from('global_offer_diopter_grids').insert(gridInserts)
    if (error) throw error
  }

  for (const update of featureUpdates) {
    const { error } = await supabase
      .from('global_lens_offers')
      .update({ features: update.features })
      .eq('id', update.id)
    if (error) throw error
  }

  console.log('Aplicado.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
