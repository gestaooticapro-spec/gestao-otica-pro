import type { GlobalVisagismoFrameTemplate } from '@/lib/actions/visagismo.actions'
import type { FaceAnalysisResult } from './face-analysis'

export type CustomerStyleProfile = {
  style: 'none' | 'discrete' | 'classic' | 'modern' | 'striking'
  expression: 'none' | 'masculine' | 'feminine' | 'neutral'
  goals: Array<'soften' | 'structure' | 'rejuvenate' | 'lift'>
  avoid: Array<'cat-eye' | 'round' | 'large' | 'strong' | 'rimless' | 'semi-rimless'>
}

export type FrameRecommendation = {
  templateId: string
  name: string
  score: number
  reasons: string[]
}

export function recommendFramesForFace(
  analysis: FaceAnalysisResult,
  templates: GlobalVisagismoFrameTemplate[],
  customerProfile?: CustomerStyleProfile,
): FrameRecommendation[] {
  return templates
    .map((template) => scoreTemplate(template, analysis, customerProfile))
    .sort((a, b) => b.score - a.score)
}

function scoreTemplate(
  template: GlobalVisagismoFrameTemplate,
  analysis: FaceAnalysisResult,
  customerProfile?: CustomerStyleProfile,
): FrameRecommendation {
  const label = `${template.name} ${template.category ?? ''}`.toLowerCase()
  const profile = template.profile
  const construction = template.construction
  const traits = analysis.traits
  const reasons: string[] = []
  let score = 54
  const faceFit = scoreFaceShapeFit(profile, analysis.faceShape)
  score += faceFit.score
  reasons.push(...faceFit.reasons)

  if (profile.lineStyle === 'straight') {
    score += traits.softLines * 8
    if (traits.softLines > 0.58) reasons.push('cria mais estrutura para linhas suaves do rosto')
  }

  if (profile.lineStyle === 'curved') {
    score += traits.angularLines * 8
    if (traits.angularLines > 0.42) reasons.push('suaviza linhas mais marcadas da mandibula e testa')
  }

  if (profile.direction === 'ascending') {
    score += traits.upperFaceDominance * 6
    score += (1 - traits.lowerFaceDominance) * 5
    reasons.push('levanta visualmente a expressao e cria uma linha ascendente')
  }

  if (profile.visualWidth === 'wide') {
    score += traits.verticalFace * 5
    if (analysis.faceShape === 'long') reasons.push('abre mais a leitura horizontal do rosto')
  }

  if (profile.lensHeight === 'high') {
    score += traits.verticalFace * 4
    if (analysis.faceShape === 'long') reasons.push('ocupa melhor a altura do rosto sem estreitar demais')
  }

  if (profile.effects.includes('structures')) {
    score += traits.softLines * 5
  }

  if (profile.effects.includes('softens')) {
    score += traits.angularLines * 5
  }

  if (profile.effects.includes('lifts')) {
    score += traits.upperFaceDominance * 4
  }

  if (['rectangular', 'square', 'wayfarer', 'geometric'].includes(profile.shape) || matches(label, ['retangular', 'quadrado'])) {
    score += traits.softLines * 14
    score += traits.wideFace * 6
    if (traits.softLines > 0.58) reasons.push('cria mais estrutura para linhas suaves do rosto')
    if (analysis.faceShape === 'round') reasons.push('ajuda a equilibrar um rosto mais arredondado')
  }

  if (['round', 'oval', 'panto'].includes(profile.shape) || matches(label, ['arredondado', 'redondo', 'oval', 'panto'])) {
    score += traits.angularLines * 13
    score += traits.verticalFace * 4
    if (traits.angularLines > 0.42) reasons.push('suaviza linhas mais marcadas da mandibula e testa')
    if (analysis.faceShape === 'square') reasons.push('reduz a leitura muito reta do rosto')
  }

  if (profile.shape === 'cat-eye' || matches(label, ['gatinho', 'cat'])) {
    score += traits.upperFaceDominance * 9
    score += (1 - traits.lowerFaceDominance) * 8
    score += traits.softLines * 7
    reasons.push('levanta visualmente a expressao e cria uma linha ascendente')
  }

  if (profile.shape === 'aviator' || matches(label, ['aviador'])) {
    score += traits.verticalFace * 9
    score += traits.upperFaceDominance * 8
    score += (1 - traits.angularLines) * 5
    reasons.push('traz presenca sem deixar o visual excessivamente reto')
  }

  if (profile.shape === 'geometric') {
    score += traits.softLines * 8
    score += traits.angularLines * 3
    reasons.push('adiciona personalidade com leitura moderna e estruturada')
  }

  if (analysis.faceShape === 'oval' || analysis.faceShape === 'balanced') {
    score += 8
    reasons.push('o rosto tem proporcoes equilibradas e aceita bem este formato')
  }

  if (traits.verticalFace > 0.62 && (profile.shape === 'rectangular' || profile.lensHeight === 'low')) {
    score -= 8
    reasons.push('pode alongar um pouco mais a leitura vertical')
  }

  if (traits.verticalFace > 0.7 && profile.effects.includes('elongates')) {
    score *= 0.88
    reasons.push('pode alongar um rosto que ja tem leitura vertical forte')
  }

  if (traits.wideFace > 0.72 && ['round', 'oval'].includes(profile.shape)) {
    score -= 14
    reasons.push('pode reforcar a largura; vale comparar com formatos mais estruturados')
  }

  if (customerProfile) {
    const customer = scoreCustomerProfile(profile, construction, customerProfile)
    score += customer.score
    reasons.push(...customer.reasons)

    if (hasHardAvoid(profile, construction, customerProfile)) {
      score = Math.min(score, 34)
      reasons.unshift('foi mantida fora das principais opcoes por restricao marcada pelo cliente')
    }

    if (hasSoftLargeAvoid(profile, customerProfile)) {
      score = Math.min(score, 55)
      reasons.unshift('foi rebaixada porque a largura conflita com a preferencia por modelos menores')
    }

    if (customerProfile.goals.includes('soften') && profile.lineStyle === 'straight') {
      score = Math.min(score, 78)
    }

    if (customerProfile.goals.includes('lift') && profile.direction === 'descending') {
      score = Math.min(score, 42)
      reasons.unshift('foi rebaixada porque a linha descendente conflita com o objetivo de levantar a expressao')
    }
  }

  return {
    templateId: template.id,
    name: template.name,
    score: Math.round(Math.max(0, score)),
    reasons: reasons.length ? [...new Set(reasons)].slice(0, 3) : ['boa opcao para comparacao visual neste rosto'],
  }
}

