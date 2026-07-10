import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const commit = process.argv.includes('--commit')
const HAYTEK_VERSION_ID = '4588be79-8d45-4e61-b39f-47f2e401f331'

const FAMILY_PROFILES = {
  'Haytek Pro ID': {
    commercial_summary: 'Progressiva Freeform individualizada topo de linha, indicada para rotina multifocal de alta exigencia.',
    recommendation_notes:
      'Priorizar quando o cliente precisa de multifocal premium, maior personalizacao e melhor desempenho visual em uso diario.',
  },
  'Haytek Top': {
    commercial_summary: 'Progressiva Freeform de alta tecnologia para uso diario com boa amplitude de campo e conforto visual.',
    recommendation_notes: 'Indicar como alternativa premium abaixo da Pro ID, preservando foco em nitidez, campo e adaptacao.',
  },
  'Haytek Smart': {
    commercial_summary: 'Progressiva Freeform personalizada de perfil versatil para rotina geral.',
    recommendation_notes: 'Boa indicacao quando o cliente busca equilibrio entre tecnologia, conforto e custo-beneficio.',
  },
  'Haytek Light': {
    commercial_summary: 'Progressiva Freeform equilibrada, com grade mais restritiva e proposta de bom custo-beneficio.',
    recommendation_notes: 'Validar grau com atencao porque a grade e mais restritiva que Smart/Top/Pro ID.',
  },
  'Haytek Go!': {
    commercial_summary: 'Progressiva Freeform de entrada para primeira multifocal ou rotina geral.',
    recommendation_notes: 'Indicar quando preco e adaptacao inicial forem mais importantes que maxima personalizacao.',
  },
  'Haytek Drive': {
    commercial_summary: 'Lente ocupacional Freeform voltada a tarefas de perto/intermediario e contexto de direcao.',
    recommendation_notes: 'Nao tratar como multifocal de uso geral; validar a necessidade ocupacional e altura minima de montagem.',
  },
  'Haytek Office': {
    commercial_summary: 'Lente ocupacional Freeform para escritorio, telas, leitura e campo intermediario.',
    recommendation_notes: 'Indicar para uso interno/perto-intermediario; nao substituir multifocal de uso geral.',
  },
  'Haytek Easy': {
    commercial_summary: 'Visao simples especial Freeform com apoio acomodativo baixo para telas, leitura e fadiga visual.',
    recommendation_notes:
      'Classificar como visao simples especial, nao ocupacional. Preservar add baixo e perfil de apoio visual/fadiga.',
  },
  'Haytek Visao Simples ID': {
    commercial_summary: 'Visao simples Freeform individualizada para uso diario com maior precisao e personalizacao.',
    recommendation_notes: 'Indicar quando a visao simples precisa de melhor acabamento tecnico/personalizacao.',
  },
  'Haytek Visao Simples': {
    commercial_summary: 'Visao simples Freeform para uso diario.',
    recommendation_notes: 'Indicar como visao simples surfacada/freeform; sem adicao, corredor ou altura minima.',
  },
  'Haytek VS Freeform': {
    commercial_summary: 'Visao simples Freeform associada ao complemento Transitions Gen S da pagina 9.',
    recommendation_notes: 'Tratar como visao simples fotossensivel; ignorar adicao se vier da pagina 9.',
  },
  'Haytek Visao Simples Acabadas': {
    commercial_summary: 'Familia de lentes prontas/acabadas de visao simples.',
    recommendation_notes:
      'Tratar como pronta entrega/estoque. Validar faixa de esferico, cilindrico e diametro da matriz de acabadas.',
  },
  'Haytek Progressivas Acabadas': {
    commercial_summary: 'Familia de progressivas prontas/acabadas com preco unico por par.',
    recommendation_notes:
      'Tratar como progressiva pronta. A fonte informa add e diametro, mas nao informa cilindro nas progressivas acabadas.',
  },
}

