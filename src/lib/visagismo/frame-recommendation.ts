import type { GlobalVisagismoFrameTemplate } from '@/lib/actions/visagismo.actions'
import type { FaceAnalysisResult } from './face-analysis'

export type FrameRecommendation = {
  templateId: string
  name: string
  score: number
  reasons: string[]
}

export function recommendFramesForFace(
  analysis: FaceAnalysisResult,
  templates: GlobalVisagismoFrameTemplate[],
): FrameRecommendation[] {
  return templates
    .map((template) => scoreTemplate(template, analysis))
    .sort((a, b) => b.score - a.score)
}

function scoreTemplate(
  template: GlobalVisagismoFrameTemplate,
  analysis: FaceAnalysisResult,
): FrameRecommendation {
  const label = `${template.name} ${template.category ?? ''}`.toLowerCase()
  const traits = analysis.traits
  const reasons: string[] = []
  let score = 54

  if (matches(label, ['retangular', 'quadrado'])) {
    score += traits.softLines * 22
    score += traits.wideFace * 8
    if (traits.softLines > 0.58) reasons.push('cria mais estrutura para linhas suaves do rosto')
    if (analysis.faceShape === 'round') reasons.push('ajuda a equilibrar um rosto mais arredondado')
  }

  if (matches(label, ['arredondado', 'redondo', 'oval', 'panto'])) {
    score += traits.angularLines * 22
    score += traits.verticalFace * 6
    if (traits.angularLines > 0.42) reasons.push('suaviza linhas mais marcadas da mandibula e testa')
    if (analysis.faceShape === 'square') reasons.push('reduz a leitura muito reta do rosto')
  }

  if (matches(label, ['gatinho', 'cat'])) {
    score += traits.upperFaceDominance * 9
    score += (1 - traits.lowerFaceDominance) * 8
    score += traits.softLines * 7
    reasons.push('levanta visualmente a expressao e cria uma linha ascendente')
  }

  if (matches(label, ['aviador'])) {
    score += traits.verticalFace * 9
    score += traits.upperFaceDominance * 8
    score += (1 - traits.angularLines) * 5
    reasons.push('traz presenca sem deixar o visual excessivamente reto')
  }

  if (analysis.faceShape === 'oval' || analysis.faceShape === 'balanced') {
    score += 8
    reasons.push('o rosto tem proporcoes equilibradas e aceita bem este formato')
  }

  if (traits.verticalFace > 0.62 && matches(label, ['retangular'])) {
    score -= 8
    reasons.push('pode alongar um pouco mais a leitura vertical')
  }

  if (traits.wideFace > 0.72 && matches(label, ['arredondado'])) {
    score -= 5
    reasons.push('pode reforcar a suavidade lateral; vale comparar com formatos mais estruturados')
  }

  return {
    templateId: template.id,
    name: template.name,
    score: Math.round(Math.min(96, Math.max(35, score))),
    reasons: reasons.length ? [...new Set(reasons)].slice(0, 3) : ['boa opcao para comparacao visual neste rosto'],
  }
}

function matches(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle))
}

