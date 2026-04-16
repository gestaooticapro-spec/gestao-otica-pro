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
  console.error('Uso: node scripts/annotate_optilab_page17_customizations.js --version-id=UUID [--commit]')
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

async function main() {
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
    .eq('source_page_reference', 'Pagina 17')
  if (offErr) throw offErr

  const targets = (offers || []).filter((o) => {
    const t = noAcc(`${o.canonical_label || ''} ${o.raw_label || ''}`)
    return t.includes('varilux') && t.includes('comfort') && t.includes('digital') && !t.includes('short')
  })

  if (!targets.length) {
    console.log('Nenhuma oferta alvo encontrada em Pagina 17 (Comfort Digital).')
    return
  }

  // Página 17 mostra duas "abas" no topo da tabela:
  // - Fit Eyecode: ALT. MIN 14mm, sem custo adicional (gravação "F")
  // - short: ALT. MIN 14mm, sem custo adicional (gravação "S")
  // Rodapé: versão short possui adição máxima de 3.00 e não disponível nas lentes solares.
  const customizationPatch = {
    customizations: {
      fit_eyecode: {
        enabled: true,
        // a tabela indica "ALT. MIN 14mm" para este modo, sem custo adicional
        min_fitting_height_mm: 14,
        engraving_code: 'F',
        price_delta: 0,
        notes:
          'Fit Eyecode aparece como opcional (sem custo adicional) na página 17. Representa personalização/inscrição, não uma nova oferta com preço próprio.',
        evidence: { source_page_reference: 'Pagina 17' },
      },
      short: {
        enabled: true,
        min_fitting_height_mm: 14,
        engraving_code: 'S',
        price_delta: 0,
        // regra explícita no rodapé (p. 17) e repetida em outras páginas:
        add_max: 3.0,
        not_available_in_sections: ['solares'],
        notes:
          'Versão short (sem custo adicional) com adição máxima 3.00; não disponível em lentes solares (ver rodapé).',
        evidence: { source_page_reference: 'Pagina 17' },
      },
    },
  }

  let updated = 0
  for (const o of targets) {
    const feat = ensureObject(o.features)
    const existingCustomizations = ensureObject(feat.customizations)
    const next = {
      ...feat,
      customizations: {
        ...existingCustomizations,
        ...customizationPatch.customizations,
      },
    }

    updated += 1
    console.log('[annotate]', o.canonical_label || o.raw_label)
    if (!commit) continue
    const { error: upErr } = await supabase.from('global_lens_offers').update({ features: next }).eq('id', o.id)
    if (upErr) throw upErr
  }

  console.log('Resumo:')
  console.log('- Ofertas alvo (p. 17):', targets.length)
  console.log('- Ofertas anotadas:', updated)
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

