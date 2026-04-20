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
const versionId = args.find((arg) => arg.startsWith('--version-id='))?.split('=')[1]

if (!versionId) {
  console.error('Uso: node scripts/audit_hoya_sanity.js --version-id=UUID')
  process.exit(1)
}

function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

async function fetchAll(query, pageSize = 1000) {
  let from = 0
  let all = []
  for (;;) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) throw error
    const rows = data || []
    all = all.concat(rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

async function main() {
  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
  if (famErr) throw famErr

  const familyIds = (families || []).map((f) => f.id)
  const familyById = new Map((families || []).map((f) => [f.id, f.nome]))

  const anomalies = {
    offersWithoutGrid: 0,
    gridsSphInverted: 0,
    gridsCylInverted: 0,
    gridsAddInverted: 0,
    gridsPartialAdd: 0,
    gridsPartialCyl: 0,
    offersMissingPageRef: 0,
    offersBadMinFittingHeightType: 0,
  }

  const pageBuckets = new Map() // page_ref -> { offers, offersWithoutGrid, gridsSphInv, gridsCylInv, gridsAddInv }
  const sample = {
    offersWithoutGrid: [],
    gridsInverted: [],
    missingPageRef: [],
  }

  let offersTotal = 0
  let gridsTotal = 0

  for (const familyId of familyIds) {
    const offers = await fetchAll(
      supabase
        .from('global_lens_offers')
        .select('id,canonical_label,raw_label,features,source_page_reference')
        .eq('family_id', familyId),
      1000
    )

    offersTotal += offers.length

    const offerIds = offers.map((o) => o.id)
    const gridsByOfferId = new Map()

    for (const offerIdChunk of chunkArray(offerIds, 200)) {
      const grids = await fetchAll(
        supabase
          .from('global_offer_diopter_grids')
          .select('id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max')
          .in('offer_id', offerIdChunk),
        1000
      )

      gridsTotal += grids.length

      for (const g of grids) {
        const list = gridsByOfferId.get(g.offer_id) || []
        list.push(g)
        gridsByOfferId.set(g.offer_id, list)
      }
    }

    for (const o of offers) {
      const pageRef = o.source_page_reference || null
      const bucketKey = pageRef || '(sem_pagina)'
      if (!pageBuckets.has(bucketKey)) {
        pageBuckets.set(bucketKey, {
          offers: 0,
          offersWithoutGrid: 0,
          gridsSphInverted: 0,
          gridsCylInverted: 0,
          gridsAddInverted: 0,
        })
      }
      const bucket = pageBuckets.get(bucketKey)
      bucket.offers += 1

      if (!pageRef) {
        anomalies.offersMissingPageRef += 1
        if (sample.missingPageRef.length < 15) {
          sample.missingPageRef.push({
            offer_id: o.id,
            label: o.canonical_label || o.raw_label,
            family: familyById.get(familyId) || familyId,
          })
        }
      }

      const mfh = o.features?.min_fitting_height
      if (mfh != null && !isNum(mfh)) {
        anomalies.offersBadMinFittingHeightType += 1
      }

      const grids = gridsByOfferId.get(o.id) || []
      if (grids.length === 0) {
        anomalies.offersWithoutGrid += 1
        bucket.offersWithoutGrid += 1
        if (sample.offersWithoutGrid.length < 15) {
          sample.offersWithoutGrid.push({
            offer_id: o.id,
            label: o.canonical_label || o.raw_label,
            family: familyById.get(familyId) || familyId,
            page: pageRef,
          })
        }
        continue
      }

      for (const g of grids) {
        const sphMin = g.sph_min != null ? Number(g.sph_min) : null
        const sphMax = g.sph_max != null ? Number(g.sph_max) : null
        const cylMin = g.cyl_min != null ? Number(g.cyl_min) : null
        const cylMax = g.cyl_max != null ? Number(g.cyl_max) : null
        const addMin = g.add_min != null ? Number(g.add_min) : null
        const addMax = g.add_max != null ? Number(g.add_max) : null

        if (sphMin != null && sphMax != null && sphMin > sphMax) {
          anomalies.gridsSphInverted += 1
          bucket.gridsSphInverted += 1
          if (sample.gridsInverted.length < 20) {
            sample.gridsInverted.push({
              grid_id: g.id,
              offer_id: o.id,
              label: o.canonical_label || o.raw_label,
              family: familyById.get(familyId) || familyId,
              page: pageRef,
              problem: `sph_inverted (${sphMin} > ${sphMax})`,
            })
          }
        }

        if ((cylMin == null) !== (cylMax == null)) anomalies.gridsPartialCyl += 1
        if ((addMin == null) !== (addMax == null)) anomalies.gridsPartialAdd += 1

        if (cylMin != null && cylMax != null && cylMin > cylMax) {
          anomalies.gridsCylInverted += 1
          bucket.gridsCylInverted += 1
          if (sample.gridsInverted.length < 20) {
            sample.gridsInverted.push({
              grid_id: g.id,
              offer_id: o.id,
              label: o.canonical_label || o.raw_label,
              family: familyById.get(familyId) || familyId,
              page: pageRef,
              problem: `cyl_inverted (${cylMin} > ${cylMax})`,
            })
          }
        }

        if (addMin != null && addMax != null && addMin > addMax) {
          anomalies.gridsAddInverted += 1
          bucket.gridsAddInverted += 1
          if (sample.gridsInverted.length < 20) {
            sample.gridsInverted.push({
              grid_id: g.id,
              offer_id: o.id,
              label: o.canonical_label || o.raw_label,
              family: familyById.get(familyId) || familyId,
              page: pageRef,
              problem: `add_inverted (${addMin} > ${addMax})`,
            })
          }
        }
      }
    }
  }

  const topPages = [...pageBuckets.entries()]
    .map(([page, b]) => ({ page, ...b }))
    .sort((a, b) => {
      const pa = a.offersWithoutGrid + a.gridsSphInverted + a.gridsCylInverted + a.gridsAddInverted
      const pb = b.offersWithoutGrid + b.gridsSphInverted + b.gridsCylInverted + b.gridsAddInverted
      return pb - pa
    })
    .slice(0, 15)

  console.log('AUDIT_HOYA_SANITY')
  console.log(
    JSON.stringify(
      {
        summary: {
          versionId,
          families: familyIds.length,
          offers: offersTotal,
          grids: gridsTotal,
          anomalies,
        },
        topPages,
        sample,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error('Erro audit hoya sanity:', err)
  process.exit(1)
})

