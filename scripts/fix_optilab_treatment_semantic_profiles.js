import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const commit = process.argv.includes('--commit')
const OPTILAB_VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078'

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function classify(treatment) {
  const name = normalize(treatment.nome)
  const type = normalize(treatment.tipo)
  const section = normalize(treatment.features?.service_section)

  if (type.includes('promocao')) {
    return {
      semantic_type: 'programa_comercial',
      usage_tags: ['promocao', 'programa_comercial'],
      benefit_tags: ['condicao_comercial'],
      commercial_summary: `${treatment.nome}: promocao/programa comercial da tabela Optilab.`,
      recommendation_notes: 'Nao tratar como beneficio optico da lente; usar apenas em regras comerciais/preco.',
    }
  }

  if (type.includes('produto')) {
    return {
      semantic_type: 'produto_auxiliar',
      usage_tags: ['produto_auxiliar'],
      benefit_tags: ['apoio_operacional'],
      commercial_summary: `${treatment.nome}: produto auxiliar listado na pagina de servicos/produtos Optilab.`,
      recommendation_notes: 'Nao usar como tratamento de lente no motor clinico.',
    }
  }

  if (type.includes('coloracao')) {
    const solar = name.includes('solar')
    const degrade = name.includes('degrade')
    return {
      semantic_type: solar ? 'coloracao_solar' : 'coloracao',
      usage_tags: ['coloracao', solar ? 'uso_externo' : 'estetica'].filter(Boolean),
      benefit_tags: [solar ? 'controle_luminosidade' : 'personalizacao_estetica', degrade ? 'efeito_degrade' : null].filter(
        Boolean,
      ),
      commercial_summary: `${treatment.nome}: servico de coloracao listado pela Optilab.`,
      recommendation_notes: 'Usar como acabamento/coloracao comercial. Nao altera categoria clinica base da lente.',
    }
  }

  if (type.includes('antirreflexo')) {
    const optifog = name.includes('optifog')
    const vertClair = name.includes('vert clair')
    return {
      semantic_type: optifog ? 'antirreflexo_antiembacante' : 'antirreflexo',
      usage_tags: ['tratamento_lente', 'antirreflexo'],
      benefit_tags: ['reducao_reflexos', 'conforto_visual', optifog ? 'antiembacante' : null, vertClair ? 'linha_vert_clair' : null].filter(
        Boolean,
      ),
      commercial_summary: `${treatment.nome}: tratamento antirreflexo da tabela Optilab.`,
      recommendation_notes:
        'Usar como tratamento/acabamento de lente. Beneficios especificos devem respeitar o nome do tratamento e a oferta compativel.',
    }
  }

  if (type.includes('revestimento') || name.includes('verniz')) {
    return {
      semantic_type: 'revestimento',
      usage_tags: ['revestimento', 'tratamento_lente'],
      benefit_tags: ['protecao_superficie'],
      commercial_summary: `${treatment.nome}: revestimento/verniz listado pela Optilab.`,
      recommendation_notes: 'Tratar como acabamento de superficie, nao como familia de lente.',
    }
  }

  if (section.includes('surfacagem')) {
    return {
      semantic_type: 'servico_surfacagem',
      usage_tags: ['servico_laboratorio', 'surfacagem'],
      benefit_tags: ['execucao_laboratorio'],
      commercial_summary: `${treatment.nome}: servico de surfacagem listado pela Optilab.`,
      recommendation_notes: 'Nao usar como beneficio optico no motor clinico; usar em modelagem comercial/operacional.',
    }
  }

  if (section.includes('metal') || section.includes('zilo') || section.includes('nylon') || section.includes('parafusadas')) {
    return {
      semantic_type: 'servico_montagem',
      usage_tags: ['servico_laboratorio', 'montagem'],
      benefit_tags: ['execucao_montagem'],
      commercial_summary: `${treatment.nome}: servico de montagem listado pela Optilab.`,
      recommendation_notes: 'Nao usar como tratamento optico; usar apenas em regras comerciais/operacionais de montagem.',
    }
  }

  if (section.includes('tratamentos') || name === 'uv') {
    return {
      semantic_type: 'tratamento_servico',
      usage_tags: ['tratamento_lente'],
      benefit_tags: name === 'uv' ? ['protecao_uv'] : ['acabamento_lente'],
      commercial_summary: `${treatment.nome}: tratamento/servico listado pela Optilab.`,
      recommendation_notes: 'Usar apenas quando houver compatibilidade comercial com a oferta.',
    }
  }

  return {
    semantic_type: 'servico_catalogo',
    usage_tags: ['servico_laboratorio'],
    benefit_tags: ['execucao_laboratorio'],
    commercial_summary: `${treatment.nome}: item de servico/catalogo Optilab.`,
    recommendation_notes: 'Semantica conservadora. Nao usar como beneficio clinico sem regra especifica.',
  }
}

function sameArray(a, b) {
  return JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort())
}

function sameSemanticProfile(a, b) {
  return (
    a?.semantic_type === b.semantic_type &&
    sameArray(a?.usage_tags, b.usage_tags) &&
    sameArray(a?.benefit_tags, b.benefit_tags) &&
    a?.commercial_summary === b.commercial_summary &&
    a?.recommendation_notes === b.recommendation_notes
  )
}

async function main() {
  const { data: treatments, error } = await supabase
    .from('global_treatments')
    .select('id,nome,tipo,tags,features')
    .eq('version_id', OPTILAB_VERSION_ID)
  if (error) throw error

  let updates = 0
  const counts = {}

  for (const treatment of treatments || []) {
    const features = treatment.features && typeof treatment.features === 'object' ? treatment.features : {}
    if (features.semantic_profile) continue

    const semanticProfile = {
      ...classify(treatment),
      source: 'Optilab 2026 - pagina de servicos/tratamentos, semantica conservadora',
    }
    counts[semanticProfile.semantic_type] = (counts[semanticProfile.semantic_type] || 0) + 1
    if (sameSemanticProfile(features.semantic_profile, semanticProfile)) continue

    updates += 1
    console.log('[treatment:update]', treatment.nome, '=>', semanticProfile.semantic_type)
    if (commit) {
      const { error: updateError } = await supabase
        .from('global_treatments')
        .update({ features: { ...features, semantic_profile: semanticProfile } })
        .eq('id', treatment.id)
      if (updateError) throw updateError
    }
  }

  console.log('Resumo:')
  console.log('- Tratamentos Optilab atualizados:', updates)
  console.log('- Tipos:', JSON.stringify(counts))
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
