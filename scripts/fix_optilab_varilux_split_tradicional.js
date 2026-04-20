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

const VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078' // Optilab 2026
const STORE_ID = 1
const DRY_RUN = process.argv.includes('--dry-run')

function isString(v) {
  return typeof v === 'string'
}

function replacePrefix(label, from, to) {
  if (!isString(label) || !label.startsWith(from)) return label
  return to + label.slice(from.length)
}

function mergeFeatures(base, patch) {
  return { ...(base && typeof base === 'object' ? base : {}), ...(patch || {}) }
}

async function getActivationIdForStoreAndVersion(storeId, versionId) {
  const { data, error } = await supabase
    .from('tenant_catalog_activations')
    .select('id')
    .eq('store_id', storeId)
    .eq('global_version_id', versionId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return data?.id || null
}

async function ensureFamily({ templateFamily, name, patch }) {
  const { data: existing, error: exErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', VERSION_ID)
    .eq('nome', name)
    .maybeSingle()
  if (exErr) throw exErr
  if (existing?.id) return existing.id

  const insertRow = {
    version_id: templateFamily.version_id,
    source_document_id: templateFamily.source_document_id,
    nome: name,
    clinical_category: templateFamily.clinical_category,
    design: patch.design || templateFamily.design,
    description_marketing: patch.description_marketing || null,
    tags_uso: patch.tags_uso || [],
    tags_beneficios: patch.tags_beneficios || [],
    source_page_reference: patch.source_page_reference || templateFamily.source_page_reference || null,
  }

  if (DRY_RUN) {
    console.log('[fix] would insert family', name)
    return '__dry__'
  }

  const { data: inserted, error: insErr } = await supabase
    .from('global_lens_families')
    .insert(insertRow)
    .select('id')
    .single()
  if (insErr) throw insErr
  return inserted.id
}

async function main() {
  const activationId = await getActivationIdForStoreAndVersion(STORE_ID, VERSION_ID)
  console.log(`[split] version=${VERSION_ID} store=${STORE_ID} activation=${activationId || 'N/A'} dry=${DRY_RUN}`)

  const plans = [
    {
      currentFamilyName: 'VARILUX® COMFORT MAX',
      newFamilyName: 'VARILUX® COMFORT',
      currentPrefix: 'VARILUX® COMFORT MAX ',
      newPrefix: 'VARILUX® COMFORT ',
      match: (label) => /\bTRADICIONAL\b/i.test(label || ''),
      newFamilyPatch: {
        design: 'Progressiva Tradicional (Comfort)',
        description_marketing: 'Varilux Comfort (tradicional). Mesma familia, variante sem Essilor Fit Eyecode.',
        tags_uso: ['multifocal', 'tradicional'],
        tags_beneficios: ['conforto'],
        source_page_reference: 'Pagina 18',
      },
      offerFeaturePatch: {
        varilux_line: 'comfort',
        model_variant: 'classic',
        model_name: 'Varilux Comfort',
      },
    },
    {
      currentFamilyName: 'VARILUX® LIBERTY 3.0',
      newFamilyName: 'VARILUX® LIBERTY',
      currentPrefix: 'VARILUX® LIBERTY 3.0 ',
      newPrefix: 'VARILUX® LIBERTY ',
      match: (label) => /\bTRADICIONAL\b/i.test(label || ''),
      newFamilyPatch: {
        design: 'Progressiva Tradicional (Liberty)',
        description_marketing: 'Varilux Liberty (tradicional). Variante sem 3.0.',
        tags_uso: ['multifocal', 'tradicional'],
        tags_beneficios: ['transicao'],
        source_page_reference: 'Pagina 19',
      },
      offerFeaturePatch: {
        varilux_line: 'liberty',
        model_variant: 'classic',
        model_name: 'Varilux Liberty',
      },
    },
  ]

  for (const plan of plans) {
    const { data: currentFamily, error: famErr } = await supabase
      .from('global_lens_families')
      .select('id,nome,version_id,source_document_id,clinical_category,design,source_page_reference')
      .eq('version_id', VERSION_ID)
      .eq('nome', plan.currentFamilyName)
      .single()
    if (famErr) throw famErr

    const newFamilyId = await ensureFamily({ templateFamily: currentFamily, name: plan.newFamilyName, patch: plan.newFamilyPatch })

    const { data: offers, error: offersErr } = await supabase
      .from('global_lens_offers')
      .select('id,canonical_label,raw_label,features')
      .eq('family_id', currentFamily.id)
    if (offersErr) throw offersErr

    const toMove = (offers || []).filter((o) => plan.match(o.canonical_label || o.raw_label || ''))
    console.log(`[split] ${plan.currentFamilyName}: offers=${offers?.length || 0} move(TRADICIONAL)=${toMove.length} -> ${plan.newFamilyName}`)

    if (!toMove.length) continue

    if (!DRY_RUN) {
      for (const offer of toMove) {
        const oldCanonical = offer.canonical_label || offer.raw_label || ''
        const oldRaw = offer.raw_label || ''
        const nextCanonical = replacePrefix(oldCanonical, plan.currentPrefix, plan.newPrefix)
        const nextRaw = replacePrefix(oldRaw, plan.currentPrefix, plan.newPrefix)
        const nextFeatures = mergeFeatures(offer.features || {}, plan.offerFeaturePatch)

        const { error: upErr } = await supabase
          .from('global_lens_offers')
          .update({
            family_id: newFamilyId,
            canonical_label: nextCanonical || null,
            raw_label: nextRaw || null,
            features: nextFeatures,
          })
          .eq('id', offer.id)
        if (upErr) throw upErr

        if (activationId) {
          // keep UI/search consistent for this store
          const { data: tenantRow, error: tErr } = await supabase
            .from('tenant_commercial_offers')
            .select('id,display_name')
            .eq('activation_id', activationId)
            .eq('global_offer_id', offer.id)
            .maybeSingle()
          if (tErr) throw tErr
          if (tenantRow?.id) {
            const { error: updErr } = await supabase
              .from('tenant_commercial_offers')
              .update({ display_name: nextCanonical || null })
              .eq('id', tenantRow.id)
            if (updErr) throw updErr
          }
        }
      }
    }
  }

  console.log('[split] concluido')
}

main().catch((error) => {
  console.error('Falha no split:', error?.message || error)
  process.exit(1)
})
