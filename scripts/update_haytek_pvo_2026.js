import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const COMMIT = process.argv.includes('--commit')
const SOURCE_VERSION_ID = '4588be79-8d45-4e61-b39f-47f2e401f331'
const TARGET_VERSION = 'Haytek PVO Julho 2026'
const CSV_PATH = path.join(process.cwd(), '.tabelas', 'haytek tabela PVO 07-26.csv')
const LEGACY_TRANSITIONS_FAMILY = 'Haytek VS Freeform'
const TINGIVEL = 'Antirrisco Tingível'
const PAGE_SIZE = 1000

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function parseCsvLine(line) {
  const values = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') quoted = !quoted
    else if (char === ';' && !quoted) {
      values.push(current)
      current = ''
    } else current += char
  }
  values.push(current)
  return values
}

function parseMoney(value) {
  if (!value) return null
  const parsed = Number(String(value).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null
}

function readOfficialRows() {
  const lines = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line)
    return {
      category: row[0],
      family: row[1],
      code: row[2],
      product: row[3],
      index: Number(row[4]),
      availability: row[5],
      prices: row.slice(6, 12).map(parseMoney),
    }
  })
}

function parseAvailability(value) {
  const text = String(value || '')
  const sph = text.match(/Esf\.\s*([+-]?\d+(?:\.\d+)?)\s*a\s*([+-]?\d+(?:\.\d+)?)/i)
  const cyl = text.match(/Cil\.[^\d-]*(-?\d+(?:\.\d+)?)/i)
  const add = text.match(/Add\.\s*([+-]?\d+(?:\.\d+)?)\s*a\s*([+-]?\d+(?:\.\d+)?)/i)
  if (!sph || !cyl) return null
  return {
    sph_min: Number(sph[2]),
    sph_max: Number(sph[1]),
    cyl_min: Number(cyl[1]),
    cyl_max: 0,
    add_min: add ? Number(add[1]) : null,
    add_max: add ? Number(add[2]) : null,
  }
}

function isSurfaced(row) {
  return normalize(row.category) === 'lentes surfacadas'
}

function csvVariant(row) {
  const product = normalize(row.product)
  if (product.includes('transitions')) return `transitions:${product.includes('marrom') ? 'marrom' : 'cinza'}`
  if (product.includes('filtro azul') && product.includes('fotossensivel')) return 'filtro azul foto haytek'
  if (product.includes('fotossensivel')) return 'foto haytek'
  if (product.includes('filtro azul')) return 'filtro azul'
  return 'incolor'
}

function isTransitionOffer(offer) {
  return Boolean(offer.features?.transitions)
}

function offerVariant(offer) {
  if (isTransitionOffer(offer)) return 'transitions'
  return normalize(offer.features?.embedded_variant)
}

function isCsvMatch(row, family, offer) {
  const directFamily = normalize(row.family) === normalize(family.nome)
  const legacyVsTransition =
    normalize(family.nome) === normalize(LEGACY_TRANSITIONS_FAMILY) &&
    normalize(row.family) === normalize('Haytek Visao Simples') &&
    csvVariant(row).startsWith('transitions:')
  if (!directFamily && !legacyVsTransition) return false
  if (Number(offer.indice_refracao) !== row.index) return false
  const variant = csvVariant(row)
  if (variant.startsWith('transitions:')) {
    const color = variant.split(':')[1]
    return isTransitionOffer(offer) && (offer.features?.photo_colors || []).some((item) => normalize(item) === color)
  }
  return offerVariant(offer) === variant
}

function featuresForOfficialRow(row, baseFeatures = {}) {
  const variant = csvVariant(row)
  const transitions = variant.startsWith('transitions:')
  const photo = transitions || variant.includes('foto haytek')
  const blue = variant.includes('filtro azul')
  return {
    ...baseFeatures,
    embedded_variant: transitions ? 'Transitions Gen S' : variant === 'incolor' ? 'Incolor' : variant,
    blue_uv: blue,
    foto: photo,
    fotossensivel: photo,
    transitions,
    photo_colors: transitions ? [variant.split(':')[1][0].toUpperCase() + variant.split(':')[1].slice(1)] : undefined,
    source_product_code: row.code,
    source_product_name: row.product,
    source_kind: 'official_haytek_pvo_csv_2026_07',
  }
}

