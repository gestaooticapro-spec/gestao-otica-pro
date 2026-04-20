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

const VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078' // Optilab 2026 (PVC)
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

async function main() {
  const targets = [
    {
      familyOld: 'VARILUX® COMFORT',
      familyNew: 'VARILUX® COMFORT MAX',
      offerPrefixOld: 'VARILUX® COMFORT ',
      offerPrefixNew: 'VARILUX® COMFORT MAX ',
      familyPatch: {
        design: 'Progressiva Digital (Comfort Max)',
        description_marketing:
          'Comfort Max (Essilor Fit Eyecode). Beneficios: resultado postural e maior conforto. Tecnologias: WAVE 2.0 e Flex Optim.',
        tags_uso: ['multifocal', 'digital', 'eyecode'],
        tags_beneficios: ['conforto', 'postura'],
      },
      offerFeaturePatch: {
        varilux_line: 'comfort',
        model_variant: 'max',
        model_name: 'Varilux Comfort Max',
      },
    },
    {
      familyOld: 'VARILUX® LIBERTY',
      familyNew: 'VARILUX® LIBERTY 3.0',
      offerPrefixOld: 'VARILUX® LIBERTY ',
      offerPrefixNew: 'VARILUX® LIBERTY 3.0 ',
      familyPatch: {
        design: 'Progressiva Digital (Liberty 3.0)',
        description_marketing:
          'Liberty 3.0. Beneficios: boa transicao e otimizacao para perto. Personalizacao: Flex Optim.',
        tags_uso: ['multifocal', 'digital'],
        tags_beneficios: ['transicao', 'perto'],
      },
      offerFeaturePatch: {
        varilux_line: 'liberty',
        model_variant: '3.0',
        model_name: 'Varilux Liberty 3.0',
      },
    },
  ]

  const activationId = await getActivationIdForStoreAndVersion(STORE_ID, VERSION_ID)
  console.log(`[fix] Optilab version=${VERSION_ID} store=${STORE_ID} activation=${activationId || 'N/A'} dry=${DRY_RUN}`)

  for (const t of targets) {
    const { data: family, error: familyError } = await supabase
      .from('global_lens_families')
      .select('id,nome,design,description_marketing,tags_uso,tags_beneficios')
      .eq('version_id', VERSION_ID)
      .eq('nome', t.familyOld)
      .maybeSingle()

    if (familyError) throw familyError
    if (!family) {
      console.warn(`[fix] familia nao encontrada: ${t.familyOld}`)
      continue
    }

    // Ensure no collision on rename
    const { data: collision } = await supabase
      .from('global_lens_families')
      .select('id')
      .eq('version_id', VERSION_ID)
      .eq('nome', t.familyNew)
      .maybeSingle()

    if (collision?.id && collision.id !== family.id) {
      throw new Error(`[fix] colisao: ja existe familia ${t.familyNew} (id=${collision.id})`)
    }

    const familyUpdate = {
      nome: t.familyNew,
      design: t.familyPatch.design,
      description_marketing: t.familyPatch.description_marketing,
      tags_uso: t.familyPatch.tags_uso,
      tags_beneficios: t.familyPatch.tags_beneficios,
    }

    console.log(`[fix] familia ${t.familyOld} -> ${t.familyNew} (id=${family.id})`)
    if (!DRY_RUN) {
      const { error: upErr } = await supabase.from('global_lens_families').update(familyUpdate).eq('id', family.id)
      if (upErr) throw upErr
    }

    const { data: offers, error: offersError } = await supabase
      .from('global_lens_offers')
      .select('id,canonical_label,raw_label,features')
      .eq('family_id', family.id)

    if (offersError) throw offersError
    console.log(`[fix] ofertas na familia: ${offers?.length || 0}`)

    // Update offers (labels + feature patch)
    const offerPlans = (offers || []).map((offer) => {
      const oldCanonical = offer.canonical_label || offer.raw_label || ''
      const oldRaw = offer.raw_label || ''
      const nextCanonical = replacePrefix(oldCanonical, t.offerPrefixOld, t.offerPrefixNew)
      const nextRaw = replacePrefix(oldRaw, t.offerPrefixOld, t.offerPrefixNew)
      const nextFeatures = mergeFeatures(offer.features || {}, t.offerFeaturePatch)
      return {
        id: offer.id,
        oldCanonical,
        nextCanonical,
        oldRaw,
        nextRaw,
        nextFeatures,
      }
    })

    const changes = offerPlans.filter(
      (p) => p.oldCanonical !== p.nextCanonical || p.oldRaw !== p.nextRaw
    )
    console.log(`[fix] ofertas com rename: ${changes.length}`)

    if (!DRY_RUN) {
      for (const plan of offerPlans) {
        const { error: upErr } = await supabase
          .from('global_lens_offers')
          .update({
            canonical_label: plan.nextCanonical || null,
            raw_label: plan.nextRaw || null,
            features: plan.nextFeatures,
          })
          .eq('id', plan.id)
        if (upErr) throw upErr
      }
    }

    // Update tenant display_name for store activation (only if it's still the default old label)
    if (activationId) {
      let updatedTenant = 0
      if (!DRY_RUN) {
        for (const plan of offerPlans) {
          const { data: tenantRow, error: tenantErr } = await supabase
            .from('tenant_commercial_offers')
            .select('id,display_name')
            .eq('activation_id', activationId)
            .eq('global_offer_id', plan.id)
            .maybeSingle()

          if (tenantErr) throw tenantErr
          if (!tenantRow) continue

          const displayName = tenantRow.display_name
          const isDefault = displayName == null || displayName === plan.oldCanonical || displayName === plan.oldRaw
          if (!isDefault) continue

          const { error: updErr } = await supabase
            .from('tenant_commercial_offers')
            .update({ display_name: plan.nextCanonical || null })
            .eq('id', tenantRow.id)

          if (updErr) throw updErr
          updatedTenant += 1
        }
      }
      console.log(`[fix] tenant display_name atualizados (store=${STORE_ID}): ${updatedTenant}`)
    }
  }

  console.log('[fix] concluido')
}

main().catch((error) => {
  console.error('Falha no fix:', error?.message || error)
  process.exit(1)
})

