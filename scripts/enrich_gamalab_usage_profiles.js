import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const VERSION_ID = 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'

const FAMILY_PROFILES = [
  {
    family_name: 'Quantum A.I.',
    usage_tags: ['uso_geral', 'uso_dinamico', 'dirigir', 'computador', 'leitura'],
    benefit_tags: ['alta_tecnologia', 'campo_visual_amplo', 'nitidez', 'adaptacao_rapida'],
    commercial_summary:
      'Progressiva de topo da Gamalab, posicionada para rotina dinamica com forte apelo de tecnologia e amplitude de campo.',
    recommendation_notes:
      'Boa candidata premium dentro da marca para clientes que pedem tecnologia, nitidez e uso misto entre longe, intermediario e perto.',
  },
  {
    family_name: 'Gamavision 4K',
    usage_tags: ['uso_geral', 'dirigir', 'computador', 'leitura'],
    benefit_tags: ['nitidez', 'conforto_visual', 'amplitude_de_campo', 'versatilidade'],
    commercial_summary:
      'Linha progressiva premium da Gamalab voltada a qualidade de imagem e conforto visual em uso geral.',
    recommendation_notes:
      'Usar como opcao forte para progressiva geral quando a prioridade for nitidez e conforto, sem necessariamente subir ao topo absoluto da marca.',
  },
  {
    family_name: 'Gamavision Pro Individual',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['personalizacao', 'nitidez', 'conforto_visual', 'adaptacao_rapida'],
    commercial_summary:
      'Progressiva com proposta mais individualizada dentro da Gamalab, combinando personalizacao e conforto visual.',
    recommendation_notes:
      'Forte candidata para clientes que valorizam personalizacao e querem uma progressiva premium sem sair do portfolio proprio da Gamalab.',
  },
  {
    family_name: 'Dynamic Premium',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['conforto_visual', 'campo_visual_amplo', 'adaptacao_suave', 'versatilidade'],
    commercial_summary:
      'Progressiva da linha Dynamic com posicionamento acima das opcoes de entrada, focada em conforto e amplitude de campo.',
    recommendation_notes:
      'Boa alternativa equilibrada para clientes que querem subir de categoria dentro da marca sem ir para a linha mais sofisticada.',
  },
  {
    family_name: 'Gamavision Freeform',
    usage_tags: ['uso_geral', 'uso_dinamico', 'dirigir', 'computador'],
    benefit_tags: ['reducao_distorcoes', 'campo_visual_amplo', 'adaptacao_rapida', 'alta_tecnologia'],
    commercial_summary:
      'Linha progressiva apoiada no discurso de freeform e surfacagem digital, com foco em reduzir distorcoes e ampliar o campo util.',
    recommendation_notes:
      'Boa candidata para usuarios que reclamam de distorcao lateral ou querem uma progressiva mais moderna do que as geracoes convencionais.',
  },
  {
    family_name: 'Dynamic Pro',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['versatilidade', 'conforto_visual', 'adaptacao_suave', 'custo_beneficio'],
    commercial_summary:
      'Progressiva intermediaria da Gamalab para rotina geral, com boa cobertura comercial e proposta equilibrada.',
    recommendation_notes:
      'Usar quando o cliente busca uma progressiva geral equilibrada, com custo mais controlado que as linhas premium da marca.',
  },
  {
    family_name: 'Life',
    usage_tags: ['uso_geral', 'leitura', 'dirigir'],
    benefit_tags: ['custo_beneficio', 'adaptacao_tradicional', 'versatilidade'],
    commercial_summary:
      'Linha progressiva de entrada da Gamalab para rotina geral e composicao comercial mais acessivel.',
    recommendation_notes:
      'Boa opcao de entrada para clientes que precisam de progressiva e priorizam orcamento mais baixo dentro do portfolio da marca.',
  },
  {
    family_name: 'Gama HD',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir_noite'],
    benefit_tags: ['nitidez', 'contraste', 'qualidade_optica', 'conforto_visual'],
    commercial_summary:
      'Progressiva da Gamalab com discurso de alta definicao e foco em qualidade de imagem.',
    recommendation_notes:
      'Boa candidata para clientes que valorizam nitidez e contraste e querem perceber uma diferenca clara na qualidade visual.',
  },
  {
    family_name: 'Dynamic Work',
    usage_tags: ['computador', 'leitura', 'escritorio', 'intermediario'],
    benefit_tags: ['campo_intermediario', 'ergonomia_visual', 'conforto_proximo', 'redução_de_esforco'],
    commercial_summary:
      'Linha ocupacional da Gamalab voltada a escritorio, computador e tarefas de perto/intermediario.',
    recommendation_notes:
      'Nao concorre diretamente com progressivas gerais. Indicar quando o uso principal e tela, mesa e leitura prolongada.',
  },
  {
    family_name: 'Dynamic Relax',
    usage_tags: ['computador', 'smartphone', 'leitura', 'uso_digital'],
    benefit_tags: ['reducao_fadiga_visual', 'conforto_proximo', 'nitidez', 'uso_digital'],
    commercial_summary:
      'Linha de visao simples com proposta de relaxamento acomodativo para rotina conectada e uso digital.',
    recommendation_notes:
      'Boa candidata para usuarios de telas que ainda nao precisam de multifocal, mas relatam cansaco visual e demanda de perto elevada.',
  },
  {
    family_name: 'Dynamic Single',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'uso_digital'],
    benefit_tags: ['nitidez', 'versatilidade', 'conforto_visual', 'disponibilidade_de_indices'],
    commercial_summary:
      'Linha de visao simples da Gamalab com cobertura ampla de materiais e propostas digitais para rotina geral.',
    recommendation_notes:
      'Usar como linha de visao simples geral quando a loja quer flexibilidade entre indices, foto e composicoes de tratamento.',
  },
  {
    family_name: 'MioKids',
    usage_tags: ['criancas', 'controle_miopia', 'estudo'],
    benefit_tags: ['controle_miopia', 'uso_infantil', 'resistencia_impacto', 'alta_tecnologia'],
    commercial_summary:
      'Linha infantil da Gamalab voltada ao controle de miopia, com discurso de microestrutura optica e lente de policarbonato.',
    recommendation_notes:
      'Priorizar quando houver estrategia clinica de controle de miopia. Nao tratar como simples lente digital infantil.',
  },
  {
    family_name: 'Visão Simples Surfaçadas Digital',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'uso_digital'],
    benefit_tags: ['nitidez', 'conforto_visual', 'disponibilidade_de_indices', 'versatilidade'],
    commercial_summary:
      'Familia de visao simples surfacada digital para rotina geral, com foco em flexibilidade comercial e cobertura de materiais.',
    recommendation_notes:
      'Boa familia de base para recomendacoes de visao simples quando a loja precisa equilibrar desempenho, indice e tratamento.',
  },
  {
    family_name: 'Hoyalux Argos',
    usage_tags: ['uso_geral', 'leitura', 'dirigir'],
    benefit_tags: ['custo_beneficio', 'adaptacao_tradicional', 'versatilidade'],
    commercial_summary:
      'Progressiva multimarcas posicionada para uso geral e cobertura de entrada/intermediaria.',
    recommendation_notes:
      'Boa alternativa quando a loja quer uma progressiva multimarcas de custo mais controlado para rotina geral.',
  },
  {
    family_name: 'Hoyalux Amplus',
    usage_tags: ['uso_geral', 'leitura', 'dirigir'],
    benefit_tags: ['versatilidade', 'conforto_visual', 'adaptacao_suave'],
    commercial_summary:
      'Progressiva multimarcas com proposta equilibrada para rotina geral e uso diario.',
    recommendation_notes:
      'Usar como opcao intermediaria quando o cliente quer uma progressiva geral sem subir para posicionamentos mais premium.',
  },
  {
    family_name: 'Varilux Comfort',
    usage_tags: ['computador', 'leitura', 'dirigir', 'uso_geral'],
    benefit_tags: ['conforto_visual', 'transicao_suave', 'adaptacao_suave', 'versatilidade'],
    commercial_summary:
      'Progressiva Varilux para uso diario, com proposta de conforto prolongado e boa transicao entre os campos.',
    recommendation_notes:
      'Boa opcao equilibrada para rotina mista, quando a prioridade e conforto estavel e adaptacao suave.',
  },
  {
    family_name: 'Varilux Liberty',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['custo_beneficio', 'versatilidade', 'adaptacao_suave', 'conforto_visual'],
    commercial_summary:
      'Linha progressiva de entrada dentro da familia Varilux, indicada para rotina geral e posicionamento mais acessivel.',
    recommendation_notes:
      'Usar quando o cliente quer entrar em multifocal da marca com orcamento mais controlado e sem necessidade de recursos premium.',
  },
  {
    family_name: 'Espace Plus',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['versatilidade', 'fotossensivel', 'conforto_visual', 'opcoes_materiais'],
    commercial_summary:
      'Progressiva multimarcas com versoes foto e incolor, util para rotina geral e montagem de grade comercial ampla.',
    recommendation_notes:
      'Boa opcao para recomendacao equilibrada quando a loja busca flexibilidade comercial e cobertura de materiais.',
  },
  {
    family_name: 'Espace Short',
    usage_tags: ['uso_geral', 'leitura', 'dirigir', 'armacoes_pequenas'],
    benefit_tags: ['adaptacao_suave', 'versatilidade', 'armacao_pequena'],
    commercial_summary:
      'Versao short da familia Espace, voltada a armacoes menores e configuracoes com altura reduzida.',
    recommendation_notes:
      'Priorizar quando a armação for pequena ou a montagem exigir alternativa mais curta sem sair da categoria progressiva geral.',
  },
  {
    family_name: 'Espace',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['versatilidade', 'conforto_visual', 'adaptacao_suave'],
    commercial_summary:
      'Progressiva multimarcas para rotina geral, com proposta equilibrada de conforto e cobertura comercial.',
    recommendation_notes:
      'Boa familia para quem precisa de versatilidade tecnica e comercial sem partir para linhas mais sofisticadas.',
  },
  {
    family_name: 'Kodak Precise',
    usage_tags: ['uso_geral', 'perto', 'intermediario', 'longe'],
    benefit_tags: ['adaptacao_rapida', 'transicao_suave', 'clareza', 'versatilidade'],
    commercial_summary:
      'Progressiva KODAK orientada a uso geral e adaptacao facilitada, com boa cobertura comercial na categoria multimarcas.',
    recommendation_notes:
      'Boa opcao intermediaria para compor concorrencia com progressivas gerais de outras marcas.',
  },
  {
    family_name: 'Interview',
    usage_tags: ['intermediario', 'computador', 'leitura', 'escritorio'],
    benefit_tags: ['campo_intermediario', 'conforto_proximo', 'ergonomia_visual'],
    commercial_summary:
      'Linha ocupacional voltada a tarefas de perto e intermediario, como computador, leitura e rotina de escritorio.',
    recommendation_notes:
      'Nao concorre diretamente com progressiva geral. Indicar quando a demanda principal e mesa, tela e leitura prolongada.',
  },
  {
    family_name: 'Solamax Digital',
    usage_tags: ['uso_geral', 'sol', 'fotossensivel', 'dirigir_dia'],
    benefit_tags: ['versatilidade', 'adaptacao_suave', 'opcoes_foto'],
    commercial_summary:
      'Progressiva multimarcas com opcoes incolor e foto, indicada para uso geral e variacao de luminosidade.',
    recommendation_notes:
      'Boa candidata quando o cliente quer uma progressiva geral com opcao fotossensivel sem subir para categorias mais premium.',
  },
  {
    family_name: 'Easy M',
    usage_tags: ['uso_geral', 'leitura', 'dirigir'],
    benefit_tags: ['custo_beneficio', 'versatilidade', 'adaptacao_tradicional'],
    commercial_summary:
      'Progressiva multimarcas com perfil mais acessivel para rotina geral e uso diario.',
    recommendation_notes:
      'Usar como opcao economica dentro da categoria multifocal quando o preco for decisivo na recomendacao.',
  },
  {
    family_name: 'Bifocais Tradicionais',
    usage_tags: ['leitura', 'distancia', 'uso_geral'],
    benefit_tags: ['perto_longe_direto', 'custo_beneficio', 'adaptacao_tradicional'],
    commercial_summary:
      'Familia bifocal segmentada para quem prefere separacao direta entre longe e perto com segmento visivel.',
    recommendation_notes:
      'Boa para clientes ja adaptados a bifocal ou que nao desejam corredor progressivo.',
  },
  {
    family_name: 'Bifocais Digital Freeform',
    usage_tags: ['leitura', 'distancia', 'uso_geral'],
    benefit_tags: ['perto_longe_direto', 'campo_visual_amplo', 'nitidez', 'alta_tecnologia'],
    commercial_summary:
      'Familia bifocal com abordagem digital/freeform, combinando segmentacao bifocal com discurso de melhor acabamento optico.',
    recommendation_notes:
      'Usar quando o cliente quer manter a logica bifocal, mas com proposta tecnica superior a modelos tradicionais.',
  },
  {
    family_name: 'Lentes Prontas Lumina',
    usage_tags: ['uso_geral', 'pronta_entrega', 'lente_fina'],
    benefit_tags: ['pronta_entrega', 'lente_fina', 'leveza', 'estetica'],
    commercial_summary:
      'Familia de lentes prontas com foco em pronta entrega, indices mais finos e narrativa de leveza e estetica.',
    recommendation_notes:
      'Boa candidata quando o cliente quer rapidez e visual mais discreto sem depender de surfacagem complexa.',
  },
  {
    family_name: 'Gama Acabadas',
    usage_tags: ['uso_geral', 'pronta_entrega', 'computador'],
    benefit_tags: ['pronta_entrega', 'versatilidade', 'opcoes_de_grade'],
    commercial_summary:
      'Familia de lentes acabadas Gamalab para pronta entrega e combinacoes amplas de grade, Blue UV e foto.',
    recommendation_notes:
      'Boa para lojas que valorizam disponibilidade imediata e variedade de grade em visao simples acabada.',
  },
  {
    family_name: 'Gama HD Acabadas',
    usage_tags: ['uso_geral', 'pronta_entrega'],
    benefit_tags: ['pronta_entrega', 'nitidez', 'versatilidade'],
    commercial_summary:
      'Familia de acabadas com discurso de maior definicao dentro da linha pronta da Gamalab.',
    recommendation_notes:
      'Boa para quem quer pronta entrega com percepcao de qualidade visual acima da linha basica acabada.',
  },
  {
    family_name: 'Kodak Acabadas',
    usage_tags: ['uso_geral', 'pronta_entrega'],
    benefit_tags: ['pronta_entrega', 'versatilidade', 'portfolio_amplo'],
    commercial_summary:
      'Linha de acabadas Kodak dentro da Gamalab, focada em pronta entrega e cobertura de opcoes comerciais conhecidas.',
    recommendation_notes:
      'Boa como oferta pronta de marca conhecida quando a rapidez de entrega pesa na decisao.',
  },
  {
    family_name: 'Crizal Acabadas',
    usage_tags: ['uso_geral', 'computador', 'dirigir_noite'],
    benefit_tags: ['antirreflexo', 'protecao_luz_azul', 'pronta_entrega', 'clareza'],
    commercial_summary:
      'Familia de acabadas com foco em tratamentos Crizal e pronta entrega, combinando marca reconhecida com disponibilidade imediata.',
    recommendation_notes:
      'Boa para clientes que valorizam tratamento conhecido e rapidez de entrega, especialmente em visao simples.',
  },
  {
    family_name: 'Hoya Acabadas',
    usage_tags: ['uso_geral', 'pronta_entrega', 'computador'],
    benefit_tags: ['pronta_entrega', 'marca_reconhecida', 'conforto_visual'],
    commercial_summary:
      'Familia de acabadas Hoya dentro da Gamalab, orientada a pronta entrega e marca reconhecida no balcão.',
    recommendation_notes:
      'Usar quando a loja quer oferecer uma opcao pronta com reconhecimento de marca e discurso comercial simples.',
  },
  {
    family_name: 'Solares Curva 6',
    usage_tags: ['sol', 'uso_externo', 'dirigir_dia'],
    benefit_tags: ['coloracao', 'pronta_entrega', 'versatilidade'],
    commercial_summary:
      'Familia solar pronta de curva 6 para uso externo e composicao de oculos solares com cores basicas.',
    recommendation_notes:
      'Indicar quando o objetivo principal e lente solar pronta para dia a dia e composicao rapida de oculos solares.',
  },
  {
    family_name: 'Solares CR39 Curva 8',
    usage_tags: ['sol', 'uso_externo', 'dirigir_dia'],
    benefit_tags: ['coloracao', 'pronta_entrega', 'custo_beneficio'],
    commercial_summary:
      'Familia solar em CR-39 curva 8, voltada a uso externo com custo mais acessivel.',
    recommendation_notes:
      'Boa opcao para cliente que quer solar pronta em curva 8 com custo controlado.',
  },
  {
    family_name: 'Solares 1.59 Curva 6',
    usage_tags: ['sol', 'uso_externo', 'resistencia'],
    benefit_tags: ['resistencia_impacto', 'leveza', 'coloracao'],
    commercial_summary:
      'Familia solar em 1.59 com foco em leveza, resistencia e uso externo.',
    recommendation_notes:
      'Boa candidata para clientes que valorizam mais resistencia e leveza do que as opcoes basicas em resina.',
  },
  {
    family_name: 'Solares 1.59 Curva 8',
    usage_tags: ['sol', 'uso_externo', 'estilo'],
    benefit_tags: ['leveza', 'estetica', 'coloracao'],
    commercial_summary:
      'Familia solar 1.59 em curva 8, com combinacoes basicas e espelhadas para uso externo e apelo estetico.',
    recommendation_notes:
      'Boa candidata quando o cliente quer solar pronta em curva 8 com visual mais marcado e opcoes de cor.',
  },
  {
    family_name: 'Solares Polarizado Curva 6',
    usage_tags: ['sol', 'dirigir_dia', 'uso_externo'],
    benefit_tags: ['polarizacao', 'redução_ofuscamento', 'conforto_visual'],
    commercial_summary:
      'Familia solar polarizada curva 6, voltada a reducao de ofuscamento e conforto visual em ambientes externos.',
    recommendation_notes:
      'Boa candidata para clientes que dirigem de dia, passam tempo ao ar livre ou reclamam de reflexos intensos.',
  },
  {
    family_name: 'Solar Espelhado Polarizado Curva 6',
    usage_tags: ['sol', 'uso_externo', 'estilo'],
    benefit_tags: ['polarizacao', 'espelhado', 'redução_ofuscamento', 'estetica'],
    commercial_summary:
      'Familia solar espelhada e polarizada curva 6, combinando apelo visual com reducao de reflexos externos.',
    recommendation_notes:
      'Indicar quando o cliente quer solar com forte componente estetico sem abrir mao da reducao de ofuscamento.',
  },
]

