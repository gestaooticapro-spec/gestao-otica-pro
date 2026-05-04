export type SharedFamilySemanticProfile = {
  key: string
  entity_name: string
  manufacturer_or_brand?: string
  category?:
    | 'progressiva'
    | 'visao_simples'
    | 'ocupacional'
    | 'controle_miopia'
    | 'bifocal'
    | 'plana_solar'
    | 'mista'
    | 'indefinida'
  usage_tags: string[]
  benefit_tags: string[]
  commercial_summary: string | null
  recommendation_notes: string | null
  positioning?: 'entrada' | 'intermediaria' | 'premium' | 'ultra_premium' | 'indefinido'
  aliases: string[]
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u00AE\u2122]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const SHARED_FAMILY_SEMANTICS: SharedFamilySemanticProfile[] = [
  {
    key: 'varilux_xr',
    entity_name: 'Varilux XR',
    manufacturer_or_brand: 'Essilor / Varilux',
    category: 'progressiva',
    positioning: 'ultra_premium',
    aliases: ['varilux xr', 'varilux xr series'],
    usage_tags: ['dirigir', 'computador', 'celular', 'leitura', 'smartphone', 'uso_dinamico'],
    benefit_tags: ['nitidez', 'adaptacao_rapida', 'visao_movimento', 'campo_visual_amplo', 'qualidade_optica', 'conforto_visual'],
    commercial_summary:
      'Linha progressiva de topo da Varilux, posicionada para rotina dinâmica e alternância frequente entre diferentes distâncias.',
    recommendation_notes:
      'Boa candidata para clientes que buscam uma progressiva premium para rotina intensa, com foco em nitidez em movimento e resposta visual rápida.',
  },
  {
    key: 'varilux_physio',
    entity_name: 'Varilux Physio Extensee',
    manufacturer_or_brand: 'Essilor / Varilux',
    category: 'progressiva',
    positioning: 'premium',
    aliases: ['varilux physio', 'physio extensee', 'varilux physio extensee'],
    usage_tags: ['dirigir_noite', 'computador', 'leitura', 'uso_geral'],
    benefit_tags: ['nitidez', 'contraste', 'conforto_baixa_luz', 'qualidade_optica'],
    commercial_summary:
      'Progressiva premium posicionada em torno de nitidez, contraste e confiança visual em diferentes condições de luz.',
    recommendation_notes:
      'Forte candidata para clientes que valorizam nitidez e conforto visual em leitura prolongada, baixa luz e direção noturna.',
  },
  {
    key: 'varilux_comfort',
    entity_name: 'Varilux Comfort',
    manufacturer_or_brand: 'Essilor / Varilux',
    category: 'progressiva',
    positioning: 'intermediaria',
    aliases: ['varilux comfort'],
    usage_tags: ['computador', 'leitura', 'dirigir', 'uso_geral'],
    benefit_tags: ['conforto_visual', 'transicao_suave', 'adaptacao_suave', 'versatilidade'],
    commercial_summary:
      'Progressiva para uso diário, com proposta de conforto prolongado e boa transição entre os campos de longe, intermediário e perto.',
    recommendation_notes:
      'Boa opção equilibrada para rotina mista, quando a prioridade é conforto estável e adaptação suave sem ir direto para o topo da categoria.',
  },
  {
    key: 'varilux_liberty',
    entity_name: 'Varilux Liberty',
    manufacturer_or_brand: 'Essilor / Varilux',
    category: 'progressiva',
    positioning: 'entrada',
    aliases: ['varilux liberty'],
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['custo_beneficio', 'versatilidade', 'adaptacao_suave', 'conforto_visual'],
    commercial_summary:
      'Linha progressiva de entrada dentro da família Varilux, indicada para rotina geral e posicionamento mais acessível.',
    recommendation_notes:
      'Usar quando o cliente quer entrar em multifocal da marca com orçamento mais controlado e sem necessidade de recursos mais premium.',
  },
  {
    key: 'eyezen_start',
    entity_name: 'Eyezen Start',
    manufacturer_or_brand: 'Essilor / Eyezen',
    category: 'visao_simples',
    positioning: 'intermediaria',
    aliases: ['eyezen start', 'eyezen start stock'],
    usage_tags: ['computador', 'celular', 'smartphone', 'leitura', 'uso_digital'],
    benefit_tags: ['protecao_luz_azul', 'reducao_fadiga_visual', 'nitidez', 'conforto_visual'],
    commercial_summary:
      'Linha de visão simples digital para rotina conectada, com ênfase em conforto visual para uso prolongado de telas.',
    recommendation_notes:
      'Boa candidata para estudantes, profissionais de escritório e usuários de celular/computador que querem uma solução digital clara e simples.',
  },
  {
    key: 'eyezen_boost',
    entity_name: 'Eyezen Boost',
    manufacturer_or_brand: 'Essilor / Eyezen',
    category: 'visao_simples',
    positioning: 'premium',
    aliases: ['eyezen boost', 'eyezen+'],
    usage_tags: ['computador', 'celular', 'smartphone', 'leitura', 'uso_proximo', 'dirigir'],
    benefit_tags: ['protecao_luz_azul', 'reducao_fadiga_visual', 'suporte_acomodativo', 'conforto_proximo', 'conforto_digital', 'conforto_visual', 'adaptacao_rapida'],
    commercial_summary:
      'Linha de visão simples digital com maior suporte para tarefas de perto e rotina conectada mais exigente.',
    recommendation_notes:
      'Alternativa clínica à progressiva para pré-présbitas com adição baixa (≤ 1.5): adaptação praticamente nula, visão de longe preservada para dirigir, suporte de perto integrado. Ideal quando a rotina digital intensa é a queixa principal e o paciente nunca usou multifocal.',
  },
  {
    key: 'hoya_sync',
    entity_name: 'SYNC III',
    manufacturer_or_brand: 'Hoya',
    category: 'visao_simples',
    positioning: 'premium',
    aliases: ['sync iii', 'sync 3', 'sync-iii', 'sync iii-13', 'sync iii-9', 'sync iii-5'],
    usage_tags: ['computador', 'celular', 'smartphone', 'leitura', 'uso_digital', 'telas', 'dirigir'],
    benefit_tags: [
      'suporte_acomodativo',
      'reducao_fadiga_visual',
      'conforto_proximo',
      'conforto_digital',
      'conforto_visual',
      'protecao_luz_azul',
      'adaptacao_rapida',
    ],
    commercial_summary:
      'Lente de visão simples com zona de suporte para perto, indicada para presbiopia inicial e fadiga visual digital intensa (faixa 35-45 anos).',
    recommendation_notes:
      'Alternativa clínica à progressiva para pré-présbitas com adição ≤ 1.5: risco de adaptação próximo de zero, visão de longe integral (inclusive para dirigir), conforto de perto embutido. Indicada quando o principal incômodo é digital/perto e a adaptação a progressivo é uma preocupação real.',
  },
  {
    key: 'eyezen_kids',
    entity_name: 'Eyezen Kids',
    manufacturer_or_brand: 'Essilor / Eyezen',
    category: 'visao_simples',
    positioning: 'intermediaria',
    aliases: ['eyezen kids'],
    usage_tags: ['criancas', 'computador', 'estudo', 'uso_digital'],
    benefit_tags: ['conforto_digital_infantil', 'protecao_luz_azul', 'nitidez'],
    commercial_summary:
      'Linha infantil de visão simples focada em conforto visual para estudo, telas e rotina escolar.',
    recommendation_notes:
      'Importante não confundir com controle de miopia. A recomendação é para conforto digital infantil, não para desacelerar progressão miópica.',
  },
  {
    key: 'stellest',
    entity_name: 'Stellest',
    manufacturer_or_brand: 'Essilor / Stellest',
    category: 'controle_miopia',
    positioning: 'premium',
    aliases: ['stellest'],
    usage_tags: ['criancas', 'controle_miopia', 'estudo'],
    benefit_tags: ['controle_miopia', 'nitidez', 'uso_infantil'],
    commercial_summary:
      'Linha infantil voltada ao controle de miopia, distinta das propostas de conforto digital.',
    recommendation_notes:
      'Priorizar quando existir estratégia clínica de controle de miopia. Não tratar como simples lente digital infantil.',
  },
  {
    key: 'interview',
    entity_name: 'Interview',
    manufacturer_or_brand: 'Essilor',
    category: 'ocupacional',
    positioning: 'intermediaria',
    aliases: ['interview'],
    usage_tags: ['intermediario', 'computador', 'leitura', 'escritorio'],
    benefit_tags: ['campo_intermediario', 'conforto_proximo', 'ergonomia_visual'],
    commercial_summary:
      'Linha ocupacional voltada a tarefas de perto e intermediário, como computador, leitura e rotina de escritório.',
    recommendation_notes:
      'Não concorre diretamente com progressiva geral. Indicar quando a demanda principal é mesa, tela e leitura prolongada.',
  },
  {
    key: 'digitime',
    entity_name: 'Varilux Digitime',
    manufacturer_or_brand: 'Essilor / Varilux',
    category: 'ocupacional',
    positioning: 'premium',
    aliases: ['digitime', 'varilux digitime'],
    usage_tags: ['computador', 'leitura', 'escritorio', 'intermediario'],
    benefit_tags: ['campo_intermediario', 'ergonomia_visual', 'conforto_proximo', 'redução_de_esforco'],
    commercial_summary:
      'Linha ocupacional premium para tarefas de perto e intermediário, com ênfase em ergonomia visual para escritórios e telas.',
    recommendation_notes:
      'Boa candidata quando o cliente passa muito tempo em computador ou leitura e precisa mais campo útil de perto/intermediário do que visão de longe.',
  },
  {
    key: 'kodak_precise',
    entity_name: 'KODAK Precise',
    manufacturer_or_brand: 'KODAK Lens',
    category: 'progressiva',
    positioning: 'intermediaria',
    aliases: ['kodak precise'],
    usage_tags: ['uso_geral', 'perto', 'intermediario', 'longe'],
    benefit_tags: ['adaptacao_rapida', 'transicao_suave', 'clareza', 'versatilidade'],
    commercial_summary:
      'Progressiva KODAK orientada a uso geral e adaptação facilitada, com opção inclusive para armações menores em algumas variantes.',
    recommendation_notes:
      'Boa opção intermediária para compor concorrência com progressivas gerais de outras marcas, sem depender de posicionamento ultra premium.',
  },
  {
    key: 'kodak_network',
    entity_name: 'KODAK Network',
    manufacturer_or_brand: 'KODAK Lens',
    category: 'progressiva',
    positioning: 'premium',
    aliases: ['kodak network'],
    usage_tags: ['uso_geral', 'computador', 'leitura', 'intermediario'],
    benefit_tags: ['uso_digital', 'campo_visual_amplo', 'menos_distorcao', 'adaptacao_rapida'],
    commercial_summary:
      'Progressiva KODAK explicitamente posicionada para estilo de vida digital, mantendo uso em todas as distâncias.',
    recommendation_notes:
      'Forte candidata para presbitas que trabalham muito em telas, mas ainda precisam longe. Fica semanticamente entre progressiva geral e solução mais digital.',
  },
  {
    key: 'kodak_unique',
    entity_name: 'KODAK Unique',
    manufacturer_or_brand: 'KODAK Lens',
    category: 'progressiva',
    positioning: 'premium',
    aliases: ['kodak unique'],
    usage_tags: ['uso_geral', 'computador', 'leitura', 'longe'],
    benefit_tags: ['customizacao', 'uso_digital', 'transicao_suave', 'qualidade_optica'],
    commercial_summary:
      'Progressiva KODAK premium com discurso de personalização e otimização digital do design.',
    recommendation_notes:
      'Boa candidata para clientes que pedem progressiva premium da marca com percepção de personalização e modernidade.',
  },
  // Vision (marca própria baseada em Hayteck) — ordem: mais específico → menos específico para evitar match parcial
  {
    key: 'vision_plus_4k_premium',
    entity_name: 'Vision Plus 4K Premium',
    manufacturer_or_brand: 'Vision',
    category: 'progressiva',
    positioning: 'ultra_premium',
    aliases: ['vision plus 4k premium', 'vision 4k premium'],
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir', 'uso_digital', 'celular', 'smartphone', 'uso_dinamico'],
    benefit_tags: ['nitidez', 'campo_visual_amplo', 'qualidade_optica', 'customizacao', 'adaptacao_rapida', 'conforto_visual', 'visao_movimento'],
    commercial_summary:
      'Progressiva ultra-premium topo de linha Vision (Hayteck Pro ID), com design 4K individualizado e máximo refinamento para rotina dinâmica.',
    recommendation_notes:
      'A lente mais avançada da marca Vision. Equivalente ao Hayteck Pro ID. Indicada para pacientes que buscam o ápice do desempenho progressivo dentro da marca da loja.',
  },
  {
    key: 'vision_plus_4k',
    entity_name: 'Vision Plus 4K',
    manufacturer_or_brand: 'Vision',
    category: 'progressiva',
    positioning: 'ultra_premium',
    aliases: ['vision plus 4k', 'vision 4k'],
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir', 'uso_digital', 'celular', 'smartphone', 'uso_dinamico'],
    benefit_tags: ['nitidez', 'campo_visual_amplo', 'qualidade_optica', 'customizacao', 'adaptacao_rapida', 'conforto_visual'],
    commercial_summary:
      'Progressiva ultra-premium da linha Vision (Hayteck Top) com tecnologia 4K de alta definição para rotina exigente.',
    recommendation_notes:
      'Equivalente ao Hayteck Top. Topo da linha Vision para pacientes que buscam alto desempenho dentro da marca própria, com custo potencialmente mais competitivo que marcas líderes equivalentes.',
  },
  {
    key: 'vision_plus_individual',
    entity_name: 'Vision Plus Individual',
    manufacturer_or_brand: 'Vision',
    category: 'progressiva',
    positioning: 'premium',
    aliases: ['vision plus individual'],
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir', 'uso_digital', 'celular'],
    benefit_tags: ['customizacao', 'qualidade_optica', 'nitidez', 'campo_visual_amplo', 'adaptacao_rapida', 'conforto_visual'],
    commercial_summary:
      'Progressiva premium individualizada da linha Vision (Hayteck Smart), com design personalizado ao perfil de uso do paciente.',
    recommendation_notes:
      'Equivalente ao Hayteck Smart. Indicada para pacientes que buscam personalização e desempenho premium dentro da marca da loja. Argumento forte de lealdade e diferencial de atendimento.',
  },
  {
    key: 'vision_plus_extensee',
    entity_name: 'Vision Plus Extensee',
    manufacturer_or_brand: 'Vision',
    category: 'progressiva',
    positioning: 'intermediaria',
    aliases: ['vision plus extensee'],
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir', 'uso_digital'],
    benefit_tags: ['campo_visual_ampliado', 'menor_distorcao_periferica', 'alta_nitidez', 'conforto_superior', 'adaptacao_rapida'],
    commercial_summary:
      'Progressiva intermediária-premium da linha Vision com corredor estendido e menor distorção periférica.',
    recommendation_notes:
      'Indicada para pacientes que querem mais campo visual, especialmente em computador e leitura prolongada, sem o custo das versões individualizadas.',
  },
  {
    key: 'vision_plus_pro',
    entity_name: 'Vision Plus Pro',
    manufacturer_or_brand: 'Vision',
    category: 'progressiva',
    positioning: 'premium',
    aliases: ['vision plus pro'],
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir', 'uso_digital', 'celular'],
    benefit_tags: ['qualidade_optica', 'nitidez', 'campo_visual_amplo', 'adaptacao_rapida', 'conforto_visual'],
    commercial_summary:
      'Progressiva premium da linha Vision (Hayteck Light) para rotina exigente, com maior refinamento óptico e amplitude de campo.',
    recommendation_notes:
      'Forte candidata para pacientes que buscam progressiva premium da marca com investimento controlado. Boa relação custo-desempenho dentro da marca própria.',
  },
  {
    key: 'vision_plus_hd',
    entity_name: 'Vision Plus HD',
    manufacturer_or_brand: 'Vision',
    category: 'progressiva',
    positioning: 'intermediaria',
    aliases: ['vision plus hd'],
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir', 'uso_digital'],
    benefit_tags: ['nitidez', 'campo_visual_amplo', 'adaptacao_rapida', 'conforto_visual'],
    commercial_summary:
      'Progressiva intermediária da linha Vision com design de alta definição para maior nitidez e campo visual.',
    recommendation_notes:
      'Boa candidata para pacientes que buscam mais nitidez e campo visual amplo sem entrar em premium. Posicionamento equivalente ao tier Hayteck Go! com refinamento HD.',
  },
  {
    key: 'vision_plus_lite',
    entity_name: 'Vision Plus Lite',
    manufacturer_or_brand: 'Vision',
    category: 'progressiva',
    positioning: 'entrada',
    aliases: ['vision plus lite'],
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['custo_beneficio', 'transicao_suave', 'boa_adaptacao', 'versatilidade'],
    commercial_summary:
      'Progressiva de entrada da linha Vision com proposta de boa adaptação e custo acessível.',
    recommendation_notes:
      'Alternativa levemente superior ao Basic quando o paciente prioriza adaptação facilitada sem incremento significativo de investimento.',
  },
  {
    key: 'vision_plus_basic',
    entity_name: 'Vision Plus Basic',
    manufacturer_or_brand: 'Vision',
    category: 'progressiva',
    positioning: 'entrada',
    aliases: ['vision plus basic'],
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['custo_beneficio', 'versatilidade', 'acessivel', 'primeiro_progressivo'],
    commercial_summary:
      'Progressiva de entrada da linha Vision (Hayteck Go!), indicada para primeiros usuários e rotina geral com custo acessível.',
    recommendation_notes:
      'Boa opção de entrada para pacientes que buscam progressiva da marca da loja com menor investimento. Posicionamento equivalente ao Hayteck Go!.',
  },
  {
    key: 'vision_drive',
    entity_name: 'Vision Drive',
    manufacturer_or_brand: 'Vision',
    category: 'progressiva',
    positioning: 'intermediaria',
    aliases: ['vision drive'],
    usage_tags: ['dirigir', 'dirigir_noite', 'uso_geral', 'longe', 'externo'],
    benefit_tags: ['nitidez_longe', 'campo_visual_amplo', 'conforto_visual', 'seguranca_visual'],
    commercial_summary:
      'Progressiva da linha Vision com design otimizado para dirigir, priorizando visão de longe e campo periférico amplo.',
    recommendation_notes:
      'Indicada quando dirigir é a principal demanda do paciente. Bom argumento de especialização frente a progressivas genéricas.',
  },
  {
    key: 'vision_office',
    entity_name: 'Vision Office',
    manufacturer_or_brand: 'Vision',
    category: 'ocupacional',
    positioning: 'intermediaria',
    aliases: ['vision office'],
    usage_tags: ['computador', 'leitura', 'escritorio', 'intermediario', 'perto'],
    benefit_tags: ['campo_amplo', 'conforto_visual', 'ergonomia_visual', 'conforto_proximo', 'adaptacao_rapida'],
    commercial_summary:
      'Lente ocupacional da linha Vision para visão de perto e intermediário em ambiente de escritório.',
    recommendation_notes:
      'Alternativa ao progressivo para pacientes com dificuldade de adaptação, focada em conforto indoor. Indicada quando a demanda principal é mesa, tela e leitura prolongada.',
  },
  {
    key: 'vision_plus',
    entity_name: 'Vision Plus',
    manufacturer_or_brand: 'Vision',
    category: 'progressiva',
    positioning: 'entrada',
    aliases: ['vision plus'],
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['equilibrio_visual', 'versatilidade', 'conforto_no_uso'],
    commercial_summary:
      'Progressiva básica da linha Vision para uso diário geral, equilibrando visão em todas as distâncias.',
    recommendation_notes:
      'Opção de entrada dentro da linha Vision para rotina mista sem demanda específica por desempenho digital ou personalização.',
  },
]

export function getSharedFamilySemanticProfile(
  familyName: string | null | undefined,
): SharedFamilySemanticProfile | null {
  if (!familyName) return null
  const normalized = normalizeName(familyName)
  for (const profile of SHARED_FAMILY_SEMANTICS) {
    if (profile.aliases.some((alias) => normalized.includes(normalizeName(alias)))) {
      return profile
    }
  }
  return null
}
