import fs from 'fs/promises'
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

const OUTPUT_JSON = '.tabelas/auditoria_tratamentos_semantica_correcoes.json'
const OUTPUT_MD = '.tabelas/auditoria_tratamentos_semantica_correcoes.md'

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTier(value) {
  const n = normalize(value).replace(/-/g, '_').replace(/\s+/g, '_')
  if (!n || n.includes('indefinido')) return null
  if (n.startsWith('premium') || n.includes('ultra_premium')) return 'premium'
  if (n.includes('intermediaria') || n.includes('intermediario') || n.includes('equilibrado')) return 'intermediaria'
  if (n.includes('entrada') || n.includes('economico') || n.includes('basico')) return 'entrada'
  if (n.includes('especializado')) return 'especializado'
  return null
}

const RULES = [
  {
    key: 'crizal_sapphire_hr',
    aliases: [/^crizal sapphire hr$/, /^antirreflexo crizal sapphire hr\b/, /^crizal sapphire hr face interna$/],
    tier: 'premium',
    priceTier: 'premium',
    positioning: 'premium',
    evidence: 'Essilor PRO posiciona Sapphire HR como coating antirreflexo premium/topo geral.',
    severity: 'alta',
    semantic: {
      usage_tags: ['uso_diario', 'telas', 'dirigir_noite', 'computador'],
      benefit_tags: ['antirreflexo', 'clareza', 'conforto_visual', 'qualidade_optica', 'ar_premium'],
      commercial_summary: 'Antirreflexo premium com foco em transparencia, clareza e desempenho geral.',
      recommendation_notes: 'Sobe quando o caso pede AR premium, direcao noturna e melhor transparencia.',
    },
  },
  {
    key: 'crizal_rock',
    aliases: [/^crizal rock$/, /^antirreflexo crizal rock$/],
    tier: 'premium',
    priceTier: 'premium',
    positioning: 'premium',
    evidence: 'Essilor PRO descreve Crizal Rock como no-glare mais resistente a riscos da linha Crizal; scripts Optilab ja o tratavam como premium_durabilidade.',
    severity: 'alta',
    semantic: {
      usage_tags: ['uso_diario', 'dirigir_noite', 'computador'],
      benefit_tags: ['antirreflexo', 'durabilidade', 'resistencia_riscos', 'conforto_visual', 'ar_premium'],
      commercial_summary: 'Antirreflexo premium com foco em durabilidade, riscos e manchas.',
      recommendation_notes: 'Sobe quando o caso pede AR premium com maior robustez de uso.',
    },
  },
  {
    key: 'crizal_prevencia',
    aliases: [/^crizal prevencia$/, /^antirreflexo crizal prevencia$/],
    tier: 'premium',
    priceTier: 'premium',
    positioning: 'premium',
    evidence: 'Crizal Prevencia e AR Crizal com filtragem azul-violeta e protecao UV, modelado como premium nas semanticas Essilor.',
    severity: 'alta',
    semantic: {
      usage_tags: ['uso_diario', 'telas', 'computador', 'celular'],
      benefit_tags: ['antirreflexo', 'protecao_luz_azul', 'conforto_digital', 'conforto_visual', 'ar_premium'],
      commercial_summary: 'Antirreflexo premium com filtragem seletiva de luz azul-violeta.',
      recommendation_notes: 'Sobe quando blue/UV e uso digital sao prioridades.',
    },
  },
  {
    key: 'crizal_easy_pro',
    aliases: [/^crizal easy pro$/, /^antirreflexo crizal easy pro$/],
    tier: 'intermediaria',
    priceTier: 'intermediario',
    positioning: 'intermediaria',
    evidence: 'Crizal Easy Pro aparece como opcao Crizal de acesso/intermediaria, abaixo de Sapphire HR/Rock/Prevencia.',
    severity: 'alta',
    semantic: {
      usage_tags: ['uso_diario', 'telas', 'computador'],
      benefit_tags: ['antirreflexo', 'facilidade_limpeza', 'conforto_visual'],
      commercial_summary: 'Antirreflexo Crizal de acesso/intermediario para rotina diaria.',
      recommendation_notes: 'Sobe quando o caso pede Crizal com bom custo-beneficio.',
    },
  },
  {
    key: 'trio_easy_clean',
    aliases: [/^trio easy clean$/, /^antirreflexo trio easy clean$/],
    tier: 'entrada',
    priceTier: 'economico',
    positioning: 'entrada',
    evidence: 'Tratamento de entrada por posicionamento relativo na tabela Optilab.',
    severity: 'alta',
    semantic: {
      usage_tags: ['uso_diario'],
      benefit_tags: ['antirreflexo', 'custo_beneficio'],
      commercial_summary: 'Antirreflexo de entrada com foco em custo-beneficio.',
      recommendation_notes: 'Sobe quando o orcamento e o principal limitador.',
    },
  },
  {
    key: 'no_reflex',
    aliases: [/^no reflex$/, /^antirreflexo no reflex$/],
    tier: 'entrada',
    priceTier: 'economico',
    positioning: 'entrada',
    evidence: 'Tratamento de entrada por posicionamento relativo na tabela Optilab.',
    severity: 'alta',
    semantic: {
      usage_tags: ['uso_diario'],
      benefit_tags: ['antirreflexo', 'custo_beneficio'],
      commercial_summary: 'Antirreflexo de entrada para reduzir reflexos com investimento menor.',
      recommendation_notes: 'Sobe quando a prioridade e preco controlado.',
    },
  },
  {
    key: 'vert_clair',
    aliases: [/^vert clair$/, /^antirreflexo vert clair plus$/],
    tier: 'intermediaria',
    priceTier: 'intermediario',
    positioning: 'intermediaria',
    evidence: 'Tratamento intermediario por posicionamento relativo na tabela Optilab.',
    severity: 'media',
    semantic: {
      usage_tags: ['uso_diario', 'computador'],
      benefit_tags: ['antirreflexo', 'claridade', 'conforto_visual'],
      commercial_summary: 'Antirreflexo intermediario usado como alternativa comercial de claridade e conforto visual.',
      recommendation_notes: 'Sobe quando a loja precisa de alternativa entre entrada e premium.',
    },
  },
  {
    key: 'optifog',
    aliases: [/^optifog$/, /^antirreflexo optifog$/],
    tier: 'especializado',
    priceTier: 'premium',
    positioning: 'especializado',
    evidence: 'Tratamento especializado antiembacamento; nao deve ser confundido com AR premium geral.',
    severity: 'media',
    semantic: {
      usage_tags: ['mascara', 'cozinha', 'academia', 'ambiente_umido'],
      benefit_tags: ['antiembacamento', 'antirreflexo', 'facilidade_limpeza'],
      commercial_summary: 'Tratamento especializado antiembacamento com antirreflexo.',
      recommendation_notes: 'Sobe quando embacamento e queixa central.',
    },
  },
]

