import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const commit = process.argv.includes('--commit')
const VISION_VERSION_ID = 'f6f01d3d-eba4-476c-a0e1-a481fac7d338'
const FAMILY_NAME = 'Vision Drive'

async function main() {
  const { data: family, error: familyError } = await supabase
    .from('global_lens_families')
    .select('id,nome,clinical_category,tags_uso,tags_beneficios')
    .eq('version_id', VISION_VERSION_ID)
    .eq('nome', FAMILY_NAME)
    .single()

  if (familyError) throw familyError

  const { data: offers, error: offersError } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,clinical_category,features')
    .eq('family_id', family.id)

  if (offersError) throw offersError

  const familyNeedsPatch = family.clinical_category !== 'ocupacional'
  const offerPatches = (offers || []).filter((offer) => offer.clinical_category !== 'ocupacional')

  console.log('Resumo:')
  console.log('- Familia:', family.nome)
  console.log('- Categoria atual da familia:', family.clinical_category)
  console.log('- Atualizar familia para ocupacional:', familyNeedsPatch ? 'sim' : 'nao')
  console.log('- Ofertas analisadas:', offers?.length || 0)
  console.log('- Ofertas a atualizar para ocupacional:', offerPatches.length)
  console.log('- Evidencia: Vision Drive espelha semanticamente Haytek Drive, que esta como ocupacional.')

  for (const offer of offerPatches.slice(0, 20)) {
    console.log('[offer]', offer.canonical_label, '|', offer.clinical_category, '=> ocupacional')
  }
  if (offerPatches.length > 20) console.log(`... ${offerPatches.length - 20} ofertas omitidas no preview`)

  if (!commit) {
    console.log('Modo seco. Use --commit para aplicar.')
    return
  }

  if (familyNeedsPatch) {
    const { error } = await supabase
      .from('global_lens_families')
      .update({
        clinical_category: 'ocupacional',
        tags_uso: ['ocupacional', 'escritorio', 'dirigir'],
        tags_beneficios: ['campo_intermediario', 'conforto_visual'],
      })
      .eq('id', family.id)
    if (error) throw error
  }

  for (const offer of offerPatches) {
    const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
    const { error } = await supabase
      .from('global_lens_offers')
      .update({
        clinical_category: 'ocupacional',
        features: {
          ...features,
          semantic_source: 'Vision Drive alinhada a Haytek Drive apos revisao Haytek 2025-09',
        },
      })
      .eq('id', offer.id)
    if (error) throw error
  }

  console.log('Aplicado.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
