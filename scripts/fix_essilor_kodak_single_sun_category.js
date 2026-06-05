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
  '99497d03-50bf-46b7-a7ab-8cb19e80db5a'
const commit = args.includes('--commit')

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

async function main() {
  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
    .eq('nome', 'Kodak')
  if (famErr) throw famErr

  const kodak = families?.[0]
  if (!kodak) {
    console.log('Familia Kodak nao encontrada na Essilor.')
    return
  }

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,raw_label,clinical_category,features,source_page_reference')
    .eq('family_id', kodak.id)
  if (offErr) throw offErr

  const targets = (offers || []).filter((offer) => {
    const label = normalizeText(`${offer.canonical_label || ''} ${offer.raw_label || ''}`)
    return (
      label.includes('kodak single sun') &&
      (label.includes('solar') || label.includes('coloracao')) &&
      offer.clinical_category !== 'plana_solar'
    )
  })

  for (const offer of targets) {
    const label = offer.canonical_label || offer.raw_label
    console.log('[single-sun:plana_solar]', offer.source_page_reference, label)
    if (!commit) continue

    const features = ensureObject(offer.features)
    const nextFeatures = {
      ...features,
      solar: true,
      sun: true,
      ...(normalizeText(label).includes('coloracao') ? { coloracao: true } : {}),
    }

    const { error } = await supabase
      .from('global_lens_offers')
      .update({ clinical_category: 'plana_solar', features: nextFeatures })
      .eq('id', offer.id)
    if (error) throw error
  }

  console.log('Resumo:')
  console.log('- Ofertas Kodak avaliadas:', (offers || []).length)
  console.log('- Kodak Single Sun ajustadas para plana_solar:', targets.length)
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
