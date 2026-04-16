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
const commit = args.includes('--commit')

if (!versionId) {
  console.error('Uso: node scripts/update_varilux_fitting_heights.js --version-id=UUID [--commit]')
  process.exit(1)
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const RULES = [
  { key: 'activities-roadpilot', includes: ['roadpilot'], height: 14 },
  { key: 'activities', includes: ['activities'], height: 18 },
  { key: 'liberty-3-0', includes: ['liberty 3.0'], height: 17 },
  { key: 'liberty-short', includes: ['liberty short'], height: 14 },
  { key: 'liberty', includes: ['liberty'], height: 18, excludes: ['liberty 3.0', 'liberty short'] },
  { key: 'comfort-essilor-fit-eyecode', includes: ['comfort essilor fit eyecode'], height: 14 },
  { key: 'comfort-short-eyecode', includes: ['comfort short eyecode'], height: 14 },
  { key: 'comfort', includes: ['comfort'], height: 17, excludes: ['comfort essilor fit eyecode', 'comfort short eyecode'] },
  { key: 'physio', includes: ['physio'], height: 14 },
  { key: 'xr', includes: ['varilux xr', 'xr pro', 'xr track', 'xr design', 'xr series'], height: 14 },
]

const EXPECTED_LABELS = [
  'Varilux Activities roadpilot',
  'Varilux Activities',
  'Varilux Liberty',
  'Varilux Liberty 3.0',
  'Varilux Liberty short',
  'Varilux Comfort',
  'Varilux Comfort Essilor Fit Eyecode',
  'Varilux Comfort short Eyecode',
  'Varilux Physio',
  'Varilux XR',
]

function matchesRule(label, rule) {
  const hay = normalizeText(label)
  if (!rule.includes.some((needle) => hay.includes(normalizeText(needle)))) return false
  if (rule.excludes && rule.excludes.some((needle) => hay.includes(normalizeText(needle)))) return false
  return true
}

async function main() {
  const { data: families, error: famError } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)

  if (famError) throw famError

  const familyIds = (families || []).map((f) => f.id)
  if (!familyIds.length) {
    console.log('Nenhuma família encontrada para version_id', versionId)
    return
  }

  const { data: offers, error: offerError } = await supabase
    .from('global_lens_offers')
    .select('id,raw_label,canonical_label,features,family_id')
    .in('family_id', familyIds)

  if (offerError) throw offerError

  const matchedOffers = []
  const missingExactLabels = []

  for (const expected of EXPECTED_LABELS) {
    const exact = (offers || []).filter((offer) =>
      normalizeText(`${offer.raw_label || ''} ${offer.canonical_label || ''}`).includes(normalizeText(expected))
    )
    if (!exact.length) missingExactLabels.push(expected)
  }

  for (const offer of offers || []) {
    const label = `${offer.raw_label || ''} ${offer.canonical_label || ''}`
    const rule = RULES.find((entry) => matchesRule(label, entry))
    if (!rule) continue

    const currentHeight =
      offer.features && typeof offer.features === 'object' ? offer.features.min_fitting_height ?? null : null

    matchedOffers.push({
      id: offer.id,
      label: offer.canonical_label || offer.raw_label,
      rule: rule.key,
      oldHeight: currentHeight,
      newHeight: rule.height,
      changed: currentHeight !== rule.height,
    })

    if (!commit || currentHeight === rule.height) continue

    const nextFeatures = {
      ...(offer.features || {}),
      min_fitting_height: rule.height,
    }

    const { error: updateError } = await supabase
      .from('global_lens_offers')
      .update({ features: nextFeatures })
      .eq('id', offer.id)

    if (updateError) throw updateError
  }

  console.log('Resumo da correção de altura:')
  console.log(`- Ofertas encontradas: ${matchedOffers.length}`)
  console.log(`- Com alteração pendente/aplicada: ${matchedOffers.filter((item) => item.changed).length}`)
  for (const item of matchedOffers.slice(0, 40)) {
    console.log(
      `  - [${item.rule}] ${item.label} | atual=${item.oldHeight ?? 'null'} | alvo=${item.newHeight}${item.changed ? '' : ' (ok)'}`
    )
  }
  if (matchedOffers.length > 40) {
    console.log(`  ... ${matchedOffers.length - 40} ofertas adicionais omitidas`)
  }

  console.log('Nomes exatos não encontrados no catálogo:')
  for (const label of missingExactLabels) {
    console.log(`- ${label}`)
  }

  if (commit) {
    console.log('Atualização de alturas concluída.')
  } else {
    console.log('Modo seco. Use --commit para gravar as alterações.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
