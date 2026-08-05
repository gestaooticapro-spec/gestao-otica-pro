import type { RecommendationCaseInput } from '@/lib/server/lens-recommendation'

export type EvaluationCaseForm = {
  ageYears?: string | null
  marcaAtual?: string | null
  tipoLenteAtual?: string | null
  usaMultifocalHoje?: string | null
  dificuldadeAdaptacao?: string | null
  historicoTrocasRecentes?: string | null
  prioridadePrincipal?: string | null
  principalIncomodoAtual?: string | null
  objetivoCompra?: string | null
  budgetTarget?: string | null
  aceitaPremium?: string | null
  importanciaEstetica?: string | null
  importanciaResistencia?: string | null
  prefereTransitions?: string | null
  prefereBlueUv?: string | null
  queixaDirigirNoite?: string | null
  queixaSensibilidadeLuz?: string | null
  queixaQuebraOculos?: string | null
  queixaCriancaAtiva?: string | null
  queixaProgressaoRapida?: string | null
  observacoesConsultor?: string | null
  sourceExamType?: string | null
  estiloVidaUsoComputadorHoras?: string | null
  estiloVidaDirigirHoras?: string | null
  estiloVidaLeituraHoras?: string | null
  estiloVidaUsoCelularHoras?: string | null
  estiloVidaExposicaoSolHoras?: string | null
  estiloVidaAmbienteExternoHoras?: string | null
  receitaLongeOdEsferico?: string | null
  receitaLongeOdCilindrico?: string | null
  receitaLongeOdEixo?: string | null
  receitaLongeOeEsferico?: string | null
  receitaLongeOeCilindrico?: string | null
  receitaLongeOeEixo?: string | null
  receitaAdicao?: string | null
  olhosUtilizaveis?: 'ambos' | 'od' | 'oe' | null
}