const TREATMENT_PROFILES = {
  'AR Verde': {
    type: 'antirreflexo',
    benefit_tags: ['reducao_reflexos', 'conforto_visual'],
    recommendation_notes:
      'Antirreflexo com reflexo residual verde. Nao inferir beneficios premium ou filtro de luz azul a partir do nome.',
  },
  'AR Azul': {
    type: 'antirreflexo',
    benefit_tags: ['reducao_reflexos', 'conforto_visual'],
    recommendation_notes:
      'Antirreflexo com reflexo residual azul. Nao confundir com variante Filtro Azul da lente sem evidencia adicional.',
  },
  'AR Premium Verde': {
    type: 'antirreflexo_premium',
    benefit_tags: ['reducao_reflexos', 'conforto_visual', 'acabamento_premium'],
    recommendation_notes:
      'Antirreflexo premium com reflexo residual verde. Manter semantica conservadora sem prometer propriedades nao descritas na fonte.',
  },
  'AR Premium Azul': {
    type: 'antirreflexo_premium',
    benefit_tags: ['reducao_reflexos', 'conforto_visual', 'acabamento_premium'],
    recommendation_notes:
      'Antirreflexo premium com reflexo residual azul. Nao confundir com variante Filtro Azul da lente sem evidencia adicional.',
  },
}

function sameArray(a, b) {
  return JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort())
}

function sameProfile(existing, next) {
  return (
    sameArray(existing?.usage_tags, next.usage_tags) &&
    sameArray(existing?.benefit_tags, next.benefit_tags) &&
    String(existing?.commercial_summary || '') === String(next.commercial_summary || '') &&
    String(existing?.recommendation_notes || '') === String(next.recommendation_notes || '')
  )
}

async function main() {
  const { data: families, error: familiesError } = await supabase
    .from('global_lens_families')
    .select('id,nome,tags_uso,tags_beneficios')
    .eq('version_id', HAYTEK_VERSION_ID)
  if (familiesError) throw familiesError

  const { data: profiles, error: profilesError } = await supabase
    .from('global_usage_profiles')
    .select('id,family_id,profile_scope,usage_tags,benefit_tags,commercial_summary,recommendation_notes')
    .in(
      'family_id',
      (families || []).map((family) => family.id),
    )
    .eq('profile_scope', 'family')
  if (profilesError) throw profilesError

  const profileByFamilyId = new Map((profiles || []).map((profile) => [profile.family_id, profile]))
  let profileChanges = 0

  for (const family of families || []) {
    const template = FAMILY_PROFILES[family.nome]
    if (!template) continue
    const row = {
      family_id: family.id,
      offer_id: null,
      profile_scope: 'family',
      usage_tags: family.tags_uso || [],
      benefit_tags: family.tags_beneficios || [],
      commercial_summary: template.commercial_summary,
      recommendation_notes: template.recommendation_notes,
      source_page_reference: 'Haytek Setembro 2025 - manifesto revisado',
    }
    const existing = profileByFamilyId.get(family.id)
    if (existing && sameProfile(existing, row)) continue
    profileChanges += 1
    console.log(existing ? '[profile:update]' : '[profile:insert]', family.nome)
    if (commit) {
      const query = existing
        ? supabase.from('global_usage_profiles').update(row).eq('id', existing.id)
        : supabase.from('global_usage_profiles').insert(row)
      const { error } = await query
      if (error) throw error
    }
  }

  const { data: treatments, error: treatmentsError } = await supabase
    .from('global_treatments')
    .select('id,nome,tipo,tags,features')
    .eq('version_id', HAYTEK_VERSION_ID)
  if (treatmentsError) throw treatmentsError

  let treatmentChanges = 0
  for (const treatment of treatments || []) {
    const template = TREATMENT_PROFILES[treatment.nome]
    if (!template) continue
    const features = treatment.features && typeof treatment.features === 'object' ? treatment.features : {}
    const semanticProfile = {
      usage_tags: ['tratamento_lente'],
      benefit_tags: template.benefit_tags,
      commercial_summary: `${treatment.nome}: ${template.recommendation_notes}`,
      recommendation_notes: template.recommendation_notes,
      source: 'Haytek Setembro 2025 - semantica conservadora por nome da coluna',
    }
    const nextFeatures = { ...features, semantic_profile: semanticProfile }
    const current = features.semantic_profile || {}
    if (
      sameArray(current.usage_tags, semanticProfile.usage_tags) &&
      sameArray(current.benefit_tags, semanticProfile.benefit_tags) &&
      current.commercial_summary === semanticProfile.commercial_summary &&
      current.recommendation_notes === semanticProfile.recommendation_notes
    )
      continue
    treatmentChanges += 1
    console.log('[treatment:update]', treatment.nome)
    if (commit) {
      const { error } = await supabase.from('global_treatments').update({ features: nextFeatures }).eq('id', treatment.id)
      if (error) throw error
    }
  }

  console.log('Resumo:')
  console.log('- Perfis de familia Haytek:', profileChanges)
  console.log('- Semantic profiles de tratamentos Haytek:', treatmentChanges)
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
