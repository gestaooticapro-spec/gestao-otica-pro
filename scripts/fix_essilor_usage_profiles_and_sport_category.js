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

const PROFILE_BY_FAMILY = {
  'Varilux Comfort': {
    usage_tags: ['primeira_multifocal', 'uso_diario', 'rotina_basica', 'adaptacao_facilitada'],
    benefit_tags: ['conforto_visual', 'adaptacao_facil', 'visao_progressiva', 'custo_beneficio'],
    commercial_summary:
      'Multifocal tradicional Essilor para rotina diaria, indicada quando a prioridade e adaptacao simples e custo mais acessivel.',
    recommendation_notes:
      'Boa opcao de entrada em multifocais Varilux. Nao posicionar como topo tecnologico; usar quando o caso pede progressiva confiavel e budget moderado.',
  },
  'Varilux Comfort Max': {
    usage_tags: ['multifocal_digital', 'uso_diario', 'rotina_basica', 'adaptacao_facilitada'],
    benefit_tags: ['conforto_visual', 'adaptacao_facil', 'campo_visual_equilibrado', 'visao_progressiva'],
    commercial_summary:
      'Multifocal digital Comfort Max para uso diario com foco em conforto e adaptacao facilitada.',
    recommendation_notes:
      'Sobe um degrau em relacao ao Comfort tradicional por ser digital, mas fica abaixo das linhas premium como XR/Physio.',
  },
  'Varilux Digitime.mid': {
    usage_tags: ['ocupacional', 'computador', 'intermediario', 'perto', 'multiplas_telas'],
    benefit_tags: ['conforto_intermediario', 'conforto_perto', 'postura_visual', 'fadiga_visual'],
    commercial_summary:
      'Lente ocupacional para usuarios de multifocal com rotina intensa em telas e maior demanda de visao intermediaria.',
    recommendation_notes:
      'Indicada para ambiente interno, computador e tarefas sobre mesa. Nao tratar como multifocal principal para todas as distancias.',
  },
  'Varilux Digitime.near': {
    usage_tags: ['ocupacional', 'perto', 'intermediario_curto', 'multiplas_telas', 'leitura'],
    benefit_tags: ['conforto_perto', 'ultra_near_vision', 'postura_visual', 'fadiga_visual'],
    commercial_summary:
      'Lente ocupacional para perto e intermediario curto, voltada a leitura, celular/tablet e tarefas que exigem precisao.',
    recommendation_notes:
      'Preferir quando a queixa principal e perto/intermediario curto. Nao vender como progressiva completa para longe.',
  },
  'Varilux Liberty': {
    usage_tags: ['multifocal', 'uso_diario', 'entrada_varilux', 'rotina_basica'],
    benefit_tags: ['visao_progressiva', 'adaptacao', 'custo_beneficio', 'conforto_visual'],
    commercial_summary:
      'Multifocal tradicional Varilux de entrada, adequada para rotina diaria com foco em acessibilidade.',
    recommendation_notes:
      'Opcao economica dentro de Varilux. Usar quando budget pesa mais que tecnologia/campo visual premium.',
  },
  'Varilux Liberty 3.0': {
    usage_tags: ['multifocal_digital', 'uso_diario', 'entrada_varilux', 'rotina_basica'],
    benefit_tags: ['visao_progressiva', 'adaptacao', 'conforto_visual', 'custo_beneficio'],
    commercial_summary:
      'Versao digital da Liberty para rotina diaria, mantendo proposta acessivel dentro de Varilux.',
    recommendation_notes:
      'Boa ponte entre Liberty tradicional e Comfort/Physio. Nao posicionar acima de XR/Physio.',
  },
  'Varilux Physio': {
    usage_tags: ['multifocal_digital', 'uso_diario', 'rotina_dinamica', 'qualidade_optica'],
    benefit_tags: ['nitidez', 'campo_visual', 'conforto_visual', 'adaptacao', 'qualidade_optica'],
    commercial_summary:
      'Multifocal digital Varilux intermediaria/alta, com foco em nitidez e conforto para rotina dinamica.',
    recommendation_notes:
      'Indicar quando o cliente busca qualidade superior a Comfort/Liberty, mas sem chegar ao posicionamento premium da XR.',
  },
  'Varilux Roadpilot': {
    usage_tags: ['direcao', 'ocupacional_especial', 'longe', 'intermediario', 'uso_externo'],
    benefit_tags: ['conforto_ao_dirigir', 'campo_visual_para_direcao', 'contraste', 'seguranca_visual'],
    commercial_summary:
      'Lente Varilux Activities voltada a direcao, com desenho especifico para demandas de dirigir.',
    recommendation_notes:
      'Usar para queixa de direcao/estrada. Nao confundir com Digitime, que e ocupacional de perto/intermediario interno.',
  },
  'Varilux Sport': {
    usage_tags: ['esporte', 'uso_externo', 'rotina_dinamica', 'curva_base', 'multifocal_especial'],
    benefit_tags: ['conforto_em_movimento', 'campo_visual_esportivo', 'adaptacao_em_armacoes_curvas', 'visao_dinamica'],
    commercial_summary:
      'Lente Varilux Activities para esporte/armacoes curvas, incluindo versao Sport wrap.',
    recommendation_notes:
      'Tratar como multifocal especial esportiva, nao como ocupacional. Indicada quando o uso principal envolve esporte ou armacao curva.',
  },
  'VS Essilor SurfaÃ§ada': {
    usage_tags: ['visao_simples', 'uso_diario', 'surfacada', 'grau_personalizado'],
    benefit_tags: ['correcao_visual', 'ampla_disponibilidade', 'tratamentos_essilor'],
    commercial_summary:
      'Visao simples surfaÃ§ada Essilor para receitas que exigem fabricacao/laboratorio e combinacoes de material/tratamento.',
    recommendation_notes:
      'Usar para receita de visao simples quando a lente pronta nao atende ou quando o material/tratamento desejado exige surfacada.',
  },
}