function scoreFaceShapeFit(
  profile: GlobalVisagismoFrameTemplate['profile'],
  faceShape: FaceAnalysisResult['faceShape'],
) {
  const reasons: string[] = []
  let score = 0

  if (faceShape === 'round') {
    if (['rectangular', 'square', 'geometric', 'wayfarer'].includes(profile.shape)) {
      score += 16
      reasons.push('contrasta bem com linhas mais arredondadas do rosto')
    }
    if (profile.direction === 'ascending') score += 6
    if (['round', 'oval'].includes(profile.shape)) score -= 18
  }

  if (faceShape === 'square') {
    if (['round', 'oval', 'panto', 'aviator'].includes(profile.shape)) {
      score += 15
      reasons.push('suaviza uma leitura mais reta da mandibula')
    }
    if (['square', 'geometric'].includes(profile.shape) && profile.visualWeight === 'strong') score -= 10
  }

  if (faceShape === 'long') {
    if (profile.visualWidth === 'wide' || profile.lensHeight === 'high') {
      score += 12
      reasons.push('ocupa melhor a largura e ajuda a equilibrar rosto alongado')
    }
    if (profile.lensHeight === 'low' || profile.visualWidth === 'narrow') score -= 14
    if (profile.shape === 'rectangular' && profile.lensHeight === 'low') score -= 8
  }

  if (faceShape === 'heart') {
    if (['oval', 'panto', 'aviator', 'round'].includes(profile.shape)) score += 10
    if (profile.visualWeight === 'strong' && profile.visualWidth === 'wide') score -= 8
  }

  if (faceShape === 'triangle') {
    if (profile.direction === 'ascending' || ['cat-eye', 'browline', 'rectangular'].includes(profile.shape)) {
      score += 12
      reasons.push('valoriza a parte superior e equilibra a base do rosto')
    }
    if (profile.direction === 'descending') score -= 8
  }

  if (faceShape === 'oval' || faceShape === 'balanced') {
    if (profile.visualWeight === 'medium') score += 6
    if (profile.shape === 'round') score -= 4
  }

  return { score, reasons }
}