function findRule(name) {
  const n = normalize(name)
  return RULES.find((rule) => rule.aliases.some((alias) => alias.test(n))) || null
}

function relevantCurrentProfile(treatment) {
  const semantic = treatment.features?.semantic_profile
  if (!semantic || typeof semantic !== 'object') return null
  return {
    positioning: semantic.positioning ?? null,
    price_tier: semantic.price_tier ?? null,
    usage_tags: semantic.usage_tags ?? [],
    benefit_tags: semantic.benefit_tags ?? [],
    commercial_summary: semantic.commercial_summary ?? null,
    recommendation_notes: semantic.recommendation_notes ?? null,
  }
}

function needsCorrection(treatment, rule) {
  const current = relevantCurrentProfile(treatment)
  if (!current) return true
  const currentTier = normalizeTier(current.positioning) || normalizeTier(current.price_tier)
  if (currentTier !== rule.tier) return true
  if (rule.priceTier && normalizeTier(current.price_tier) !== normalizeTier(rule.priceTier)) return true
  return false
}

function proposedProfile(treatment, rule) {
  const currentSemantic = treatment.features?.semantic_profile
  return {
    ...(currentSemantic && typeof currentSemantic === 'object' ? currentSemantic : {}),
    ...rule.semantic,
    positioning: rule.positioning,
    price_tier: rule.priceTier,
    category: 'tratamento',
    evidence_level: rule.severity === 'alta' ? 'alto' : 'medio',
    evidence_type: 'auditoria_interna',
    source_quotes_or_points: [rule.evidence],
  }
}

