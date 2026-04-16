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
const pagesArg = args.find((arg) => arg.startsWith('--pages='))?.split('=').slice(1).join('=')
const pages = pagesArg ? pagesArg.split(',').map((s) => s.trim()) : ['Pagina 17', 'Pagina 18', 'Pagina 19']

if (!versionId) {
  console.error('Uso: node scripts/annotate_optilab_customizations_fit_eyecode_short.js --version-id=UUID [--pages=\"17,18,19\"] [--commit]')
  process.exit(1)
}

function noAcc(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function ensureObject(value) {
  return value && typeof value === 'object' ? value : {}
}

function pageToRef(p) {
  const s = String(p || '').trim()
  if (s.toLowerCase().startsWith('pagina ')) return `Pagina ${s.split(' ').slice(1).join(' ')}`
  return `Pagina ${s}`
}

async function main() {
  const pageRefs = pages.map(pageToRef)

  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id')
    .eq('version_id', versionId)
  if (famErr) throw famErr
  const familyIds = (families || []).map((f) => f.id)
  if (!familyIds.length) {
    console.log('Nenhuma família encontrada para version_id', versionId)
    return
  }

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,raw_label,features,source_page_reference')
    .in('family_id', familyIds)
    .in('source_page_reference', pageRefs)
  if (offErr) throw offErr

  const targets = (offers || []).filter((o) => {
    const t = noAcc(`${o.canonical_label || ''} ${o.raw_label || ''}`)
    return t.includes('varilux')
  })

  if (!targets.length) {
    console.log('Nenhuma oferta Varilux encontrada nas páginas:', pageRefs.join(', '))
    return
  }

  // Base patch (safe: lives inside offer.features)
  const fitEyecode = (pageRef) => ({
    enabled: true,
    min_fitting_height_mm: 14,
    engraving_code: 'F',
    price_delta: 0,
    notes:
      'Fit Eyecode aparece como opcional (sem custo adicional) e é representado pela gravação da letra \"F\" (ver rodapé/aba). Não cria uma oferta nova; é uma customização.',
    evidence: { source_page_reference: pageRef },
  })

  const short = (pageRef) => ({
    enabled: true,
    min_fitting_height_mm: 14,
    engraving_code: 'S',
    price_delta: 0,
    // Rodapé (p. 17/18/19): short tem adição máxima 3.00 e não está disponível nas solares.
    add_max: 3.0,
    not_available_in_sections: ['solares'],
    notes:
      'Versão short (sem custo adicional) com adição máxima 3.00; não disponível em lentes solares (ver rodapé).',
    evidence: { source_page_reference: pageRef },
  })

  let updated = 0
  for (const o of targets) {
    const feat = ensureObject(o.features)
    const customizations = ensureObject(feat.customizations)
    const pageRef = o.source_page_reference || 'desconhecida'

    const nextCustomizations = { ...customizations }
    if (!nextCustomizations.fit_eyecode) nextCustomizations.fit_eyecode = fitEyecode(pageRef)
    if (!nextCustomizations.short) nextCustomizations.short = short(pageRef)

    const variantKind = noAcc(o.canonical_label || o.raw_label).includes(' short ') || noAcc(o.canonical_label || o.raw_label).includes(' short')
      ? 'short'
      : feat.variant_kind

    const nextFeatures = {
      ...feat,
      customizations: nextCustomizations,
      ...(variantKind ? { variant_kind: variantKind } : {}),
    }

    const changed = JSON.stringify(nextFeatures.customizations) !== JSON.stringify(customizations) || nextFeatures.variant_kind !== feat.variant_kind
    if (!changed) continue

    updated += 1
    console.log('[annotate]', pageRef, o.canonical_label || o.raw_label)
    if (!commit) continue
    const { error: upErr } = await supabase.from('global_lens_offers').update({ features: nextFeatures }).eq('id', o.id)
    if (upErr) throw upErr
  }

  console.log('Resumo:')
  console.log('- Páginas:', pageRefs.join(', '))
  console.log('- Ofertas Varilux alvo:', targets.length)
  console.log('- Ofertas alteradas:', updated)
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

