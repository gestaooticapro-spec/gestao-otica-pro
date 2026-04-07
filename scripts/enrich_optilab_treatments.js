import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Erro: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078';

const TREATMENT_PROFILES = [
  {
    names: ['Crizal Easy Pro', 'Antirreflexo Crizal Easy PRO'],
    semantic: {
      usage_tags: ['computador', 'uso_geral'],
      benefit_tags: ['custo_beneficio', 'facilidade_limpeza', 'antirreflexo'],
      price_tier: 'intermediario',
      positioning: 'equilibrado',
      commercial_summary:
        'Antirreflexo equilibrado da linha Crizal, pensado para rotina diária com boa limpeza e proposta comercial intermediária.',
      recommendation_notes:
        'Sobe quando o caso pede antirreflexo confiável com melhor custo-benefício que as opções mais premium.',
      explain_why:
        'Foi escolhido por equilibrar antirreflexo, limpeza e custo-benefício para rotina diária e uso de telas.',
      explain_not_selected_against: {
        'Crizal Sapphire HR':
          'O Sapphire HR entrega proposta mais premium; o Easy Pro costuma subir quando o orçamento pesa mais que o nível máximo de performance.',
        'Crizal Rock':
          'O Rock sobe mais quando a prioridade principal é resistência extrema a riscos e uso duro do dia a dia.',
        Optifog:
          'O Optifog só costuma vencer quando o embaçamento é uma dor principal, como uso de máscara, cozinha, academia ou ambientes úmidos.',
      },
      sources: [
        'https://www.essilorpro.com/resources/crizal',
        'https://www.essilorpro.com/content/dam/essilor-pro/crizal/316299_PRO_ZAL-Crizal_EasyPro_SA_updates_FNL.pdf',
      ],
    },
  },
  {
    names: ['Crizal Sapphire HR', 'Antirreflexo Crizal Sapphire HR (Face interna)'],
    semantic: {
      usage_tags: ['dirigir_noite', 'uso_geral', 'computador'],
      benefit_tags: ['claridade', 'durabilidade', 'facilidade_limpeza', 'antirreflexo'],
      price_tier: 'premium',
      positioning: 'premium',
      commercial_summary:
        'Antirreflexo premium com proposta de melhor desempenho geral, priorizando transparência, durabilidade, limpeza e proteção UV.',
      recommendation_notes:
        'Sobe quando o paciente valoriza máxima nitidez, menos reflexo, melhor transparência e acabamento premium.',
      explain_why:
        'Foi escolhido por entregar a proposta mais premium de antirreflexo geral, favorecendo claridade e conforto em várias situações de uso.',
      explain_not_selected_against: {
        'Crizal Easy Pro':
          'O Easy Pro costuma vencer quando a prioridade é custo-benefício. O Sapphire HR sobe quando o paciente aceita pagar por desempenho superior.',
        'Crizal Prevencia':
          'O Prevencia sobe quando a principal dor é luz azul-violeta. O Sapphire HR vence quando a necessidade é o melhor equilíbrio geral de performance.',
      },
      sources: [
        'https://www.essilorpro.com/resources/crizal',
        'https://www.essilorpro.com/resources/crizal/crizal-sapphire-hr',
      ],
    },
  },
  {
    names: ['Crizal Rock', 'Antirreflexo Crizal Rock'],
    semantic: {
      usage_tags: ['uso_intenso', 'trabalho_duro', 'esporte'],
      benefit_tags: ['durabilidade', 'resistencia_riscos', 'facilidade_limpeza', 'antirreflexo'],
      price_tier: 'premium',
      positioning: 'premium_durabilidade',
      commercial_summary:
        'Antirreflexo premium focado em resistência, com destaque para riscos, sujeira e rotina mais agressiva de uso.',
      recommendation_notes:
        'Sobe quando o paciente risca muito as lentes, limpa de forma inadequada ou precisa de solução mais robusta para dia a dia corrido.',
      explain_why:
        'Foi escolhido por oferecer a proposta mais forte de durabilidade e resistência a riscos entre os antirreflexos disponíveis.',
      explain_not_selected_against: {
        'Crizal Easy Pro':
          'O Easy Pro costuma vencer em custo-benefício, enquanto o Rock sobe quando a durabilidade é a prioridade principal.',
        'Crizal Sapphire HR':
          'O Sapphire HR é mais equilibrado no premium geral; o Rock sobe quando o diferencial decisivo é resistência a riscos e desgaste.',
      },
      sources: [
        'https://www.essilorpro.com/resources/crizal',
        'https://www.essilorpro.com/resources/crizal/crizal-rock',
      ],
    },
  },
  {
    names: ['Crizal Prevencia', 'Antirreflexo Crizal Prevencia'],
    semantic: {
      usage_tags: ['computador', 'smartphone', 'tablet'],
      benefit_tags: ['protecao_luz_azul', 'antirreflexo', 'protecao_uv'],
      price_tier: 'premium',
      positioning: 'premium_luz_azul',
      commercial_summary:
        'Antirreflexo com filtragem seletiva de luz azul-violeta, indicado quando proteção de telas e conforto com luz são prioridades.',
      recommendation_notes:
        'Sobe quando o paciente relata rotina intensa de telas ou sensibilidade à luz azul-violeta e aceita um tratamento mais direcionado.',
      explain_why:
        'Foi escolhido por combinar antirreflexo com proteção à luz azul-violeta, o que faz sentido em rotina forte de computador e celular.',
      explain_not_selected_against: {
        'Crizal Easy Pro':
          'O Easy Pro sobe em custo-benefício. O Prevencia sobe quando a proteção à luz azul-violeta é um objetivo central da recomendação.',
        'Crizal Sapphire HR':
          'O Sapphire HR vence em proposta premium geral; o Prevencia ganha quando a narrativa principal é proteção à luz azul-violeta.',
      },
      sources: [
        'https://www.essilorpro.com/resources/crizal',
        'https://www.essilorpro.com/resources/crizal/crizal-prevencia',
      ],
    },
  },
  {
    names: ['Optifog', 'Antirreflexo Optifog'],
    semantic: {
      usage_tags: ['mascara', 'cozinha', 'academia', 'ambiente_umido'],
      benefit_tags: ['antiembaçamento', 'antirreflexo', 'facilidade_limpeza'],
      price_tier: 'premium',
      positioning: 'especializado',
      commercial_summary:
        'Tratamento premium antiembaçamento com antirreflexo, pensado para pacientes incomodados com fog em rotina real.',
      recommendation_notes:
        'Sobe quando embaçamento é a queixa central, especialmente em uso de máscara, cozinha, bebida quente ou atividade física.',
      explain_why:
        'Foi escolhido porque o problema principal não é só reflexo, mas embaçamento recorrente durante a rotina.',
      explain_not_selected_against: {
        'Crizal Easy Pro':
          'O Easy Pro é melhor quando a prioridade é custo-benefício em antirreflexo. O Optifog sobe quando o embaçamento muda a experiência de uso.',
      },
      sources: ['https://dev.essilorpro.com/technology/anti-fog-solutions'],
    },
  },
  {
    names: ['Trio Easy Clean', 'Antirreflexo Trio Easy Clean'],
    semantic: {
      usage_tags: ['uso_geral', 'computador'],
      benefit_tags: ['facilidade_limpeza', 'antirreflexo', 'custo_beneficio'],
      price_tier: 'economico',
      positioning: 'entrada',
      commercial_summary:
        'Antirreflexo de entrada com proposta prática de limpeza e acesso a um preço menor.',
      recommendation_notes:
        'Sobe quando o objetivo é manter tratamento antirreflexo com menor investimento total.',
      explain_why:
        'Foi escolhido porque mantém antirreflexo com preço mais contido, útil quando o caso pede economia sem abrir mão do tratamento.',
      explain_not_selected_against: {
        'Crizal Easy Pro':
          'O Easy Pro tende a oferecer pacote mais equilibrado de performance; o Trio Easy Clean sobe quando o orçamento é o principal freio.',
      },
      sources: ['Inferência controlada a partir da tabela Optilab página 43 e posicionamento de preço relativo.'],
    },
  },
  {
    names: ['Vert Clair', 'Antirreflexo Vert Clair Plus'],
    semantic: {
      usage_tags: ['uso_geral', 'computador'],
      benefit_tags: ['antirreflexo', 'claridade'],
      price_tier: 'intermediario',
      positioning: 'intermediario',
      commercial_summary:
        'Antirreflexo intermediário usado como alternativa comercial de claridade e conforto visual no dia a dia.',
      recommendation_notes:
        'Sobe quando a ótica precisa de uma alternativa intermediária entre entrada e premium.',
      explain_why:
        'Foi escolhido por entregar antirreflexo intermediário com proposta comercial equilibrada.',
      explain_not_selected_against: {
        'Crizal Easy Pro':
          'O Easy Pro tende a ganhar quando a narrativa de marca Crizal e facilidade de limpeza são mais relevantes.',
      },
      sources: ['Inferência controlada a partir da tabela Optilab e posicionamento de preço relativo.'],
    },
  },
  {
    names: ['No Reflex', 'Antirreflexo No Reflex'],
    semantic: {
      usage_tags: ['uso_geral'],
      benefit_tags: ['antirreflexo', 'custo_beneficio'],
      price_tier: 'economico',
      positioning: 'entrada',
      commercial_summary:
        'Antirreflexo de entrada voltado a reduzir reflexos com investimento mais baixo.',
      recommendation_notes:
        'Sobe quando a prioridade é preço mais controlado e o paciente quer apenas o benefício básico do antirreflexo.',
      explain_why:
        'Foi escolhido por priorizar preço mais baixo mantendo o benefício básico do antirreflexo.',
      explain_not_selected_against: {
        'Crizal Easy Pro':
          'O Easy Pro sobe quando a ótica quer entregar mais percepção de valor e facilidade de limpeza.',
      },
      sources: ['Inferência controlada a partir da tabela Optilab e posicionamento de preço relativo.'],
    },
  },
  {
    names: ['Verniz Hc'],
    semantic: {
      usage_tags: ['uso_geral'],
      benefit_tags: ['proteção_basica'],
      price_tier: 'economico',
      positioning: 'basico',
      commercial_summary:
        'Revestimento básico de proteção, útil quando não se deseja subir para um antirreflexo completo.',
      recommendation_notes:
        'Serve como opção mínima quando o orçamento é muito restrito ou quando o caso não pede tratamento mais sofisticado.',
      explain_why:
        'Foi escolhido como solução básica de revestimento, abaixo de um antirreflexo completo.',
      explain_not_selected_against: {},
      sources: ['Inferência controlada a partir da tabela Optilab.'],
    },
  },
];

function parseArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const versionId = parseArg('--version-id') || VERSION_ID;

  const { data: treatments, error: treatmentsError } = await supabase
    .from('global_treatments')
    .select('id,nome,features')
    .eq('version_id', versionId);

  if (treatmentsError) throw treatmentsError;

  let updated = 0;

  for (const profile of TREATMENT_PROFILES) {
    const matched = treatments.filter((treatment) => profile.names.includes(treatment.nome));

    for (const treatment of matched) {
      const mergedFeatures = {
        ...(treatment.features || {}),
        semantic_profile: profile.semantic,
      };

      const { error } = await supabase
        .from('global_treatments')
        .update({ features: mergedFeatures })
        .eq('id', treatment.id);

      if (error) throw error;
      updated += 1;
    }
  }

  console.log(`Tratamentos enriquecidos: ${updated}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
