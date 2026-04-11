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
    usage_tags: ['dirigir', 'computador', 'leitura', 'smartphone', 'uso_dinamico'],
    benefit_tags: ['nitidez', 'adaptacao_rapida', 'visao_movimento', 'campo_visual_amplo'],
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
    usage_tags: ['computador', 'smartphone', 'leitura', 'uso_digital'],
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
    usage_tags: ['computador', 'smartphone', 'leitura', 'uso_proximo'],
    benefit_tags: ['protecao_luz_azul', 'reducao_fadiga_visual', 'suporte_acomodativo', 'conforto_proximo'],
    commercial_summary:
      'Linha de visão simples digital com maior suporte para tarefas de perto e rotina conectada mais exigente.',
    recommendation_notes:
      'Forte candidata para jovens adultos e pré-présbitas com maior demanda de perto e sensação de cansaço visual em telas.',
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