function scoreCustomerProfile(
  profile: GlobalVisagismoFrameTemplate['profile'],
  construction: GlobalVisagismoFrameTemplate['construction'],
  customer: CustomerStyleProfile,
) {
  const reasons: string[] = []
  let score = 0

  if (customer.style === 'discrete') {
    if (profile.visualWeight === 'light') score += 12
    if (profile.visualWeight === 'strong') score -= 16
    if (profile.shape === 'geometric' || profile.shape === 'cat-eye') score -= 5
    if (profile.visualWeight === 'medium' && profile.effects.includes('structures')) score += 4
    if (construction === 'rimless') score += 14
    if (construction === 'semi-rimless') score += 8
    reasons.push('respeita uma proposta mais discreta')
  }

  if (customer.style === 'classic') {
    if (['panto', 'oval'].includes(profile.shape)) score += 14
    if (['rectangular', 'round', 'browline', 'wayfarer'].includes(profile.shape)) score += 8
    if (profile.shape === 'aviator') score += 4
    if (profile.shape === 'cat-eye' || profile.shape === 'geometric') score -= 8
    if (profile.visualWeight === 'strong') score -= 4
    reasons.push('mantem uma leitura classica e facil de usar')
  }

  if (customer.style === 'modern') {
    if (['geometric', 'cat-eye', 'wayfarer', 'rectangular'].includes(profile.shape)) score += 11
    if (profile.visualWeight === 'light') score -= 3
    reasons.push('traz uma leitura mais atual para o visual')
  }

  if (customer.style === 'striking') {
    if (profile.visualWeight === 'strong') score += 14
    if (profile.effects.includes('adds-presence')) score += 8
    if (profile.visualWeight === 'light') score -= 8
    if (construction === 'rimless') score -= 35
    if (construction === 'semi-rimless') score -= 18
    reasons.push('entrega mais presenca no rosto')
  }

  if (customer.expression === 'masculine') {
    if (['rectangular', 'square', 'aviator', 'wayfarer', 'geometric'].includes(profile.shape)) score += 8
    if (profile.shape === 'cat-eye') score -= 14
  }

  if (customer.expression === 'feminine') {
    if (['cat-eye', 'oval', 'round', 'panto'].includes(profile.shape)) score += 8
    if (profile.shape === 'cat-eye') score += 6
    if (profile.direction === 'ascending') score += 7
  }

  if (customer.expression === 'neutral') {
    if (['panto', 'oval', 'rectangular', 'round'].includes(profile.shape)) score += 6
    if (profile.visualWeight === 'strong') score -= 3
  }

  if (customer.goals.includes('soften') && profile.effects.includes('softens')) {
    score += 15
    reasons.push('ajuda a suavizar a expressao')
  }

  if (customer.goals.includes('soften')) {
    if (construction === 'rimless') score += 5
    if (construction === 'semi-rimless') score += 3
    if (profile.lineStyle === 'mixed') score += 8
    if (profile.lineStyle === 'straight') score -= 14
    if (profile.shape === 'geometric') score -= 8
    if (profile.visualWeight === 'strong') score -= 8
  }

  if (customer.goals.includes('structure') && profile.effects.includes('structures')) {
    score += 22
    reasons.push('adiciona estrutura ao rosto')
  }

  if (customer.goals.includes('structure')) {
    if (profile.lineStyle === 'straight') score += 10
    if (profile.lineStyle === 'mixed') score += 5
    if (profile.lineStyle === 'curved') score -= 8
    if (profile.visualWeight === 'light' && !profile.effects.includes('structures')) score -= 8
  }

  if (customer.goals.includes('rejuvenate')) {
    if (profile.direction === 'ascending' || profile.visualWeight === 'light') score += 8
    if (profile.visualWeight === 'strong' && profile.lineStyle === 'straight') score -= 4
    reasons.push('busca uma leitura mais leve e atual')
  }

  if (customer.goals.includes('lift') && profile.effects.includes('lifts')) {
    score += 22
    reasons.push('valoriza uma linha mais ascendente')
  }

  if (customer.goals.includes('lift')) {
    if (profile.direction === 'ascending') score += 18
    if (profile.direction === 'neutral') score -= 4
    if (profile.direction === 'descending') score -= 40
    if (profile.shape === 'cat-eye') score += 10
  }

  if (customer.avoid.includes('cat-eye') && profile.shape === 'cat-eye') score -= 42
  if (customer.avoid.includes('round') && ['round', 'oval'].includes(profile.shape)) score -= 32
  if (customer.avoid.includes('large') && profile.lensHeight === 'high') score -= 42
  if (customer.avoid.includes('large') && profile.visualWidth === 'wide' && profile.lensHeight === 'medium') score -= 16
  if (customer.avoid.includes('strong') && profile.visualWeight === 'strong') score -= 36
  if (customer.avoid.includes('strong') && construction === 'rimless') score += 8
  if (customer.avoid.includes('strong') && construction === 'semi-rimless') score += 5
  if (customer.avoid.includes('rimless') && construction === 'rimless') score -= 42
  if (customer.avoid.includes('semi-rimless') && construction === 'semi-rimless') score -= 42

  return { score, reasons }
}

function hasHardAvoid(
  profile: GlobalVisagismoFrameTemplate['profile'],
  construction: GlobalVisagismoFrameTemplate['construction'],
  customer: CustomerStyleProfile,
) {
  return (
    (customer.avoid.includes('cat-eye') && profile.shape === 'cat-eye') ||
    (customer.avoid.includes('round') && ['round', 'oval'].includes(profile.shape)) ||
    (customer.avoid.includes('large') && profile.lensHeight === 'high') ||
    (customer.avoid.includes('strong') && profile.visualWeight === 'strong') ||
    (customer.avoid.includes('rimless') && construction === 'rimless') ||
    (customer.avoid.includes('semi-rimless') && construction === 'semi-rimless')
  )
}

function hasSoftLargeAvoid(
  profile: GlobalVisagismoFrameTemplate['profile'],
  customer: CustomerStyleProfile,
) {
  if (!customer.avoid.includes('large')) return false
  if (profile.visualWidth !== 'wide' || profile.lensHeight !== 'medium') return false

  const isUsefulStructure =
    customer.goals.includes('structure') &&
    profile.effects.includes('structures') &&
    profile.lineStyle === 'straight'

  return !isUsefulStructure
}

function matches(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle))
}