function buildGrid(row, priorMetadata = {}) {
  const range = parseAvailability(row.availability)
  if (!range) throw new Error(`Grade nao identificada no CSV: ${row.code} | ${row.availability}`)
  return {
    ...range,
    metadata: {
      ...priorMetadata,
      source_kind: 'official_haytek_pvo_csv_2026_07',
      source_file: '.tabelas/haytek tabela PVO 07-26.csv',
      source_product_code: row.code,
      source_availability: row.availability,
      review_status: 'official_csv_confirmed',
    },
  }
}

function priceTimesSix(value) {
  if (value == null) return null
  return Number((value * 6).toFixed(2))
}

async function fetchAll(queryFactory) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < PAGE_SIZE) return rows
  }
}

async function insert(table, row) {
  const { data, error } = await supabase.from(table).insert(row).select().single()
  if (error) throw error
  return data
}

async function main() {
  const officialRows = readOfficialRows().filter(isSurfaced)
  if (officialRows.length !== 200) throw new Error(`Esperadas 200 lentes surfacadas; encontradas ${officialRows.length}.`)

  const { data: sourceVersion, error: sourceVersionError } = await supabase
    .from('global_catalog_versions')
    .select('*')
    .eq('id', SOURCE_VERSION_ID)
    .single()
  if (sourceVersionError || !sourceVersion) throw new Error('Versao Haytek de origem nao encontrada.')

  const [families, treatments] = await Promise.all([
    fetchAll(() => supabase.from('global_lens_families').select('*').eq('version_id', SOURCE_VERSION_ID)),
    fetchAll(() => supabase.from('global_treatments').select('*').eq('version_id', SOURCE_VERSION_ID)),
  ])
  const familyIds = families.map((family) => family.id)
  const offers = await fetchAll(() => supabase.from('global_lens_offers').select('*').in('family_id', familyIds))
  const offerIds = offers.map((offer) => offer.id)
  const [grids, compatibilities, usageProfiles] = await Promise.all([
    fetchAll(() => supabase.from('global_offer_diopter_grids').select('*').in('offer_id', offerIds)),
    fetchAll(() => supabase.from('global_offer_treatments_compatibility').select('*').in('offer_id', offerIds)),
    fetchAll(() => supabase.from('global_usage_profiles').select('*').in('family_id', familyIds)),
  ])

  const familyById = new Map(families.map((family) => [family.id, family]))
  const gridsByOfferId = new Map()
  for (const grid of grids) {
    const rows = gridsByOfferId.get(grid.offer_id) || []
    rows.push(grid)
    gridsByOfferId.set(grid.offer_id, rows)
  }
  const officialMatchesByOfferId = new Map()
  for (const offer of offers) {
    const family = familyById.get(offer.family_id)
    const matches = officialRows.filter((row) => isCsvMatch(row, family, offer))
    if (matches.length) officialMatchesByOfferId.set(offer.id, matches)
  }

  const splitTransitionOffers = offers.filter((offer) => {
    const matches = officialMatchesByOfferId.get(offer.id) || []
    return isTransitionOffer(offer) && matches.length > 0
  })
  const offersToSkip = new Set([
    ...splitTransitionOffers.map((offer) => offer.id),
    ...offers.filter((offer) => familyById.get(offer.family_id)?.nome === LEGACY_TRANSITIONS_FAMILY).map((offer) => offer.id),
  ])
  const familiesToSkip = new Set([LEGACY_TRANSITIONS_FAMILY])
  const retainedOfficialCodes = new Set(
    offers
      .filter((offer) => !offersToSkip.has(offer.id))
      .flatMap((offer) => (officialMatchesByOfferId.get(offer.id) || []).map((row) => row.code)),
  )
  const newOfficialRows = officialRows.filter((row) => !retainedOfficialCodes.has(row.code))

  const plan = {
    sourceVersion: `${sourceVersion.laboratorio} | ${sourceVersion.versao}`,
    targetVersion: TARGET_VERSION,
    sourceFamilies: families.length,
    sourceOffers: offers.length,
    officialSurfacedRows: officialRows.length,
    officialRowsRetainedFromLegacy: retainedOfficialCodes.size,
    officialRowsToCreate: newOfficialRows.length,
    transitionOffersToSplit: splitTransitionOffers.length,
    legacyOffersRetained: offers.filter((offer) => !offersToSkip.has(offer.id)).length,
    newTreatment: TINGIVEL,
    priceRuleForNewRows: 'preco_ao_logista_x6',
    pricesOnRetainedOffers: 'preservados_sem_alteracao',
    omittedLegacyFamily: LEGACY_TRANSITIONS_FAMILY,
    newRows: newOfficialRows.map((row) => ({ code: row.code, family: row.family, product: row.product })),
  }
  console.log(JSON.stringify(plan, null, 2))
  if (!COMMIT) return

  const { data: targetExists, error: targetLookupError } = await supabase
    .from('global_catalog_versions')
    .select('id')
    .eq('laboratorio', 'Haytek')
    .eq('versao', TARGET_VERSION)
    .maybeSingle()
  if (targetLookupError) throw targetLookupError
  const targetVersion = targetExists || (await insert('global_catalog_versions', {
    laboratorio: 'Haytek',
    versao: TARGET_VERSION,
    source_kind: 'csv',
    status: 'draft',
    notes:
      'Atualizacao cirurgica a partir de Haytek Setembro 2025. Precos consumidores existentes preservados; novas ofertas e Antirrisco Tingivel precificados como fornecedor x6; grades surfacadas confirmadas pelo CSV oficial 07/2026.',
  }))
  const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(CSV_PATH)).digest('hex')
  const { data: existingDocument, error: existingDocumentError } = await supabase
    .from('catalog_source_documents')
    .select('*')
    .eq('version_id', targetVersion.id)
    .eq('document_hash', sourceHash)
    .maybeSingle()
  if (existingDocumentError) throw existingDocumentError
  const targetDocument = existingDocument || (await insert('catalog_source_documents', {
    version_id: targetVersion.id,
    laboratorio: 'Haytek',
    document_name: path.basename(CSV_PATH),
    source_type: 'text',
    source_path: '.tabelas/haytek tabela PVO 07-26.csv',
    document_hash: sourceHash,
    extraction_engine: 'official_csv_reconciliation',
    extracted_text: null,
    metadata: { source_version_id: SOURCE_VERSION_ID, official: true },
  }))

  const existingTargetFamilies = await fetchAll(() =>
    supabase.from('global_lens_families').select('id,nome').eq('version_id', targetVersion.id),
  )
  const targetFamilyIdByName = new Map(existingTargetFamilies.map((family) => [family.nome, family.id]))
  const familyIdMap = new Map()
  for (const family of families) {
    if (familiesToSkip.has(family.nome)) continue
    let targetFamilyId = targetFamilyIdByName.get(family.nome)
    if (!targetFamilyId) {
      const saved = await insert('global_lens_families', {
        version_id: targetVersion.id,
        source_document_id: targetDocument.id,
        nome: family.nome,
        clinical_category: family.clinical_category,
        design: family.design,
        description_marketing: family.description_marketing,
        tags_uso: family.tags_uso || [],
        tags_beneficios: family.tags_beneficios || [],
        source_page_reference: family.source_page_reference,
      })
      targetFamilyId = saved.id
      targetFamilyIdByName.set(family.nome, targetFamilyId)
    }
    familyIdMap.set(family.id, targetFamilyId)
  }

  const existingTargetTreatments = await fetchAll(() =>
    supabase.from('global_treatments').select('id,nome').eq('version_id', targetVersion.id),
  )
  const treatmentByTargetName = new Map(existingTargetTreatments.map((treatment) => [treatment.nome, treatment.id]))
  const treatmentIdMap = new Map()
  for (const treatment of treatments) {
    let targetTreatmentId = treatmentByTargetName.get(treatment.nome)
    if (!targetTreatmentId) {
      const saved = await insert('global_treatments', {
        version_id: targetVersion.id,
        laboratorio: 'Haytek',
        nome: treatment.nome,
        tipo: treatment.tipo,
        tags: treatment.tags || [],
        features: treatment.features || {},
      })
      targetTreatmentId = saved.id
      treatmentByTargetName.set(treatment.nome, targetTreatmentId)
    }
    treatmentIdMap.set(treatment.id, targetTreatmentId)
  }
  let tingivelId = treatmentByTargetName.get(TINGIVEL)
  if (!tingivelId) {
    const tingivel = await insert('global_treatments', {
      version_id: targetVersion.id,
      laboratorio: 'Haytek',
      nome: TINGIVEL,
      tipo: 'antirrisco_tingivel',
      tags: ['antirrisco', 'tingivel'],
      features: {
        semantic_profile: {
          usage_tags: ['tratamento_lente'],
          benefit_tags: ['resistencia_riscos', 'permite_coloracao'],
          commercial_summary: 'Endurecimento antirrisco com possibilidade de tingimento; nao equivale a antirreflexo.',
          recommendation_notes: 'Nao usar como substituto de antirreflexo. Apresentar quando houver necessidade de coloracao/tingimento.',
          source: 'Haytek PVO Julho 2026 - coluna Antirrisco Tingivel',
        },
      },
    })
    tingivelId = tingivel.id
    treatmentByTargetName.set(TINGIVEL, tingivelId)
  }

  const oldCompatByOffer = new Map()
  for (const compatibility of compatibilities) {
    const rows = oldCompatByOffer.get(compatibility.offer_id) || []
    rows.push(compatibility)
    oldCompatByOffer.set(compatibility.offer_id, rows)
  }
  const clonedOfferIdMap = new Map()
  const officialByCode = new Map(officialRows.map((row) => [row.code, row]))

  async function saveOffer({ sourceOffer = null, row = null, targetFamilyId, preservePrices }) {
    const priorGrid = sourceOffer ? (gridsByOfferId.get(sourceOffer.id) || [])[0] : null
    const nextFeatures = row ? featuresForOfficialRow(row, sourceOffer?.features || {}) : sourceOffer.features || {}
    const importKey = row
      ? `Haytek PVO 07-2026 | ${row.code} | ${row.product}`
      : sourceOffer.import_key
    const { data: existingOffer, error: existingOfferError } = await supabase
      .from('global_lens_offers')
      .select('id')
      .eq('family_id', targetFamilyId)
      .eq('import_key', importKey)
      .maybeSingle()
    if (existingOfferError) throw existingOfferError
    if (existingOffer) {
      if (row?.prices[1] != null) {
        const { data: currentTingivel, error: currentTingivelError } = await supabase
          .from('global_offer_treatments_compatibility')
          .select('offer_id')
          .eq('offer_id', existingOffer.id)
          .eq('treatment_id', tingivelId)
          .maybeSingle()
        if (currentTingivelError) throw currentTingivelError
        if (!currentTingivel) {
          await insert('global_offer_treatments_compatibility', {
            offer_id: existingOffer.id,
            treatment_id: tingivelId,
            special_price: priceTimesSix(row.prices[1]),
            price_mode: 'final',
            notes: 'Preco consumidor calculado como tabela oficial ao lojista x6.',
          })
        }
      }
      return existingOffer
    }
    const offer = await insert('global_lens_offers', {
      family_id: targetFamilyId,
      import_key: importKey,
      raw_label: row ? row.product : sourceOffer.raw_label,
      canonical_label: row ? `${row.family} ${row.product}` : sourceOffer.canonical_label,
      clinical_category:
        sourceOffer?.clinical_category && sourceOffer.clinical_category !== 'indefinida'
          ? sourceOffer.clinical_category
          : familyById.get(sourceOffer?.family_id)?.clinical_category || 'indefinida',
      material: row && normalize(row.product).includes('poli') ? 'POLI' : sourceOffer?.material || null,
      indice_refracao: row?.index ?? sourceOffer.indice_refracao,
      is_atomic_offer: sourceOffer?.is_atomic_offer === true,
      allows_composition: sourceOffer?.allows_composition !== false,
      already_includes_treatment: sourceOffer?.already_includes_treatment === true,
      features: nextFeatures,
      base_price: preservePrices ? sourceOffer.base_price : priceTimesSix(row.prices[0]),
      source_page_reference: row ? 'CSV oficial PVO 07/2026' : sourceOffer.source_page_reference,
      confidence_level: row ? 1 : sourceOffer.confidence_level,
    })
    const nextGrids = row ? [buildGrid(row, priorGrid?.metadata || {})] : (gridsByOfferId.get(sourceOffer.id) || [])
    for (const grid of nextGrids) {
      await insert('global_offer_diopter_grids', {
        offer_id: offer.id,
        sph_min: grid.sph_min,
        sph_max: grid.sph_max,
        cyl_min: grid.cyl_min,
        cyl_max: grid.cyl_max,
        add_min: grid.add_min,
        add_max: grid.add_max,
        metadata: grid.metadata || {},
      })
    }
    if (preservePrices) {
      for (const compatibility of oldCompatByOffer.get(sourceOffer.id) || []) {
        await insert('global_offer_treatments_compatibility', {
          offer_id: offer.id,
          treatment_id: treatmentIdMap.get(compatibility.treatment_id),
          special_price: compatibility.special_price,
          price_mode: compatibility.price_mode,
          notes: compatibility.notes,
        })
      }
    } else {
      const treatmentsByColumn = [
        ['AR Verde', row.prices[2]],
        ['AR Azul', row.prices[3]],
        ['AR Premium Verde', row.prices[4]],
        ['AR Premium Azul', row.prices[5]],
      ]
      for (const [name, price] of treatmentsByColumn) {
        const oldTreatment = treatments.find((treatment) => treatment.nome === name)
        if (!oldTreatment || price == null) continue
        await insert('global_offer_treatments_compatibility', {
          offer_id: offer.id,
          treatment_id: treatmentIdMap.get(oldTreatment.id),
          special_price: priceTimesSix(price),
          price_mode: 'final',
          notes: 'Preco consumidor calculado como tabela oficial ao lojista x6.',
        })
      }
    }
    if (row?.prices[1] != null) {
      await insert('global_offer_treatments_compatibility', {
        offer_id: offer.id,
        treatment_id: tingivelId,
        special_price: priceTimesSix(row.prices[1]),
        price_mode: 'final',
        notes: 'Preco consumidor calculado como tabela oficial ao lojista x6.',
      })
    }
    return offer
  }

  for (const offer of offers) {
    if (offersToSkip.has(offer.id)) continue
    const targetFamilyId = familyIdMap.get(offer.family_id)
    if (!targetFamilyId) continue
    const matches = officialMatchesByOfferId.get(offer.id) || []
    const officialRow = matches[0] || null
    const saved = await saveOffer({
      sourceOffer: offer,
      row: officialRow,
      targetFamilyId,
      preservePrices: true,
    })
    clonedOfferIdMap.set(offer.id, saved.id)
  }

  for (const row of newOfficialRows) {
    const targetFamily = families.find((family) => normalize(family.nome) === normalize(row.family))
    if (!targetFamily) throw new Error(`Familia destino nao encontrada: ${row.family}`)
    const candidates = offers.filter((offer) => {
      const family = familyById.get(offer.family_id)
      return normalize(family.nome) === normalize(row.family) && Number(offer.indice_refracao) === row.index
    })
    const sourceOffer = candidates.find((offer) => isTransitionOffer(offer)) || candidates[0] || null
    await saveOffer({
      sourceOffer,
      row,
      targetFamilyId: familyIdMap.get(targetFamily.id),
      preservePrices: false,
    })
  }

  const existingProfileFamilyIds = new Set(
    (await fetchAll(() =>
      supabase.from('global_usage_profiles').select('family_id').eq('profile_scope', 'family').in('family_id', [...familyIdMap.values()]),
    )).map((profile) => profile.family_id),
  )
  for (const profile of usageProfiles) {
    const targetFamilyId = familyIdMap.get(profile.family_id)
    if (!targetFamilyId || existingProfileFamilyIds.has(targetFamilyId)) continue
    await insert('global_usage_profiles', {
      family_id: targetFamilyId,
      offer_id: null,
      profile_scope: 'family',
      usage_tags: profile.usage_tags || [],
      benefit_tags: profile.benefit_tags || [],
      commercial_summary: profile.commercial_summary,
      recommendation_notes: profile.recommendation_notes,
      source_page_reference: 'Clonado de Haytek Setembro 2025; grades atualizadas pelo CSV oficial PVO 07/2026 quando aplicavel.',
    })
  }

  console.log(JSON.stringify({ applied: true, versionId: targetVersion.id, documentId: targetDocument.id }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