function parseArg(name) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return null
  return process.argv[idx + 1] ?? null
}

async function main() {
  const versionId = parseArg('--version-id') || VERSION_ID

  const { data: families, error: familiesError } = await supabase
    .from('global_lens_families')
    .select('id,nome,source_page_reference')
    .eq('version_id', versionId)

  if (familiesError) throw familiesError

  const familyByName = new Map(families.map((family) => [family.nome, family]))
  const missingFamilies = FAMILY_PROFILES
    .map((profile) => profile.family_name)
    .filter((name) => !familyByName.has(name))

  if (missingFamilies.length) {
    throw new Error(`Familias nao encontradas: ${missingFamilies.join(', ')}`)
  }

  const familyIds = FAMILY_PROFILES.map((profile) => familyByName.get(profile.family_name).id)

  const { error: deleteProfilesError } = await supabase
    .from('global_usage_profiles')
    .delete()
    .eq('profile_scope', 'family')
    .in('family_id', familyIds)

  if (deleteProfilesError) throw deleteProfilesError

  const rows = FAMILY_PROFILES.map((profile) => {
    const family = familyByName.get(profile.family_name)
    return {
      family_id: family.id,
      profile_scope: 'family',
      usage_tags: profile.usage_tags,
      benefit_tags: profile.benefit_tags,
      commercial_summary: profile.commercial_summary,
      recommendation_notes: profile.recommendation_notes,
      source_page_reference: family.source_page_reference,
    }
  })

  const { error: insertProfilesError } = await supabase.from('global_usage_profiles').insert(rows)
  if (insertProfilesError) throw insertProfilesError

  for (const profile of FAMILY_PROFILES) {
    const family = familyByName.get(profile.family_name)
    const { error: updateFamilyError } = await supabase
      .from('global_lens_families')
      .update({
        tags_uso: profile.usage_tags,
        tags_beneficios: profile.benefit_tags,
      })
      .eq('id', family.id)

    if (updateFamilyError) throw updateFamilyError
  }

  console.table(
    FAMILY_PROFILES.map((profile) => ({
      familia: profile.family_name,
      usos: profile.usage_tags.length,
      beneficios: profile.benefit_tags.length,
    })),
  )
  console.log(`Perfis enriquecidos com sucesso para ${FAMILY_PROFILES.length} familias.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
