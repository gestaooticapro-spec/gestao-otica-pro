import fs from 'fs'
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
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const args = process.argv.slice(2)
const inputArg = args.find((arg) => !arg.startsWith('--')) || 'tmp/gamalab_catalog_draft.json'
const shouldCommit = args.includes('--commit')

function buildOfferImportKey(offer) {
  const canonical = offer.canonical_label || offer.raw_label || 'sem-label'
  const page = offer.source_page_reference || 'sem-pagina'
  const price = offer.base_price ?? 'sem-preco'
  const legacy = offer.legacy_code || 'sem-codigo'
  return `${page} | ${canonical} | ${price} | ${legacy}`
}

function normalizeText(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function inferFamilyClinicalCategory(family) {
  const text = normalizeText(
    [family.name, family.design, family.description_marketing, family.source_page_reference].filter(Boolean).join(' ')
  )

  if (text.includes('solares planas acabadas')) return 'plana_solar'
  if (text.includes('bifocais')) return 'bifocal'
  if (text.includes('stellest') || text.includes('controle da miopia')) return 'controle_miopia'
  if (text.includes('eyezen')) return text.includes('kids') ? 'mista' : 'visao_simples'
  if (text.includes('start stock')) return 'visao_simples'
  if (text.includes('activities') || text.includes('kodak') || text.includes('lentes essilor') || text.includes('itop') || text.includes('espace')) return 'mista'
  if (text.includes('varilux')) return 'multifocal'

  return 'indefinida'
}

function inferOfferClinicalCategory(offer, family, familyClinicalCategory) {
  const text = normalizeText([family.name, offer.canonical_label, offer.raw_label, offer.source_page_reference].filter(Boolean).join(' '))
  const hasAddGrid = (offer.diopter_grids || []).some((grid) => grid.add_min != null || grid.add_max != null)

  if (text.includes('stellest')) return 'controle_miopia'
  if (text.includes('bifocal') || text.includes('flap top') || text.includes('ultex')) return 'bifocal'
  if (text.includes('solares planas acabadas')) return 'plana_solar'
  if (text.includes('interview') || text.includes('digitime') || text.includes('softwear') || text.includes('roadpilot') || text.includes('sportwrap') || text.includes('sport ')) {
    return 'ocupacional'
  }
  if (
    text.includes('eyezen') ||
    text.includes('single') ||
    text.includes('visao simples') ||
    text.includes('kodak city') ||
    text.includes('kodak intro') ||
    text.includes('kodak blue')
  ) {
    return 'visao_simples'
  }
  if (
    hasAddGrid ||
    text.includes('varilux') ||
    text.includes('unique') ||
    text.includes('network') ||
    text.includes('precise') ||
    text.includes('comfort') ||
    text.includes('liberty') ||
    text.includes('physio') ||
    text.includes('xr series')
  ) {
    return 'multifocal'
  }
  if (familyClinicalCategory !== 'mista' && familyClinicalCategory !== 'indefinida') {
    return familyClinicalCategory
  }

  return 'indefinida'
}

function readJson(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  if (!fs.existsSync(absolute)) {
    throw new Error(`Arquivo nao encontrado: ${absolute}`)
  }
  return JSON.parse(fs.readFileSync(absolute, 'utf8'))
}

function buildSummary(payload) {
  return {
    version: payload.catalog_version?.versao,
    laboratorio: payload.catalog_version?.laboratorio,
    familias: payload.families?.length || 0,
    ofertas: (payload.families || []).reduce((acc, family) => acc + (family.offers?.length || 0), 0),
    tratamentos: payload.treatments?.length || 0,
    paginas: payload.source_document?.pages?.length || 0,
  }
}

async function upsertSingle(table, row, onConflict) {
  const { data, error } = await supabase
    .from(table)
    .upsert(row, { onConflict })
    .select('*')
    .single()

  if (error) throw error
  return data
}

async function importPayload(payload) {
  const version = await upsertSingle(
    'global_catalog_versions',
    {
      laboratorio: payload.catalog_version.laboratorio,
      versao: payload.catalog_version.versao,
      source_kind: payload.catalog_version.source_kind || 'pdf',
      status: payload.catalog_version.status || 'draft',
      notes: payload.catalog_version.notes || null,
    },
    'laboratorio,versao'
  )

  const document = await upsertSingle(
    'catalog_source_documents',
    {
      version_id: version.id,
      laboratorio: payload.catalog_version.laboratorio,
      document_name: payload.source_document.document_name,
      source_type: 'pdf',
      source_path: payload.source_document.source_path || null,
      document_hash: payload.source_document.document_hash,
      extraction_engine: payload.source_document.extraction_engine || null,
      extracted_text: payload.source_document.extracted_text || null,
      metadata: {
        imported_via: 'scripts/import_global_catalog.js',
      },
    },
    'version_id,document_hash'
  )

  for (const page of payload.source_document.pages || []) {
    const savedPage = await upsertSingle(
      'catalog_source_pages',
      {
        document_id: document.id,
        page_number: page.page_number,
        extracted_text: page.text || null,
        metadata: {},
      },
      'document_id,page_number'
    )

    for (const chunk of page.chunks || []) {
      await upsertSingle(
        'catalog_source_chunks',
        {
          page_id: savedPage.id,
          page_number: page.page_number,
          chunk_index: chunk.chunk_index,
          chunk_text: chunk.text,
          metadata: {},
        },
        'page_id,chunk_index'
      )
    }
  }

  const treatmentIdByName = new Map()
  for (const treatment of payload.treatments || []) {
    const savedTreatment = await upsertSingle(
      'global_treatments',
      {
        version_id: version.id,
        laboratorio: payload.catalog_version.laboratorio,
        nome: treatment.name,
        tipo: treatment.type || 'Tratamento',
        tags: treatment.tags || [],
        features: treatment.features || {},
      },
      'version_id,nome'
    )
    treatmentIdByName.set(treatment.name, savedTreatment.id)
  }

  for (const family of payload.families || []) {
    const familyClinicalCategory = family.clinical_category || inferFamilyClinicalCategory(family)
    const savedFamily = await upsertSingle(
      'global_lens_families',
      {
        version_id: version.id,
        source_document_id: document.id,
        nome: family.name,
        clinical_category: familyClinicalCategory,
        design: family.design || 'Nao identificado',
        description_marketing: family.description_marketing || null,
        tags_uso: family.usage_tags || [],
        tags_beneficios: family.benefit_tags || [],
        source_page_reference: family.source_page_reference || null,
      },
      'version_id,nome'
    )

    for (const offer of family.offers || []) {
      const offerClinicalCategory = offer.clinical_category || inferOfferClinicalCategory(offer, family, familyClinicalCategory)
      const savedOffer = await upsertSingle(
        'global_lens_offers',
        {
          family_id: savedFamily.id,
          import_key: buildOfferImportKey(offer),
          raw_label: offer.raw_label,
          canonical_label: offer.canonical_label || null,
          clinical_category: offerClinicalCategory,
          material: offer.material || null,
          indice_refracao: offer.indice_refracao ?? null,
          is_atomic_offer: offer.is_atomic_offer === true,
          allows_composition: offer.allows_composition !== false,
          already_includes_treatment: offer.already_includes_treatment === true,
          features: offer.features || {},
          base_price: offer.base_price ?? null,
          source_page_reference: offer.source_page_reference || null,
          confidence_level: offer.confidence_level ?? null,
        },
        'family_id,import_key'
      )

      const { error: deleteGridsError } = await supabase
        .from('global_offer_diopter_grids')
        .delete()
        .eq('offer_id', savedOffer.id)

      if (deleteGridsError) throw deleteGridsError

      for (const grid of offer.diopter_grids || []) {
        const { error } = await supabase.from('global_offer_diopter_grids').insert({
          offer_id: savedOffer.id,
          sph_min: grid.sph_min,
          sph_max: grid.sph_max,
          cyl_min: grid.cyl_min ?? 0,
          cyl_max: grid.cyl_max ?? grid.cyl_min ?? 0,
          add_min: grid.add_min ?? null,
          add_max: grid.add_max ?? null,
          metadata: grid.metadata || {},
        })

        if (error) throw error
      }

      for (const compat of offer.compatible_treatments || []) {
        const treatmentId = treatmentIdByName.get(compat.treatment_name)
        if (!treatmentId) continue

        const { error } = await supabase
          .from('global_offer_treatments_compatibility')
          .upsert(
            {
              offer_id: savedOffer.id,
              treatment_id: treatmentId,
              special_price: compat.special_price ?? null,
              price_mode: compat.price_mode || 'final',
              notes: null,
            },
            { onConflict: 'offer_id,treatment_id' }
          )

        if (error) throw error
      }
    }
  }

  return {
    versionId: version.id,
    documentId: document.id,
  }
}

async function main() {
  const payload = readJson(inputArg)
  const summary = buildSummary(payload)

  console.log('Resumo do payload:')
  console.table(summary)

  if (!shouldCommit) {
    console.log('Dry-run finalizado. Use --commit para gravar no Supabase.')
    return
  }

  const result = await importPayload(payload)
  console.log('Importacao concluida com sucesso:')
  console.table(result)
}

main().catch((error) => {
  console.error('Falha ao importar catalogo global:', error.message || error)
  process.exit(1)
})
