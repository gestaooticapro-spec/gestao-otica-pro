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
const versionId =
  args.find((arg) => arg.startsWith('--version-id='))?.split('=').slice(1).join('=') ||
  'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'
const commit = args.includes('--commit')

const FAMILY_METADATA = {
  'Quantum A.I.': {
    source_catalog_page: 7,
    family_type: 'multifocal',
    min_fitting_height_options_mm: [14, 18],
    add_min: 0.25,
    add_max: 4.0,
    marking_code: 'QAI',
    grade_status: 'not_visible_on_source_price_page',
  },
  'Gamavision 4K': {
    source_catalog_page: 8,
    family_type: 'multifocal',
    min_fitting_height_options_mm: [14, 18],
    add_min: 0.25,
    add_max: 4.0,
    marking_code: 'GA4K',
    grade_status: 'not_visible_on_source_price_page',
  },
  'Gamavision Pro Individual': {
    source_catalog_page: 9,
    family_type: 'multifocal',
    min_fitting_height_options_mm: [14, 18],
    add_min: 0.25,
    add_max: 4.0,
    marking_code: 'GPI',
    grade_status: 'not_visible_on_source_price_page',
  },
  'Dynamic Premium': {
    source_catalog_page: 10,
    family_type: 'multifocal',
    min_fitting_height_options_mm: [14, 18],
    add_min: 0.25,
    add_max: 4.0,
    marking_code: 'DYP',
    grade_status: 'not_visible_on_source_price_page',
  },
  'Gamavision Freeform': {
    source_catalog_page: 11,
    family_type: 'multifocal',
    min_fitting_height_options_mm: [14, 18],
    add_min: 0.25,
    add_max: 4.0,
    marking_code: 'GA',
    grade_status: 'not_visible_on_source_price_page',
  },
  'Dynamic Pro': {
    source_catalog_page: 12,
    family_type: 'multifocal',
    min_fitting_height_options_mm: [14, 18],
    add_min: 0.25,
    add_max: 4.0,
    marking_code: 'DY',
    grade_status: 'not_visible_on_source_price_page',
  },
  Life: {
    source_catalog_page: 13,
    family_type: 'multifocal',
    min_fitting_height_options_mm: [14, 18],
    add_min: 0.25,
    add_max: 4.0,
    marking_code: 'LIFE',
    grade_status: 'not_visible_on_source_price_page',
  },
  'Gama HD': {
    source_catalog_page: 14,
    family_type: 'multifocal',
    min_fitting_height_options_mm: [14, 18],
    add_min: 0.25,
    add_max: 4.0,
    marking_codes: ['GHD', 'GHDS'],
    grade_status: 'not_visible_on_source_price_page',
  },
  'Dynamic Work': {
    source_catalog_page: 15,
    family_type: 'ocupacional',
    min_fitting_height_options_mm: [14, 18],
    add_min: 0.25,
    add_max: 4.0,
    marking_code: 'DYW',
    grade_status: 'not_visible_on_source_price_page',
  },
  'Dynamic Relax': {
    source_catalog_page: 16,
    family_type: 'visao_simples',
    add_values: [0.5, 0.75, 1.0, 1.25],
    marking_code: 'DYR',
    grade_status: 'not_visible_on_source_price_page',
    notes: 'A fonte descreve baixa adicao/relaxamento ate +1.25; nao tratar como ocupacional.',
  },
  'Dynamic Single': {
    source_catalog_page: 17,
    family_type: 'visao_simples',
    marking_code: 'DYS',
    grade_status: 'not_visible_on_source_price_page',
  },
  MioKids: {
    source_catalog_page: 18,
    family_type: 'controle_miopia',
    indicated_age_range: '6 a 18 anos',
    material_notes: 'Policarbonato 1.59, resistencia eficiente ao choque e baixa reflexao.',
    index_refraction: 1.59,
    grade_status: 'not_visible_on_source_price_page',
  },
  'Visão Simples Surfaçadas Digital': {
    source_catalog_page: 19,
    family_type: 'visao_simples',
    design_notes: 'Design puntiforme, produzidas com alta tecnologia digital.',
    grade_status: 'not_visible_on_source_price_page',
  },
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sameJson(a, b) {
  return stableStringify(a) === stableStringify(b)
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`
}

async function main() {
  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome,source_page_reference,clinical_category')
    .eq('version_id', versionId)
  if (famErr) throw famErr

  const metadataByNormalizedName = new Map(
    Object.entries(FAMILY_METADATA).map(([name, metadata]) => [normalizeName(name), { name, metadata }]),
  )

  const targetFamilies = (families || [])
    .map((family) => {
      const mapped = metadataByNormalizedName.get(normalizeName(family.nome))
      return mapped ? { ...family, metadataName: mapped.name, metadata: mapped.metadata } : null
    })
    .filter(Boolean)

  if (!targetFamilies.length) {
    console.log('Nenhuma familia alvo encontrada.')
    return
  }

  const familyIds = targetFamilies.map((family) => family.id)
  const familyById = new Map(targetFamilies.map((family) => [family.id, family]))

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,raw_label,canonical_label,features,source_page_reference')
    .in('family_id', familyIds)
  if (offErr) throw offErr

  const changes = []
  for (const offer of offers || []) {
    const family = familyById.get(offer.family_id)
    if (!family) continue

    const features = ensureObject(offer.features)
    const currentSourceMetadata = ensureObject(features.source_technical_metadata)
    const gamalabMetadata = {
      ...family.metadata,
      family_name: family.metadataName,
      source_page_reference: family.source_page_reference || offer.source_page_reference,
      evidence: 'Gamalab_TabelaPrecos2025_02Mar2026.pdf',
    }

    const needsUpdate =
      features.grade_nao_informada_na_fonte !== true ||
      !sameJson(ensureObject(currentSourceMetadata.gamalab_2026), gamalabMetadata)

    if (!needsUpdate) continue

    const nextFeatures = {
      ...features,
      grade_nao_informada_na_fonte: true,
      source_technical_metadata: {
        ...currentSourceMetadata,
        gamalab_2026: gamalabMetadata,
      },
    }

    changes.push({ offer, family, nextFeatures })
  }

  for (const change of changes) {
    const label = change.offer.canonical_label || change.offer.raw_label
    console.log(`[annotate] ${change.family.nome} | ${label}`)
    if (!commit) continue
    const { error: upErr } = await supabase
      .from('global_lens_offers')
      .update({ features: change.nextFeatures })
      .eq('id', change.offer.id)
    if (upErr) throw upErr
  }

  console.log('Resumo:')
  console.log('- Familias alvo:', targetFamilies.length)
  console.log('- Ofertas alvo:', (offers || []).length)
  console.log('- Ofertas anotadas/alteradas:', changes.length)
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