function sameArray(a, b) {
  return JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort())
}

function sameProfile(existing, next) {
  return (
    sameArray(existing.usage_tags, next.usage_tags) &&
    sameArray(existing.benefit_tags, next.benefit_tags) &&
    String(existing.commercial_summary || '') === String(next.commercial_summary || '') &&
    String(existing.recommendation_notes || '') === String(next.recommendation_notes || '') &&
    String(existing.source_page_reference || '') === String(next.source_page_reference || '')
  )
}

function needsFamilyPatch(family, profile) {
  return !sameArray(family.tags_uso, profile.usage_tags) || !sameArray(family.tags_beneficios, profile.benefit_tags)
}

async function main() {
  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome,tags_uso,tags_beneficios,clinical_category')
    .eq('version_id', versionId)
  if (famErr) throw famErr

  const familyByName = new Map((families || []).map((family) => [family.nome, family]))
  const targetFamilyIds = Object.keys(PROFILE_BY_FAMILY)
    .map((name) => familyByName.get(name)?.id)
    .filter(Boolean)

  const { data: existingProfiles, error: profErr } = await supabase
    .from('global_usage_profiles')
    .select('id,family_id,profile_scope,usage_tags,benefit_tags,commercial_summary,recommendation_notes,source_page_reference')
    .in('family_id', targetFamilyIds)
    .eq('profile_scope', 'family')
  if (profErr) throw profErr

  const profileByFamilyId = new Map((existingProfiles || []).map((profile) => [profile.family_id, profile]))
  let profileInserts = 0
  let profileUpdates = 0
  let familyUpdates = 0

  for (const [name, profile] of Object.entries(PROFILE_BY_FAMILY)) {
    const family = familyByName.get(name)
    if (!family) {
      console.log('[skip] familia nao encontrada:', name)
      continue
    }

    const existing = profileByFamilyId.get(family.id)
    const profileRow = {
      family_id: family.id,
      offer_id: null,
      profile_scope: 'family',
      usage_tags: profile.usage_tags,
      benefit_tags: profile.benefit_tags,
      commercial_summary: profile.commercial_summary,
      recommendation_notes: profile.recommendation_notes,
      source_page_reference: 'Essilor Abril 2026',
    }

    if (existing && !sameProfile(existing, profileRow)) {
      profileUpdates += 1
      console.log('[profile:update]', name)
      if (commit) {
        const { error } = await supabase.from('global_usage_profiles').update(profileRow).eq('id', existing.id)
        if (error) throw error
      }
    } else if (!existing) {
      profileInserts += 1
      console.log('[profile:insert]', name)
      if (commit) {
        const { error } = await supabase.from('global_usage_profiles').insert(profileRow)
        if (error) throw error
      }
    }

    const nextFamilyPatch = {}
    if (needsFamilyPatch(family, profile)) {
      nextFamilyPatch.tags_uso = profile.usage_tags
      nextFamilyPatch.tags_beneficios = profile.benefit_tags
    }
    if (name === 'Varilux Sport' && family.clinical_category !== 'multifocal') {
      nextFamilyPatch.clinical_category = 'multifocal'
    }

    if (Object.keys(nextFamilyPatch).length) {
      familyUpdates += 1
      console.log('[family:update]', name, JSON.stringify(nextFamilyPatch))
      if (commit) {
        const { error } = await supabase
          .from('global_lens_families')
          .update(nextFamilyPatch)
          .eq('id', family.id)
        if (error) throw error
      }
    }
  }

  const sportFamily = familyByName.get('Varilux Sport')
  let sportOfferUpdates = 0
  if (sportFamily) {
    const { data: sportOffers, error: offerErr } = await supabase
      .from('global_lens_offers')
      .select('id,canonical_label,raw_label,clinical_category,features')
      .eq('family_id', sportFamily.id)
      .neq('clinical_category', 'multifocal')
    if (offerErr) throw offerErr
    sportOfferUpdates = (sportOffers || []).length
    for (const offer of sportOffers || []) {
      const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
      console.log('[sport:multifocal]', offer.canonical_label || offer.raw_label)
      if (commit) {
        const { error } = await supabase
          .from('global_lens_offers')
          .update({
            clinical_category: 'multifocal',
            features: { ...features, sport: true, multifocal_especial: true },
          })
          .eq('id', offer.id)
        if (error) throw error
      }
    }
  }

  console.log('Resumo:')
  console.log('- Perfis inseridos:', profileInserts)
  console.log('- Perfis atualizados:', profileUpdates)
  console.log('- Familias com tags atualizadas:', familyUpdates)
  console.log('- Ofertas Varilux Sport ajustadas para multifocal:', sportOfferUpdates)
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