async function main() {
  const { data: versions, error: versionsError } = await supabase
    .from('global_catalog_versions')
    .select('id,laboratorio,versao')

  if (versionsError) throw versionsError
  const versionById = new Map((versions || []).map((version) => [version.id, version]))

  const { data: treatments, error: treatmentsError } = await supabase
    .from('global_treatments')
    .select('id,version_id,nome,tipo,features')
    .order('nome', { ascending: true })

  if (treatmentsError) throw treatmentsError

  const corrections = []
  const reviewed = []

  for (const treatment of treatments || []) {
    const rule = findRule(treatment.nome)
    if (!rule) continue
    const version = versionById.get(treatment.version_id) || null
    const current = relevantCurrentProfile(treatment)
    const proposed = proposedProfile(treatment, rule)
    const item = {
      treatment_id: treatment.id,
      version_id: treatment.version_id,
      laboratorio: version?.laboratorio || null,
      versao: version?.versao || null,
      nome: treatment.nome,
      rule_key: rule.key,
      severity: rule.severity,
      evidence: rule.evidence,
      current,
      current_normalized_tier: current ? normalizeTier(current.positioning) || normalizeTier(current.price_tier) : null,
      proposed: {
        positioning: proposed.positioning,
        price_tier: proposed.price_tier,
        usage_tags: proposed.usage_tags,
        benefit_tags: proposed.benefit_tags,
        commercial_summary: proposed.commercial_summary,
        recommendation_notes: proposed.recommendation_notes,
      },
      full_proposed_semantic_profile: proposed,
      needs_correction: needsCorrection(treatment, rule),
    }

    reviewed.push(item)
    if (item.needs_correction) corrections.push(item)
  }

  const payload = {
    generated_at: new Date().toISOString(),
    dry_run: true,
    summary: {
      reviewed: reviewed.length,
      corrections: corrections.length,
      high_confidence: corrections.filter((item) => item.severity === 'alta').length,
      medium_confidence: corrections.filter((item) => item.severity === 'media').length,
    },
    corrections,
    reviewed_ok: reviewed.filter((item) => !item.needs_correction),
  }

  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')

  const lines = [
    '# Auditoria de Semantica de Tratamentos',
    '',
    `Gerado em: ${payload.generated_at}`,
    '',
    '## Resumo',
    '',
    `- Tratamentos revisados por regra: ${payload.summary.reviewed}`,
    `- Correcoes propostas: ${payload.summary.corrections}`,
    `- Alta confianca: ${payload.summary.high_confidence}`,
    `- Media confianca: ${payload.summary.medium_confidence}`,
    '',
    '## Correcoes Propostas',
    '',
  ]

  for (const item of corrections) {
    lines.push(`### ${item.laboratorio || 'Sem laboratorio'} | ${item.nome}`)
    lines.push('')
    lines.push(`- Versao: ${item.versao || 'n/a'}`)
    lines.push(`- Severidade: ${item.severity}`)
    lines.push(`- Tier atual: ${item.current_normalized_tier || 'sem semantica/indefinido'}`)
    lines.push(`- Tier proposto: ${item.proposed.positioning}`)
    lines.push(`- Price tier proposto: ${item.proposed.price_tier}`)
    lines.push(`- Evidencia: ${item.evidence}`)
    lines.push(`- Beneficios propostos: ${(item.proposed.benefit_tags || []).join(', ')}`)
    lines.push('')
  }

  lines.push('## Revisados Sem Mudanca')
  lines.push('')
  for (const item of payload.reviewed_ok) {
    lines.push(`- ${item.laboratorio || 'Sem laboratorio'} | ${item.nome} (${item.current_normalized_tier})`)
  }

  await fs.writeFile(OUTPUT_MD, `${lines.join('\n')}\n`, 'utf-8')

  console.log(`Relatorio JSON: ${OUTPUT_JSON}`)
  console.log(`Relatorio MD: ${OUTPUT_MD}`)
  console.log(`Correcoes propostas: ${payload.summary.corrections}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
