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

const apply = process.argv.includes('--apply')

function noAcc(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

async function main() {
  const { data: families, error: familyError } = await supabase
    .from('global_lens_families')
    .select('id,nome,clinical_category,design,tags_uso,tags_beneficios')

  if (familyError) throw familyError

  const dynamicRelax = (families || []).find((family) => {
    const name = noAcc(family.nome)
    return name.includes('dynamic') && name.includes('relax')
  })

  if (!dynamicRelax) {
    console.log('Dynamic Relax nao encontrada.')
    return
  }

  const { data: offers, error: offersError } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,raw_label,clinical_category')
    .eq('family_id', dynamicRelax.id)

  if (offersError) throw offersError

  const { data: profiles, error: profilesError } = await supabase
    .from('global_usage_profiles')
    .select('id,usage_tags,benefit_tags,commercial_summary,recommendation_notes')
    .eq('family_id', dynamicRelax.id)
    .is('offer_id', null)

  if (profilesError) throw profilesError

  const nextFamily = {
    clinical_category: 'visao_simples',
    design: 'Visao simples especial com suporte acomodativo',
    tags_uso: ['computador', 'smartphone', 'leitura', 'uso_digital', 'uso_proximo'],
    tags_beneficios: [
      'reducao_fadiga_visual',
      'conforto_proximo',
      'suporte_acomodativo',
      'conforto_visual',
      'nitidez',
    ],
  }

  const nextProfile = {
    usage_tags: ['computador', 'smartphone', 'leitura', 'uso_digital', 'uso_proximo'],
    benefit_tags: [
      'reducao_fadiga_visual',
      'conforto_proximo',
      'suporte_acomodativo',
      'conforto_visual',
      'nitidez',
    ],
    commercial_summary:
      'Lente de visao simples especial com suporte acomodativo para conforto digital em leitura, telas e uso proximo.',
    recommendation_notes:
      'Para pacientes com fadiga visual em telas, leitura prolongada ou necessidade de apoio acomodativo sem classificar como lente ocupacional.',
  }

  console.log('Dynamic Relax atual:', {
    id: dynamicRelax.id,
    nome: dynamicRelax.nome,
    clinical_category: dynamicRelax.clinical_category,
    design: dynamicRelax.design,
    offers: offers?.length || 0,
    profiles: profiles?.length || 0,
  })
  console.log('Nova categoria:', nextFamily.clinical_category)
  console.log(apply ? 'Aplicando correcoes...' : 'Dry-run. Use --apply para gravar.')

  if (!apply) return

  const { error: updateFamilyError } = await supabase
    .from('global_lens_families')
    .update(nextFamily)
    .eq('id', dynamicRelax.id)

  if (updateFamilyError) throw updateFamilyError

  const { error: updateOffersError } = await supabase
    .from('global_lens_offers')
    .update({ clinical_category: 'visao_simples' })
    .eq('family_id', dynamicRelax.id)

  if (updateOffersError) throw updateOffersError

  for (const profile of profiles || []) {
    const { error: updateProfileError } = await supabase
      .from('global_usage_profiles')
      .update(nextProfile)
      .eq('id', profile.id)

    if (updateProfileError) throw updateProfileError
  }

  console.log('Correcoes aplicadas.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