function numberValue(value: string | null | undefined) {
  if (!value?.trim()) return null
  const parsed = Number(value.replace(',', '.').replace('+', '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function integerValue(value: string | null | undefined) {
  const number = numberValue(value)
  return number === null ? null : Math.trunc(number)
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

/**
 * Contrato único entre a entrevista (Torre ou loja full) e o motor de indicação.
 * As telas podem ter experiências diferentes, mas não podem interpretar os mesmos
 * dados clínicos/comerciais de formas diferentes.
 */
export function buildRecommendationCaseInput(form: EvaluationCaseForm): RecommendationCaseInput {
  const odSphere = numberValue(form.receitaLongeOdEsferico)
  const odCylinder = numberValue(form.receitaLongeOdCilindrico)
  const odAxis = numberValue(form.receitaLongeOdEixo)
  const oeSphere = numberValue(form.receitaLongeOeEsferico)
  const oeCylinder = numberValue(form.receitaLongeOeCilindrico)
  const oeAxis = numberValue(form.receitaLongeOeEixo)
  const adicao = numberValue(form.receitaAdicao)
  const odStrength = Math.abs(odSphere ?? 0) + Math.abs(odCylinder ?? 0)
  const oeStrength = Math.abs(oeSphere ?? 0) + Math.abs(oeCylinder ?? 0)
  const eyesUsed = form.olhosUtilizaveis === 'od' || form.olhosUtilizaveis === 'oe'
    ? form.olhosUtilizaveis
    : 'ambos'
  const useOd = eyesUsed === 'od' || (eyesUsed !== 'oe' && odStrength >= oeStrength)
  const age = integerValue(form.ageYears)
  const rotina: string[] = []
  const objetivos: string[] = []
  const beneficios: string[] = []
  const preferencias: string[] = []
  const rejeitados: string[] = []
  const computador = integerValue(form.estiloVidaUsoComputadorHoras) ?? 0
  const celular = integerValue(form.estiloVidaUsoCelularHoras) ?? 0
  const leitura = integerValue(form.estiloVidaLeituraHoras) ?? 0
  const dirigir = integerValue(form.estiloVidaDirigirHoras) ?? 0
  const sol = integerValue(form.estiloVidaExposicaoSolHoras) ?? 0
  const externo = integerValue(form.estiloVidaAmbienteExternoHoras) ?? 0
  const wantsOfficeLens = form.objetivoCompra === 'oculos_escritorio' || form.objetivoCompra === 'ocupacional_escritorio'
  const hasAddition = adicao !== null && adicao > 0

  if (computador >= 3) rotina.push('computador')
  if (celular >= 2) rotina.push('celular')
  if (leitura >= 2) rotina.push('leitura')
  if (dirigir >= 2) rotina.push('dirigir')
  if (sol >= 2 || externo >= 2) rotina.push('sol')
  if (hasAddition || (age !== null && age >= 45)) {
    objetivos.push('presbiopia')
    beneficios.push('adaptacao_rapida', 'conforto_visual')
  }
  if (form.dificuldadeAdaptacao === 'alta') {
    rotina.push('adaptacao_critica')
    objetivos.push('adaptacao_critica')
    beneficios.push('adaptacao_rapida')
  }
  if (form.dificuldadeAdaptacao === 'alta' && ['uma', 'duas', 'mais_de_duas'].includes(form.historicoTrocasRecentes || '')) {
    beneficios.push('adaptacao_rapida', 'conforto_visual')
  }
  if (form.queixaDirigirNoite === 'sim') rotina.push('dirigir_noite')
  if (form.queixaSensibilidadeLuz === 'sim') {
    beneficios.push('conforto_luz')
    if (form.prefereTransitions !== 'nao') preferencias.push('transitions')
  }
  if (form.prefereTransitions === 'sim') { preferencias.push('transitions'); beneficios.push('conforto_luz') }
  if (form.prefereBlueUv === 'sim') { preferencias.push('blue_uv'); beneficios.push('conforto_digital') }
  if (age !== null && age <= 14) rotina.push('crianca')
  if (form.queixaCriancaAtiva === 'sim') { rotina.push('crianca_ativa'); beneficios.push('resistencia') }
  if (form.queixaQuebraOculos === 'sim') { rotina.push('risco_quebra'); beneficios.push('resistencia') }
  if (form.queixaProgressaoRapida === 'sim') { rotina.push('controle_miopia'); objetivos.push('controle_miopia'); beneficios.push('controle_miopia') }
  if (wantsOfficeLens && hasAddition) { objetivos.push('ocupacional'); rotina.push('computador'); beneficios.push('conforto_visual', 'conforto_digital', 'campo_intermediario') }
  const alreadyUsesMultifocal = form.usaMultifocalHoje === 'sim' || form.tipoLenteAtual === 'multifocal'
  if (hasAddition && !wantsOfficeLens && (!alreadyUsesMultifocal || form.objetivoCompra === 'primeira_multifocal')) {
    objetivos.push('primeira_multifocal')
    beneficios.push('adaptacao_rapida', 'conforto_visual')
  }

  if (form.prioridadePrincipal === 'economia') { objetivos.push('custo_beneficio'); beneficios.push('custo_beneficio') }
  if (form.prioridadePrincipal === 'premium') objetivos.push('premium')
  if (form.prioridadePrincipal === 'adaptacao') beneficios.push('adaptacao_rapida')
  if (form.prioridadePrincipal === 'resistencia') beneficios.push('resistencia')
  if (form.prioridadePrincipal === 'controle_miopia' || form.objetivoCompra === 'controle_miopia') { rotina.push('controle_miopia'); objetivos.push('controle_miopia'); beneficios.push('controle_miopia') }
  if (form.importanciaResistencia === 'alta') beneficios.push('resistencia')
  if (form.importanciaEstetica === 'alta' || form.principalIncomodoAtual === 'peso_espessura') beneficios.push('estetica', 'lente_fina')
  if (form.principalIncomodoAtual === 'reflexo') beneficios.push('antirreflexo', 'conforto_visual')
  if (form.principalIncomodoAtual === 'adaptacao') beneficios.push('adaptacao_rapida')
  if (form.principalIncomodoAtual === 'perto') { rotina.push('perto', 'leitura'); beneficios.push('campo_perto', 'conforto_proximo') }
  if (form.principalIncomodoAtual === 'intermediario') { rotina.push('intermediario'); beneficios.push('campo_intermediario', 'ergonomia_visual') }
  if (form.principalIncomodoAtual === 'longe') { rotina.push('longe'); beneficios.push('nitidez_longe', 'campo_visual_amplo') }
  if (form.principalIncomodoAtual === 'preco') { objetivos.push('custo_beneficio'); beneficios.push('custo_beneficio') }
  if (form.aceitaPremium === 'sim') { objetivos.push('premium'); beneficios.push('qualidade_optica') }
  if (form.aceitaPremium === 'nao') rejeitados.push('premium')

  const targetBudget = numberValue(form.budgetTarget)
  let budgetMode: 'economico' | 'intermediario' | 'premium' = 'intermediario'
  if (targetBudget !== null) {
    if (targetBudget <= 2000) budgetMode = 'economico'
    else if (targetBudget > 5000) budgetMode = 'premium'
  }
  if (form.prioridadePrincipal === 'economia' || form.principalIncomodoAtual === 'preco') budgetMode = 'economico'
  if (form.prioridadePrincipal === 'premium' || form.aceitaPremium === 'sim') budgetMode = 'premium'

  return {
    idade: age,
    marca_atual: form.marcaAtual?.trim() || null,
    esferico: useOd ? odSphere : oeSphere,
    cilindrico: useOd ? odCylinder : oeCylinder,
    adicao,
    receita: {
      od: { esferico: odSphere, cilindrico: odCylinder, eixo: odAxis },
      oe: { esferico: oeSphere, cilindrico: oeCylinder, eixo: oeAxis },
      olhos_utilizaveis: eyesUsed,
    },
    rotina_tags: unique(rotina),
    objetivo_tags: unique(objetivos),
    desired_benefits: unique(beneficios),
    preferred_features: unique(preferencias),
    rejected_features: unique(rejeitados),
    budget_mode: budgetMode,
    budget_signal: targetBudget !== null ? 'informado' : 'nao_informado',
    targetPrice: targetBudget && targetBudget > 0 ? targetBudget : null,
    adaptation_difficulty: ['baixa', 'media', 'alta'].includes(form.dificuldadeAdaptacao || '') ? form.dificuldadeAdaptacao as RecommendationCaseInput['adaptation_difficulty'] : null,
    notes: [form.sourceExamType?.trim(), form.observacoesConsultor?.trim()].filter(Boolean).join(' | ') || null,
  }
}
