import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const commit = process.argv.includes('--commit')
const PLAN_PATH = path.join(process.cwd(), 'tmp', 'vision_haytek_grade_alignment_plan.json')
const SAFE_CONFIDENCE = new Set(['alta_nome_direto', 'confirmado_import_antigo', 'confirmado_logista'])

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isPhoto(offer) {
  const f = offer.features && typeof offer.features === 'object' ? offer.features : {}
  const text = normalize(`${offer.canonical_label} ${offer.raw_label}`)
  return Boolean(f.foto || f.fotossensivel || f.transitions || text.includes('fotossensivel') || text.includes('transitions'))
}

function indexKey(value) {
  if (value == null) return 'null'
  return Number(value).toFixed(2)
}

function gridKeyForOffer(offer) {
  return `${indexKey(offer.indice_refracao)}|photo=${isPhoto(offer)}`
}

function gridSignature(grid) {
  return [grid.sph_min, grid.sph_max, grid.cyl_min, grid.cyl_max, grid.add_min, grid.add_max]
    .map((value) => (value == null ? '' : String(Number(value))))
    .join('|')
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

async function main() {
  if (!fs.existsSync(PLAN_PATH)) {
    throw new Error('Plano nao encontrado. Rode scripts/plan_vision_haytek_grade_alignment.js primeiro.')
  }

  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'))
  const safeRows = plan.rows.filter(
    (row) =>
      row.proposed_action === 'copiar_grade_haytek_por_indice_e_foto' &&
      SAFE_CONFIDENCE.has(row.confidence),
  )
  const visionOfferIds = safeRows.map((row) => row.vision_offer_id)
  const haytekFamilies = [...new Set(safeRows.map((row) => row.haytek_family))]

  const [families, offers, grids] = await Promise.all([
    fetchAll('global_lens_families', 'id,version_id,nome'),
    fetchAll('global_lens_offers', 'id,family_id,canonical_label,raw_label,indice_refracao,features'),
    fetchAll('global_offer_diopter_grids', 'id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata'),
  ])

  const familyById = new Map(families.map((family) => [family.id, family]))
  const haytekFamilyIds = new Set(
    families
      .filter((family) => haytekFamilies.some((name) => normalize(name) === normalize(family.nome)))
      .map((family) => family.id),
  )

  const offerById = new Map(offers.map((offer) => [offer.id, offer]))
  const gridsByOfferId = new Map()
  for (const grid of grids) {
    const rows = gridsByOfferId.get(grid.offer_id) || []
    rows.push(grid)
    gridsByOfferId.set(grid.offer_id, rows)
  }

  const haytekCandidatesByFamilyAndKey = new Map()
  for (const offer of offers) {
    if (!haytekFamilyIds.has(offer.family_id)) continue
    const family = familyById.get(offer.family_id)
    const offerGrids = gridsByOfferId.get(offer.id) || []
    if (!offerGrids.length) continue
    const key = `${normalize(family.nome)}|${gridKeyForOffer(offer)}`
    const rows = haytekCandidatesByFamilyAndKey.get(key) || []
    rows.push({ offer, grids: offerGrids })
    haytekCandidatesByFamilyAndKey.set(key, rows)
  }

  const inserts = []
  const skipped = []

  for (const row of safeRows) {
    const visionOffer = offerById.get(row.vision_offer_id)
    if (!visionOffer) {
      skipped.push({ reason: 'vision_offer_missing', row })
      continue
    }
    if ((gridsByOfferId.get(visionOffer.id) || []).length) {
      skipped.push({ reason: 'vision_grid_already_exists', row })
      continue
    }

    const candidateKey = `${normalize(row.haytek_family)}|${row.key}`
    const candidates = haytekCandidatesByFamilyAndKey.get(candidateKey) || []
    const signatures = new Set(candidates.flatMap((candidate) => candidate.grids.map(gridSignature)))
    if (!candidates.length || signatures.size !== candidates[0].grids.length) {
      skipped.push({ reason: 'ambiguous_or_missing_haytek_grid', row, candidates: candidates.length, signatures: signatures.size })
      continue
    }

    for (const grid of candidates[0].grids) {
      inserts.push({
        offer_id: visionOffer.id,
        sph_min: grid.sph_min,
        sph_max: grid.sph_max,
        cyl_min: grid.cyl_min,
        cyl_max: grid.cyl_max,
        add_min: grid.add_min,
        add_max: grid.add_max,
        metadata: {
          ...(grid.metadata || {}),
          copied_from_offer_id: candidates[0].offer.id,
          copied_from_offer_label: candidates[0].offer.canonical_label || candidates[0].offer.raw_label,
          copied_from_family: row.haytek_family,
          semantic_source: 'Vision x Haytek grade alignment',
          confidence: row.confidence,
        },
      })
    }
  }

  console.log('Resumo:')
  console.log('- Linhas seguras no plano:', safeRows.length)
  console.log('- Grades a inserir:', inserts.length)
  console.log('- Puladas:', skipped.length)
  console.log('- Commit:', commit ? 'sim' : 'nao')

  for (const item of inserts.slice(0, 30)) {
    const offer = offerById.get(item.offer_id)
    console.log('[insert]', offer?.canonical_label, `sph=[${item.sph_min},${item.sph_max}] cyl=[${item.cyl_min},${item.cyl_max}] add=[${item.add_min},${item.add_max}]`)
  }
  if (inserts.length > 30) console.log(`... ${inserts.length - 30} inserts omitidos no preview`)

  if (skipped.length) {
    console.log('Puladas por motivo:')
    const byReason = skipped.reduce((acc, item) => {
      acc[item.reason] = (acc[item.reason] || 0) + 1
      return acc
    }, {})
    console.log(JSON.stringify(byReason, null, 2))
  }

  if (!commit) {
    console.log('Modo seco. Use --commit para aplicar.')
    return
  }

  if (inserts.length) {
    const { error } = await supabase.from('global_offer_diopter_grids').insert(inserts)
    if (error) throw error
  }

  console.log('Aplicado.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
