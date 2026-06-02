import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const VISION_VERSION_ID = 'f6f01d3d-eba4-476c-a0e1-a481fac7d338'
const HAYTEK_VERSION_ID = '4588be79-8d45-4e61-b39f-47f2e401f331'

const MAPPING_CANDIDATES = [
  { vision: 'Vision Drive', haytek: 'Haytek Drive', confidence: 'alta_nome_direto' },
  { vision: 'Vision Office', haytek: 'Haytek Office', confidence: 'alta_nome_direto' },
  { vision: 'Vision Plus 4K Premium', haytek: 'Haytek Pro ID', confidence: 'confirmado_logista' },
  { vision: 'Vision Plus 4K', haytek: 'Haytek Top', confidence: 'confirmado_logista' },
  { vision: 'Vision Plus Individual', haytek: 'Haytek Smart', confidence: 'confirmado_logista' },
  { vision: 'Vision Plus Pro', haytek: 'Haytek Light', confidence: 'confirmado_logista' },
  { vision: 'Vision Plus HD', haytek: 'Haytek Go!', confidence: 'confirmado_logista' },
]

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
  const [families, offers, grids] = await Promise.all([
    fetchAll('global_lens_families', 'id,version_id,nome,clinical_category'),
    fetchAll('global_lens_offers', 'id,family_id,canonical_label,raw_label,indice_refracao,clinical_category,features'),
    fetchAll('global_offer_diopter_grids', 'id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata'),
  ])

  const familyByNameAndVersion = new Map(
    families.map((family) => [`${family.version_id}|${normalize(family.nome)}`, family]),
  )
  const offersByFamilyId = new Map()
  for (const offer of offers) {
    const rows = offersByFamilyId.get(offer.family_id) || []
    rows.push(offer)
    offersByFamilyId.set(offer.family_id, rows)
  }

  const gridsByOfferId = new Map()
  for (const grid of grids) {
    const rows = gridsByOfferId.get(grid.offer_id) || []
    rows.push(grid)
    gridsByOfferId.set(grid.offer_id, rows)
  }

  const rows = []

  for (const mapping of MAPPING_CANDIDATES) {
    const visionFamily = familyByNameAndVersion.get(`${VISION_VERSION_ID}|${normalize(mapping.vision)}`)
    const haytekFamily = familyByNameAndVersion.get(`${HAYTEK_VERSION_ID}|${normalize(mapping.haytek)}`)

    if (!visionFamily || !haytekFamily) {
      rows.push({ ...mapping, status: 'familia_nao_encontrada' })
      continue
    }

    const visionOffers = offersByFamilyId.get(visionFamily.id) || []
    const haytekOffers = offersByFamilyId.get(haytekFamily.id) || []
    const haytekGridByKey = new Map()

    for (const offer of haytekOffers) {
      const offerGrids = gridsByOfferId.get(offer.id) || []
      if (!offerGrids.length) continue
      const key = gridKeyForOffer(offer)
      const existing = haytekGridByKey.get(key) || []
      existing.push({ offer, grids: offerGrids })
      haytekGridByKey.set(key, existing)
    }

    for (const offer of visionOffers) {
      const existingVisionGrids = gridsByOfferId.get(offer.id) || []
      const key = gridKeyForOffer(offer)
      const haytekCandidates = haytekGridByKey.get(key) || []
      const signatures = new Set(haytekCandidates.flatMap((candidate) => candidate.grids.map(gridSignature)))
      const canCopy =
        !existingVisionGrids.length &&
        haytekCandidates.length > 0 &&
        signatures.size === haytekCandidates[0].grids.length

      rows.push({
        vision_family: mapping.vision,
        haytek_family: mapping.haytek,
        confidence: mapping.confidence,
        vision_offer_id: offer.id,
        vision_offer: offer.canonical_label || offer.raw_label,
        key,
        has_vision_grid: existingVisionGrids.length > 0,
        haytek_candidates: haytekCandidates.length,
        haytek_grid_signatures: signatures.size,
        proposed_action: existingVisionGrids.length
          ? 'preservar_grade_existente'
          : canCopy
            ? 'copiar_grade_haytek_por_indice_e_foto'
            : 'precisa_revisao_manual',
        sample_haytek_offer: haytekCandidates[0]?.offer?.canonical_label || null,
        sample_grid: haytekCandidates[0]?.grids?.[0]
          ? {
              sph_min: haytekCandidates[0].grids[0].sph_min,
              sph_max: haytekCandidates[0].grids[0].sph_max,
              cyl_min: haytekCandidates[0].grids[0].cyl_min,
              cyl_max: haytekCandidates[0].grids[0].cyl_max,
              add_min: haytekCandidates[0].grids[0].add_min,
              add_max: haytekCandidates[0].grids[0].add_max,
            }
          : null,
      })
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    mappings: MAPPING_CANDIDATES.length,
    rows: rows.length,
    by_action: rows.reduce((acc, row) => {
      const key = row.proposed_action || row.status || 'unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {}),
    by_family: rows.reduce((acc, row) => {
      const key = `${row.vision_family || row.vision} -> ${row.haytek_family || row.haytek}`
      const bucket = acc[key] || { total: 0, actions: {} }
      bucket.total += 1
      const action = row.proposed_action || row.status || 'unknown'
      bucket.actions[action] = (bucket.actions[action] || 0) + 1
      acc[key] = bucket
      return acc
    }, {}),
  }

  fs.writeFileSync(path.join('tmp', 'vision_haytek_grade_alignment_plan.json'), JSON.stringify({ summary, rows }, null, 2))
  fs.writeFileSync(
    path.join('tmp', 'vision_haytek_grade_alignment_plan.md'),
    [
      '# Plano Vision x Haytek - Grades',
      '',
      `Gerado em: ${summary.generated_at}`,
      '',
      '## Resumo',
      '',
      `- Linhas analisadas: ${summary.rows}`,
      ...Object.entries(summary.by_action).map(([key, count]) => `- ${key}: ${count}`),
      '',
      '## Por Familia',
      '',
      ...Object.entries(summary.by_family).map(([key, bucket]) => {
        const actions = Object.entries(bucket.actions)
          .map(([action, count]) => `${action}: ${count}`)
          .join(', ')
        return `- ${key}: ${bucket.total} ofertas (${actions})`
      }),
      '',
      '## Pendencias Manuais',
      '',
      ...rows
        .filter((row) => row.proposed_action === 'precisa_revisao_manual')
        .slice(0, 120)
        .map((row) => `- ${row.vision_family} | ${row.vision_offer} | ${row.key} | candidato Haytek: ${row.sample_haytek_offer || 'nenhum'}`),
    ].join('\n'),
  )

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
