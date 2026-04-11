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
    benefit_tags: ['nitidez', 'adaptacao_rapida', 'visao_movimento', 'campo_visual_amplo'],
    commercial_summary:
      'Multifocal de topo para rotinas dinamicas, com proposta de resposta visual rapida ao alternar entre longe, intermediario e perto.',
    recommendation_notes:
      'Priorizar quando o cliente relata perda de nitidez em movimento, rotina intensa entre direcao, telas e tarefas de perto, e aceita posicionamento premium.',
  },
  {
    family_name: 'VARILUX® Physio® Extensee',
    usage_tags: ['dirigir_noite', 'computador', 'leitura', 'uso_geral'],
    benefit_tags: ['nitidez', 'contraste', 'conforto_baixa_luz', 'qualidade_optica'],
    commercial_summary:
      'Multifocal premium orientado a nitidez, contraste e confianca visual em diferentes condicoes de luz.',
    recommendation_notes:
      'Bom candidato para presbitas que reclamam de cansaco em ambientes escuros, direcao noturna, leitura prolongada ou desejo de imagem mais nitida no dia a dia.',
  },
  {
    family_name: 'VARILUX® COMFORT',
    usage_tags: ['computador', 'leitura', 'dirigir', 'uso_geral'],
    benefit_tags: ['conforto_visual', 'transicao_suave', 'adaptacao_suave', 'versatilidade'],
    commercial_summary:
      'Familia multifocal para uso diario, com proposta de conforto prolongado, transicao suave entre campos e versoes digital, tradicional e solar.',
    recommendation_notes:
      'Usar quando a prioridade for conforto estavel ao longo do dia, rotina mista de longe e perto e boa adaptacao sem subir direto para a linha mais premium.',
  },
  {
    family_name: 'VARILUX® LIBERTY',
    usage_tags: ['computador', 'leitura', 'dirigir', 'uso_geral'],
    benefit_tags: ['custo_beneficio', 'versatilidade', 'adaptacao_suave', 'conforto_visual'],
    commercial_summary:
      'Multifocal de entrada da familia Varilux para rotina geral, com versoes digital, tradicional e solar e foco em custo-beneficio dentro da marca.',
    recommendation_notes:
      'Indicar quando o cliente quer entrar em multifocal da marca com orcamento mais controlado e demanda visual menos exigente que as linhas premium.',
  },
  {
    family_name: 'VARILUX® ACTIVITIES',
    usage_tags: ['computador', 'leitura', 'dirigir', 'esporte'],
    benefit_tags: ['especializacao_por_tarefa', 'campo_intermediario', 'conforto_visual', 'versatilidade'],
    commercial_summary:
      'Familia segmentada por tarefa, reunindo opcoes especificas para perto, intermediario, direcao e uso esportivo.',
    recommendation_notes:
      'Usar como familia guarda-chuva quando a necessidade e muito marcada, como computador, direcao ou esporte, e vale descer ate a sublinha correta.',
  },
  {
    family_name: 'LENTES EYEZEN BOOST®',
    usage_tags: ['computador', 'smartphone', 'leitura', 'uso_proximo'],
    benefit_tags: ['protecao_luz_azul', 'reducao_fadiga_visual', 'suporte_acomodativo', 'conforto_proximo'],
    commercial_summary:
      'Lente monofocal digital para rotina conectada, com alivio visual em uso prolongado de telas e maior suporte para tarefas de perto.',
    recommendation_notes:
      'Priorizar para usuarios jovens ou pre-presbitas com queixa de cansaco em telas, alternancia frequente entre dispositivos e demanda de perto mais intensa.',
  },
  {
    family_name: 'LENTES EYEZEN START®',
    usage_tags: ['computador', 'smartphone', 'leitura', 'uso_digital'],
    benefit_tags: ['protecao_luz_azul', 'reducao_fadiga_visual', 'nitidez', 'conforto_visual'],
    commercial_summary:
      'Lente monofocal digital para vida conectada, combinando protecao Blue UV com conforto visual para tarefas de perto.',
    recommendation_notes:
      'Boa escolha para rotina escolar, universitaria ou profissional com uso intenso de celular e computador, principalmente quando o cliente quer uma opcao digital clara e simples.',
  },
  {
    family_name: 'EYEZEN® START STOCK | LENTES PRONTAS CRIZAL®',
    usage_tags: ['computador', 'smartphone', 'leitura', 'uso_digital'],
    benefit_tags: ['protecao_luz_azul', 'nitidez', 'disponibilidade_estoque', 'antirreflexo'],
    commercial_summary:
      'Versao pronta da proposta Eyezen Start, com disponibilidade mais rapida e combinacoes ja embarcadas com Crizal e Blue UV.',
    recommendation_notes:
      'Usar quando o cliente precisa de solucao rapida para rotina digital sem abrir mao de protecao Blue UV e antirreflexo conhecido.',
  },
  {
    family_name: 'LINHA KIDS',
    usage_tags: ['criancas', 'computador', 'estudo', 'controle_miopia'],
    benefit_tags: ['conforto_digital_infantil', 'controle_miopia', 'protecao_luz_azul', 'nitidez'],
    commercial_summary:
      'Familia infantil que reune Eyezen Kids para rotina digital e Stellest para controle de progressao de miopia.',
    recommendation_notes:
      'Separar bem a indicacao: Eyezen Kids atende conforto visual infantil em telas e estudo; Stellest entra quando existe estrategia clinica de controle de miopia.',
  },
  {
    family_name: 'LENTES ESSILOR®',
    usage_tags: ['intermediario', 'computador', 'leitura', 'uso_geral'],
    benefit_tags: ['versatilidade', 'opcoes_materiais', 'protecao_luz_azul', 'conforto_visual'],
    commercial_summary:
      'Familia guarda-chuva com linhas intermediarias, visao simples surfacada e solares, exigindo escolha da sublinha para fechar a indicacao.',
    recommendation_notes:
      'Usar a familia apenas como porta de entrada. A recomendacao final deve descer para a sublinha correta, como Interview ou visao simples surfacada.',
  },
  {
    family_name: 'LENTES KODAK®',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['versatilidade', 'personalizacao', 'opcoes_materiais', 'portfolio_amplo'],
    commercial_summary:
      'Portfolio guarda-chuva de multifocais, ocupacionais, visao simples e solares KODAK, com forte variacao entre sublinhas e materiais.',
    recommendation_notes:
      'Para sugestao por IA, tratar esta familia como catalogo amplo. A indicacao final deve sempre ser refinada ate a sublinha, como Unique, Precise, Network, SoftWear ou Single.',
  },
  {
    family_name: 'LENTES ESPACE®',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['versatilidade', 'conforto_visual', 'fotossensivel', 'opcoes_materiais'],
    commercial_summary:
      'Familia com versoes digital, tradicional e fotossensivel, util para rotina geral e composicao com tratamentos conhecidos da tabela.',
    recommendation_notes:
      'Boa familia para quem precisa de versatilidade comercial e tecnica; a recomendacao melhora quando se diferencia Espace, Espace Plus e as variantes com foto ou solar.',
  },
  {
    family_name: 'LENTES BIFOCAIS',
    usage_tags: ['leitura', 'distancia', 'uso_geral'],
    benefit_tags: ['nitidez', 'custo_beneficio', 'perto_longe_direto', 'adaptacao_tradicional'],
    commercial_summary:
      'Alternativa bifocal segmentada para clientes que preferem separar longe e perto de forma direta, com segmento visivel.',
    recommendation_notes:
      'Usar quando o cliente ja esta adaptado a bifocal, busca custo mais controlado ou nao deseja corredor progressivo.',
  },
  {
    family_name: 'iTop',
    usage_tags: ['uso_geral', 'computador', 'sol', 'foto'],
    benefit_tags: ['versatilidade', 'opcoes_materiais', 'fotossensivel', 'disponibilidade_estoque'],
    commercial_summary:
      'Linha mista de lentes acabadas e surfacadas digitais, com opcoes foto, protecao UV e diferentes indices para compor venda flexivel.',
    recommendation_notes:
      'Boa familia para oferta flexivel quando a otica quer cruzar custo, indice, disponibilidade e presenca de opcoes foto na mesma linha.',
  },
  {
    family_name: 'LENTES VS SOLARES PLANAS ACABADAS',
    usage_tags: ['sol', 'dirigir_dia', 'uso_externo'],
    benefit_tags: ['coloracao', 'disponibilidade_estoque', 'versatilidade', 'pronta_entrega'],
    commercial_summary:
      'Lentes solares planas prontas, focadas em disponibilidade rapida e variedade de cores para compor oculos solares.',
    recommendation_notes:
      'Indicar quando o objetivo principal e solar pronta com escolha de cor, degrade ou material, sem depender de surfacagem complexa.',
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
