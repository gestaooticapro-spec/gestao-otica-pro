import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078';

const FAMILY_PROFILES = [
  {
    family_name: 'VARILUX® XR SERIES',
    usage_tags: ['dirigir', 'computador', 'leitura', 'smartphone', 'uso_dinamico'],
    benefit_tags: ['nitidez', 'adaptacao_rapida', 'visao_movimento', 'conforto_proximo'],
    commercial_summary:
      'Multifocal premium para rotinas dinâmicas, com foco em nitidez rápida ao alternar entre longe, intermediário e perto.',
    recommendation_notes:
      'Priorizar quando o paciente relata perda de nitidez em movimento, rotina intensa entre direção, telas e tarefas de perto, ou desejo de adaptação rápida.',
  },
  {
    family_name: 'VARILUX® Physio® Extensee',
    usage_tags: ['dirigir_noite', 'computador', 'leitura', 'uso_geral'],
    benefit_tags: ['nitidez', 'conforto_baixa_luz', 'conforto_proximo', 'adaptacao_rapida'],
    commercial_summary:
      'Multifocal premium orientado a alta intensidade visual, contraste e confiança em diferentes condições de luz.',
    recommendation_notes:
      'Bom candidato para presbitas que reclamam de cansaço em ambientes escuros, direção noturna, leitura prolongada ou necessidade de visão mais nítida no dia a dia.',
  },
  {
    family_name: 'VARILUX® COMFORT',
    usage_tags: ['computador', 'leitura', 'dirigir', 'uso_geral'],
    benefit_tags: ['conforto_visual', 'flexibilidade_postural', 'adaptacao_rapida', 'versatilidade'],
    commercial_summary:
      'Família multifocal para uso diário, com proposta de conforto prolongado, boa transição entre campos e opções digital, tradicional e solar.',
    recommendation_notes:
      'Usar quando a prioridade for conforto estável ao longo do dia, rotina mista de longe e perto e boa adaptação sem ir direto para a linha mais premium.',
  },
  {
    family_name: 'VARILUX® LIBERTY',
    usage_tags: ['computador', 'leitura', 'dirigir', 'uso_geral'],
    benefit_tags: ['versatilidade', 'conforto_visual', 'custo_beneficio'],
    commercial_summary:
      'Família multifocal com versões digital, tradicional e solar para rotina geral, combinando flexibilidade comercial e cobertura de materiais.',
    recommendation_notes:
      'Indicar quando a ótica precisar de uma multifocal versátil para rotina geral, com boa amplitude de configuração e posicionamento comercial intermediário.',
  },
  {
    family_name: 'VARILUX® ACTIVITIES',
    usage_tags: ['computador', 'leitura', 'dirigir', 'esporte'],
    benefit_tags: ['especializacao_por_tarefa', 'versatilidade', 'conforto_visual'],
    commercial_summary:
      'Família segmentada por tarefa, reunindo opções específicas para perto, intermediário, direção e uso esportivo.',
    recommendation_notes:
      'Usar como família guarda-chuva quando o paciente tem uma necessidade muito marcada, como computador, direção ou esporte, e vale descer até a sublinha correta.',
  },
  {
    family_name: 'LENTES EYEZEN BOOST®',
    usage_tags: ['computador', 'smartphone', 'leitura'],
    benefit_tags: ['protecao_luz_azul', 'reducao_fadiga_visual', 'conforto_proximo', 'nitidez'],
    commercial_summary:
      'Lente monofocal digital para rotina conectada, com alívio visual em uso prolongado de telas e proteção Blue UV.',
    recommendation_notes:
      'Priorizar para usuários jovens ou pré-présbitas com queixa de cansaço em telas, alternância frequente entre dispositivos e demanda de perto elevada.',
  },
  {
    family_name: 'LENTES EYEZEN START®',
    usage_tags: ['computador', 'smartphone', 'leitura'],
    benefit_tags: ['protecao_luz_azul', 'reducao_fadiga_visual', 'nitidez'],
    commercial_summary:
      'Lente monofocal digital para vida conectada, combinando proteção Blue UV com conforto visual para tarefas de perto.',
    recommendation_notes:
      'Boa escolha para rotina escolar, universitária ou profissional com uso intenso de celular e computador, principalmente quando o paciente quer uma opção digital clara e simples.',
  },
  {
    family_name: 'EYEZEN® START STOCK | LENTES PRONTAS CRIZAL®',
    usage_tags: ['computador', 'smartphone', 'leitura'],
    benefit_tags: ['protecao_luz_azul', 'nitidez', 'disponibilidade_estoque'],
    commercial_summary:
      'Versão pronta da proposta Eyezen Start, com disponibilidade mais rápida, Crizal e Blue UV já embarcados nas combinações da tabela.',
    recommendation_notes:
      'Usar quando o paciente precisa de solução rápida para rotina digital sem abrir mão de proteção Blue UV e antirreflexo conhecido.',
  },
  {
    family_name: 'LINHA KIDS',
    usage_tags: ['criancas', 'computador', 'tablet', 'controle_miopia'],
    benefit_tags: ['protecao_luz_azul', 'suporte_miopia', 'nitidez'],
    commercial_summary:
      'Família infantil que reúne Eyezen Kids para rotina digital e Stellest para controle de progressão de miopia.',
    recommendation_notes:
      'Separar bem a indicação: Eyezen Kids atende conforto visual infantil em telas e estudo; Stellest entra quando existe estratégia clínica de controle de miopia.',
  },
  {
    family_name: 'LENTES ESSILOR®',
    usage_tags: ['intermediario', 'computador', 'sol'],
    benefit_tags: ['versatilidade', 'protecao_luz_azul', 'conforto_visual'],
    commercial_summary:
      'Família guarda-chuva com linhas intermediárias, visão simples surfaçada e solares, exigindo escolha da sublinha para fechar a indicação.',
    recommendation_notes:
      'Usar a família apenas como porta de entrada na busca. A recomendação final deve descer para a sublinha correta, como Interview ou visão simples surfaçada.',
  },
  {
    family_name: 'LENTES KODAK®',
    usage_tags: ['computador', 'leitura', 'dirigir', 'sol'],
    benefit_tags: ['versatilidade', 'personalizacao', 'opcoes_materiais'],
    commercial_summary:
      'Portfólio guarda-chuva de multifocais, ocupacionais, visão simples e solares KODAK, com forte variação entre sublinhas e materiais.',
    recommendation_notes:
      'Para sugestão por IA, tratar esta família como catálogo amplo. A indicação final deve sempre ser refinada até a sublinha, como Unique, Precise, Network, SoftWear ou Single.',
  },
  {
    family_name: 'LENTES ESPACE®',
    usage_tags: ['computador', 'leitura', 'dirigir'],
    benefit_tags: ['versatilidade', 'opcoes_materiais', 'conforto_visual'],
    commercial_summary:
      'Família com versões digital, tradicional e fotossensível, útil para rotina geral e composição com tratamentos conhecidos da tabela.',
    recommendation_notes:
      'Boa família para quem precisa de versatilidade comercial e técnica; a recomendação melhora quando se diferencia Espace, Espace Plus e as variantes com foto/solar.',
  },
  {
    family_name: 'LENTES BIFOCAIS',
    usage_tags: ['leitura', 'distancia', 'uso_geral'],
    benefit_tags: ['nitidez', 'custo_beneficio'],
    commercial_summary:
      'Alternativa bifocal segmentada para pacientes que preferem separar longe e perto de forma direta, com segmento visível.',
    recommendation_notes:
      'Usar quando o paciente já está adaptado a bifocal, busca custo mais controlado ou não deseja corredor progressivo.',
  },
  {
    family_name: 'iTop',
    usage_tags: ['uso_geral', 'computador', 'sol'],
    benefit_tags: ['versatilidade', 'protecao_luz_azul', 'opcoes_materiais'],
    commercial_summary:
      'Linha mista de lentes acabadas e surfaçadas digitais, com opções UV Led Protection, fotocromia e índices altos.',
    recommendation_notes:
      'Boa família para oferta flexível quando a ótica quer cruzar custo, índice e presença de proteção UV Led ou foto na mesma linha.',
  },
  {
    family_name: 'iTop Visão Simples - Blocos',
    usage_tags: ['uso_geral', 'computador', 'sol'],
    benefit_tags: ['versatilidade', 'protecao_luz_azul'],
    commercial_summary:
      'Blocos de visão simples da linha iTop, com combinações clear, photo e proteção UV para laboratório trabalhar surfaçagem.',
    recommendation_notes:
      'Útil quando a venda pede visão simples com maior flexibilidade laboratorial, especialmente em clear esférico ou opções photo.',
  },
  {
    family_name: 'LENTES VS SOLARES PLANAS ACABADAS',
    usage_tags: ['sol', 'dirigir_dia'],
    benefit_tags: ['coloracao', 'disponibilidade_estoque', 'versatilidade'],
    commercial_summary:
      'Lentes solares planas prontas, focadas em disponibilidade rápida e variedade de cores para compor óculos solares.',
    recommendation_notes:
      'Indicar quando o objetivo principal é solar pronta com escolha de cor, degradê ou material, sem depender de surfaçagem complexa.',
  },
];

function parseArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const versionId = parseArg('--version-id') || VERSION_ID;

  const { data: families, error: familiesError } = await supabase
    .from('global_lens_families')
    .select('id,nome,source_page_reference')
    .eq('version_id', versionId);

  if (familiesError) throw familiesError;

  const familyByName = new Map(families.map((family) => [family.nome, family]));
  const missingFamilies = FAMILY_PROFILES
    .map((profile) => profile.family_name)
    .filter((name) => !familyByName.has(name));

  if (missingFamilies.length) {
    throw new Error(`Familias nao encontradas: ${missingFamilies.join(', ')}`);
  }

  const familyIds = FAMILY_PROFILES.map((profile) => familyByName.get(profile.family_name).id);

  const { error: deleteProfilesError } = await supabase
    .from('global_usage_profiles')
    .delete()
    .eq('profile_scope', 'family')
    .in('family_id', familyIds);

  if (deleteProfilesError) throw deleteProfilesError;

  const rows = FAMILY_PROFILES.map((profile) => {
    const family = familyByName.get(profile.family_name);
    return {
      family_id: family.id,
      profile_scope: 'family',
      usage_tags: profile.usage_tags,
      benefit_tags: profile.benefit_tags,
      commercial_summary: profile.commercial_summary,
      recommendation_notes: profile.recommendation_notes,
      source_page_reference: family.source_page_reference,
    };
  });

  const { error: insertProfilesError } = await supabase
    .from('global_usage_profiles')
    .insert(rows);

  if (insertProfilesError) throw insertProfilesError;

  for (const profile of FAMILY_PROFILES) {
    const family = familyByName.get(profile.family_name);
    const { error: updateFamilyError } = await supabase
      .from('global_lens_families')
      .update({
        tags_uso: profile.usage_tags,
        tags_beneficios: profile.benefit_tags,
      })
      .eq('id', family.id);

    if (updateFamilyError) throw updateFamilyError;
  }

  console.table(
    FAMILY_PROFILES.map((profile) => ({
      familia: profile.family_name,
      usos: profile.usage_tags.length,
      beneficios: profile.benefit_tags.length,
    })),
  );
  console.log(`Perfis enriquecidos com sucesso para ${FAMILY_PROFILES.length} familias.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
