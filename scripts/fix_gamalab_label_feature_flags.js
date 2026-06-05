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

function normalizeText(value) {
  return String(value || '')
    .replace(/\uFB02/g, 'fl')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function derivePatch(offer) {
  const label = normalizeText(`${offer.raw_label || ''} ${offer.canonical_label || ''}`)
  const features = ensureObject(offer.features)
  const patch = {}

  if (label.includes('fotossensivel') && features.foto !== true) {
    patch.foto = true
  }

  if (label.includes('photofusion') && features.photofusion !== true) {
    patch.photofusion = true
    if (features.foto !== true && patch.foto !== true) patch.foto = true
  }

  if (label.includes('sensity') && features.sensity !== true) {
    patch.sensity = true
    if (features.foto !== true && patch.foto !== true) patch.foto = true
  }

  if (label.includes('acclimates') && features.acclimates !== true) {
    patch.acclimates = true
    if (features.foto !== true && patch.foto !== true) patch.foto = true
  }

  if (label.includes('transitions') && features.transitions !== true) {
    patch.transitions = true
    if (features.foto !== true && patch.foto !== true) patch.foto = true
  }

  if ((label.includes('blue uv') || label.includes('blueuv')) && features.blue_uv !== true) {
    patch.blue_uv = true
  }

  const explicitlyWithoutAr = label.includes('sem antirreflexo') || label.includes('sem antirrefl')
  const hasAr = !explicitlyWithoutAr && (label.includes('antirreflexo') || label.includes('antirrefl'))
  if (hasAr && features.antirreflexo !== true) {
    patch.antirreflexo = true
  }
  if (hasAr && label.includes('externo') && features.antirreflexo_externo !== true) {
    patch.antirreflexo_externo = true
  }

  if (label.includes('polarizado') && features.polarizado !== true) {
    patch.polarizado = true
  }

  if (label.includes('espelhado') && features.espelhado !== true) {
    patch.espelhado = true
    if (features.espelhada !== true) patch.espelhada = true
  }

  return patch
}

async function main() {
  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
  if (famErr) throw famErr

  const familyIds = (families || []).map((family) => family.id)
  const familyById = new Map((families || []).map((family) => [family.id, family.nome]))

  if (!familyIds.length) {
    console.log('Nenhuma familia encontrada para version_id', versionId)
    return
  }

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,raw_label,canonical_label,features,source_page_reference')
    .in('family_id', familyIds)
  if (offErr) throw offErr

  const changes = []
  for (const offer of offers || []) {
    const patch = derivePatch(offer)
    if (!Object.keys(patch).length) continue

    const nextFeatures = {
      ...ensureObject(offer.features),
      ...patch,
    }

    changes.push({
      offer,
      patch,
      nextFeatures,
    })
  }

  for (const change of changes) {
    const label = change.offer.canonical_label || change.offer.raw_label
    console.log(
      `[flag] ${change.offer.source_page_reference} | ${familyById.get(change.offer.family_id)} | ${label} | ${JSON.stringify(
        change.patch,
      )}`,
    )

    if (!commit) continue
    const { error: upErr } = await supabase
      .from('global_lens_offers')
      .update({ features: change.nextFeatures })
      .eq('id', change.offer.id)
    if (upErr) throw upErr
  }

  console.log('Resumo:')
  console.log('- Ofertas avaliadas:', (offers || []).length)
  console.log('- Ofertas com flags corrigidas:', changes.length)
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
