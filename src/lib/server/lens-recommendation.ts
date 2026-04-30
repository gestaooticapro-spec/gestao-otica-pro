import { createAdminClient } from '@/lib/supabase/admin'
import { getSharedFamilySemanticProfile } from '@/lib/server/shared-lens-semantics'
import type { AiSuggestionConfig, AiStoreProfileLevel } from '@/lib/types/ai-config.types'

export type BudgetMode = 'economico' | 'intermediario' | 'premium'
export type ClinicalCategory =
  | 'multifocal'
  | 'visao_simples'
  | 'ocupacional'
  | 'bifocal'
  | 'controle_miopia'
  | 'plana_solar'
  | 'mista'
  | 'indefinida'

export type FulfillmentMode = 'pronta' | 'sob_demanda'

export type AdaptationDifficulty = 'baixa' | 'media' | 'alta'

export type RecommendationCaseInput = {
  idade?: number | null
  marca_atual?: string | null
  esferico: number | null
  cilindrico: number | null
  adicao?: number | null
  rotina_tags?: string[]
  objetivo_tags?: string[]
  desired_benefits?: string[]
  preferred_features?: string[]
  rejected_features?: string[]
  budget_mode?: BudgetMode
  budget_signal?: 'informado' | 'nao_informado'
  targetPrice?: number | null
  adaptation_difficulty?: AdaptationDifficulty | null
  notes?: string | null
}

export type RecommendationOption = {
  configKey: string
  familyId: string
  offerId: string
  treatmentId: string | null
  familyName: string
  offerLabel: string
  treatmentName: string | null
  treatmentType: string | null
  sourceLaboratorio: string | null
  sourceVersao: string | null
  sourceVersionId?: string | null
  clinicalCategory: ClinicalCategory
  finalPrice: number
  basePrice: number | null
  reasons: string[]
  score: number
  sourcePageReference: string | null
  commercialSummary: string | null
  recommendationNotes: string | null
  treatmentSummary: string | null
  treatmentNotes: string | null
  treatmentExplainWhy: string | null
}

export type RecommendationConversationState = {
  versionId: string
  versionIds?: string[]
  caseInput: RecommendationCaseInput
  aiConfig?: AiSuggestionConfig
  forcedClinicalCategories?: ClinicalCategory[]
  requiredFeatures?: string[]
  budgetModeOverride?: BudgetMode | null
  maxPrice?: number | null
  minPrice?: number | null
  targetPrice?: number | null
  excludedConfigKeys?: string[]
  lastRecommendations?: RecommendationOption[]
}

export type ConversationIntentType =
  | 'mais_barata'
  | 'mais_premium'
  | 'mais_facil_adaptar'
  | 'manter_transitions'
  | 'manter_blue_uv'
  | 'alternativa'

export type ConversationIntent = {
  type: ConversationIntentType
  confidence: 'high' | 'medium'
  raw: string
}

type CatalogFamily = {
  id: string
  nome: string
  design?: string | null
  tags_uso: string[]
  tags_beneficios: string[]
  clinical_category: ClinicalCategory
  sourceLaboratorio?: string | null
  sourceVersao?: string | null
  sourceVersionId?: string | null
}

type CatalogOffer = {
  id: string
  family_id: string
  raw_label: string
  canonical_label: string | null
  material?: string | null
  clinical_category: ClinicalCategory
  features: Record<string, unknown>
  base_price: number | null
  is_atomic_offer: boolean
  already_includes_treatment: boolean
  allows_composition: boolean
  source_page_reference: string | null
  sourceLaboratorio?: string | null
  sourceVersao?: string | null
  sourceVersionId?: string | null
}

type CatalogGrid = {
  offer_id: string
  sph_min: number | null
  sph_max: number | null
  cyl_min: number | null
  cyl_max: number | null
  add_min: number | null
  add_max: number | null
}

type CatalogUsageProfile = {
  family_id: string
  usage_tags: string[]
  benefit_tags: string[]
  commercial_summary: string | null
  recommendation_notes: string | null
}

type CatalogCompatibility = {
  offer_id: string
  treatment_id: string
  special_price: number | null
  price_mode: 'final' | 'surcharge'
}

type TreatmentSemanticProfile = {
  usage_tags?: string[]
  benefit_tags?: string[]
  price_tier?: string
  positioning?: string
  commercial_summary?: string
  recommendation_notes?: string
  explain_why?: string
}

type EmbeddedTreatmentInfo = {
  name: string
  type: string | null
  semantic: TreatmentSemanticProfile
}

type CatalogTreatment = {
  id: string
  nome: string
  tipo: string | null
  features: Record<string, unknown>
}

type RecommendationCatalog = {
  families: CatalogFamily[]
  offers: CatalogOffer[]
  grids: CatalogGrid[]
  usageProfiles: CatalogUsageProfile[]
  compatibilities: CatalogCompatibility[]
  treatments: CatalogTreatment[]
}

type ClinicalEvaluation = {
  eligible: boolean
  effectiveCategory: ClinicalCategory
  confidencePenalty: number
}

type TechnicallyEligibleEntry = {
  offer: CatalogOffer
  family: CatalogFamily
  usageProfile: CatalogUsageProfile | null
  clinicalEvaluation: ClinicalEvaluation
}

type CandidateConfig = TechnicallyEligibleEntry & {
  treatment: CatalogTreatment | null
  compatibility: CatalogCompatibility | null
  finalPrice: number
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function toFeatureRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeNumber(value: unknown): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeCategory(value: unknown): ClinicalCategory {
  const allowed: ClinicalCategory[] = [
    'multifocal',
    'visao_simples',
    'ocupacional',
    'bifocal',
    'controle_miopia',
    'plana_solar',
    'mista',
    'indefinida',
  ]
  return allowed.includes(value as ClinicalCategory) ? (value as ClinicalCategory) : 'indefinida'
}

function normalizeBudgetMode(value: unknown): BudgetMode {
  if (value === 'economico' || value === 'premium') return value
  return 'intermediario'
}

function normalizeBudgetSignal(value: unknown): 'informado' | 'nao_informado' {
  return value === 'informado' ? 'informado' : 'nao_informado'
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function mergeSemanticArrays(...groups: Array<string[] | null | undefined>): string[] {
  return uniqueStrings(groups.flatMap((group) => group || []))
}

function withoutAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeIntentText(value: string): string {
  return withoutAccents(value.toLowerCase()).trim()
}

function parseCurrencyValue(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.\s]/g, '').trim()
  if (!cleaned) return null

  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  const normalized = cleaned.replace(/[.\s]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function extractPriceTarget(message: string): {
  maxPrice?: number | null
  minPrice?: number | null
  targetPrice?: number | null
} {
  const normalized = normalizeIntentText(message)

  const maxMatch = normalized.match(
    /(?:ate|no maximo|maximo|teto|limite)\s*(?:de\s*)?(?:r\$?\s*)?(\d[\d.\s]*(?:,\d{1,2})?)/i,
  )
  if (maxMatch?.[1]) {
    const maxPrice = parseCurrencyValue(maxMatch[1])
    if (maxPrice != null) {
      return { maxPrice, targetPrice: maxPrice }
    }
  }

  const minMatch = normalized.match(
    /(?:a partir de|acima de|pelo menos|minimo|minimo de)\s*(?:r\$?\s*)?(\d[\d.\s]*(?:,\d{1,2})?)/i,
  )
  if (minMatch?.[1]) {
    const minPrice = parseCurrencyValue(minMatch[1])
    if (minPrice != null) {
      return { minPrice, targetPrice: minPrice }
    }
  }

  return {}
}

function extractIndexValue(descriptor: string): number | null {
  const match = descriptor.match(/1[.,](50|53|56|59|60|67|74)/)
  if (match?.[0]) {
    return Number(match[0].replace(',', '.'))
  }
  if (/(policarbonato|airwear|poly\b)/.test(descriptor)) return 1.59
  if (/(trivex)/.test(descriptor)) return 1.53
  return null
}

function normalizeFeatureFlags(features: Record<string, unknown> = {}): Record<string, boolean> {
  const base = Object.fromEntries(
    Object.entries(features).filter(([, featureValue]) => featureValue === true),
  ) as Record<string, boolean>

  const normalized: Record<string, boolean> = { ...base }

  if (base.blue_control || base.bluecontrol) normalized.blue_uv = true
  if (base.fotossensivel || base.sensity || base.photochromic || base.photofusion || base.foto) {
    normalized.transitions = true
  }
  if (base.solar || base.polarizado) normalized.solar = true
  if (base.uv_control) normalized.uv = true

  if (
    base.meiryo ||
    base.longlife ||
    base.hard ||
    base.clean_extra ||
    base.blue_control ||
    base.blue_uv ||
    base.uv
  ) {
    normalized.antirreflexo = true
  }

  return normalized
}

function resolveFulfillmentMode(offer: CatalogOffer, family: CatalogFamily | null = null): FulfillmentMode {
  const mode = offer.features?.fulfillment_mode
  if (mode === 'pronta' || mode === 'sob_demanda') return mode

  const descriptor = withoutAccents(
    `${family?.design || ''} ${family?.nome || ''} ${offer.raw_label || ''} ${offer.canonical_label || ''} ${offer.source_page_reference || ''}`.toLowerCase(),
  )

  const hasProntaSignals = /(pronta|stock|acabada|acabado|lentes prontas|pronta entrega)/.test(descriptor)
  const hasSobDemandaSignals = /(surfac|surfa|sob demanda|digital)/.test(descriptor)

  if (offer.allows_composition && !offer.is_atomic_offer) return 'sob_demanda'
  if (offer.is_atomic_offer || offer.already_includes_treatment) return 'pronta'
  if (hasSobDemandaSignals && !hasProntaSignals) return 'sob_demanda'
  if (hasProntaSignals) return 'pronta'
  return 'pronta'
}

function levelToScore(level: AiStoreProfileLevel): number {
  if (level === 'alto') return 1
  if (level === 'baixo') return -1
  return 0
}

function percentile(values: number[], percentileValue: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * percentileValue)))
  return sorted[index]
}

function getPriceTier(price: number, peerPrices: number[]): 'economico' | 'intermediario' | 'premium' {
  if (!peerPrices.length) return 'intermediario'
  const p33 = percentile(peerPrices, 0.33)
  const p66 = percentile(peerPrices, 0.66)
  if (price <= p33) return 'economico'
  if (price >= p66) return 'premium'
  return 'intermediario'
}

function findLabWeight(
  aiConfig: AiSuggestionConfig | undefined,
  family: CatalogFamily,
  offer: CatalogOffer,
): number | null {
  if (!aiConfig?.lab_preferences?.length) return null

  const versionId = family.sourceVersionId || offer.sourceVersionId
  if (versionId) {
    const match = aiConfig.lab_preferences.find((pref) => pref.versionId === versionId)
    if (match) return match.weight
  }

  const laboratorio = (family.sourceLaboratorio || offer.sourceLaboratorio || '').toLowerCase()
  if (!laboratorio) return null
  const fallback = aiConfig.lab_preferences.find((pref) => pref.laboratorio?.toLowerCase() === laboratorio)
  return fallback ? fallback.weight : null
}

function resolveBrandWeight(
  aiConfig: AiSuggestionConfig | undefined,
  category: ClinicalCategory,
  family: CatalogFamily,
  offer: CatalogOffer,
): { weight: number | null; brand: string | null } {
  if (!aiConfig?.category_brand_preferences) return { weight: null, brand: null }
  const prefs = aiConfig.category_brand_preferences as Record<string, { brand: string; weight: number }[] | undefined>
  const list = prefs[category] || []
  if (!list.length) return { weight: null, brand: null }

  const descriptor = withoutAccents(
    `${family.nome} ${offer.raw_label} ${offer.canonical_label || ''}`.toLowerCase(),
  )

  let best: { weight: number; brand: string } | null = null
  for (const entry of list) {
    const brand = withoutAccents(String(entry.brand || '').toLowerCase()).trim()
    if (!brand) continue
    if (!descriptor.includes(brand)) continue
    if (!best || entry.weight > best.weight) {
      best = { weight: entry.weight, brand: entry.brand }
    }
  }

  return best ? { weight: best.weight, brand: best.brand } : { weight: null, brand: null }
}

function scoreStoreProfile(params: {
  aiConfig?: AiSuggestionConfig
  input: RecommendationCaseInput
  offer: CatalogOffer
  family: CatalogFamily
  offerFeatures: Record<string, boolean>
  finalPrice: number
  peerPrices: number[]
  seeksThinness: boolean
  resistancePriority: number
  thinnessPriority: number
}): { score: number; reasons: string[] } {
  const {
    aiConfig,
    input,
    offer,
    family,
    offerFeatures,
    finalPrice,
    peerPrices,
    seeksThinness,
    resistancePriority,
    thinnessPriority,
  } = params

  if (!aiConfig?.store_profile) return { score: 0, reasons: [] }

  const profile = aiConfig.store_profile
  const reasons: string[] = []
  let score = 0

  const budgetSignal = normalizeBudgetSignal(input.budget_signal)
  const priceTier = getPriceTier(finalPrice, peerPrices)

  if (budgetSignal === 'nao_informado') {
    if (profile.investment_profile === 'economico') {
      if (priceTier === 'economico') score += 2
      if (priceTier === 'premium') score -= 2
      reasons.push('perfil_loja:investimento_economico')
    }
    if (profile.investment_profile === 'premium') {
      if (priceTier === 'premium') score += 2
      if (priceTier === 'economico') score -= 1.5
      reasons.push('perfil_loja:investimento_premium')
    }
    if (profile.investment_profile === 'equilibrado') {
      reasons.push('perfil_loja:investimento_equilibrado')
    }
  }

  const descriptor = withoutAccents(
    `${family.nome} ${offer.raw_label} ${offer.canonical_label || ''} ${offer.material || ''}`.toLowerCase(),
  )

  const techSignal = levelToScore(profile.tech_adoption)
  if (techSignal !== 0 && /(digital|freeform|4k|id\b|ai\b|individual|plus|3d|high\s*definition)/.test(descriptor)) {
    score += 1.5 * techSignal
    reasons.push(`perfil_loja:tech_${profile.tech_adoption}`)
  }

  const aestheticSignal = levelToScore(profile.aesthetic_priority)
  if (aestheticSignal !== 0 && (seeksThinness || thinnessPriority > 0.4)) {
    score += 1.5 * aestheticSignal
    reasons.push(`perfil_loja:estetica_${profile.aesthetic_priority}`)
  }

  return { score: Number(score.toFixed(2)), reasons }
}

function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function getDesiredClinicalCategories(input: RecommendationCaseInput): ClinicalCategory[] {
  const rotinaTags = input.rotina_tags || []
  const desiredBenefits = input.desired_benefits || []

  if (input.adicao != null) {
    return ['multifocal', 'bifocal']
  }

  if (rotinaTags.includes('controle_miopia') || desiredBenefits.includes('controle_miopia')) {
    return ['controle_miopia']
  }

  if (rotinaTags.includes('sol') && rotinaTags.length === 1) {
    return ['plana_solar', 'visao_simples']
  }

  return ['visao_simples', 'ocupacional']
}

function enrichCaseInput(input: RecommendationCaseInput): RecommendationCaseInput {
  const desiredBenefits = [...(input.desired_benefits || []), ...(input.objetivo_tags || [])]
  const rotinaTags = [...(input.rotina_tags || [])]
  const preferredFeatures = [...(input.preferred_features || [])]

  if (input.adaptation_difficulty === 'alta') {
    desiredBenefits.push('adaptacao_rapida', 'conforto_visual')
  }

  if (rotinaTags.includes('golfe') || rotinaTags.includes('esporte_outdoor')) {
    rotinaTags.push('sol')
    desiredBenefits.push('conforto_externo')
  }

  return {
    ...input,
    desired_benefits: uniqueStrings(desiredBenefits),
    rotina_tags: uniqueStrings(rotinaTags),
    preferred_features: uniqueStrings(preferredFeatures),
    budget_mode: normalizeBudgetMode(input.budget_mode),
    budget_signal: normalizeBudgetSignal(input.budget_signal),
  }
}

function between(value: number | null, min: number | null, max: number | null): boolean {
  if (value == null || min == null || max == null) return true
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  return value >= low && value <= high
}

function matchesGrid(input: RecommendationCaseInput, grids: CatalogGrid[]): boolean {
  if (!grids.length) return true

  return grids.some((grid) => {
    const sphOk = between(input.esferico ?? null, grid.sph_min, grid.sph_max)
    const cylOk = between(input.cilindrico ?? null, grid.cyl_min, grid.cyl_max)
    const addOk =
      input.adicao == null
        ? true
        : grid.add_min == null && grid.add_max == null
          ? false
          : between(input.adicao, grid.add_min, grid.add_max)
    return sphOk && cylOk && addOk
  })
}

function resolveConfigPrice(offer: CatalogOffer, compatibility: CatalogCompatibility | null): number {
  if (!compatibility) {
    return Number(offer.base_price || 0)
  }

  if (compatibility.price_mode === 'surcharge') {
    return Number(offer.base_price || 0) + Number(compatibility.special_price || 0)
  }

  return Number(compatibility.special_price ?? offer.base_price ?? 0)
}

function getTreatmentSemanticProfile(treatment: CatalogTreatment | null): TreatmentSemanticProfile | null {
  const features = treatment?.features
  const semanticProfile = features?.semantic_profile
  if (!semanticProfile || typeof semanticProfile !== 'object' || Array.isArray(semanticProfile)) {
    return null
  }
  return semanticProfile as TreatmentSemanticProfile
}

const EMBEDDED_TREATMENT_SEMANTICS: Record<string, EmbeddedTreatmentInfo> = {
  transitions: {
    name: 'Fotossensível',
    type: 'fotossensivel',
    semantic: {
      usage_tags: ['sol', 'outdoor', 'uso_diario'],
      benefit_tags: ['conforto_externo', 'versatilidade', 'proteção_uv'],
      commercial_summary:
        'Tratamento fotossensível embutido, indicado para quem alterna entre ambientes internos e externos.',
      recommendation_notes:
        'Boa opção quando o cliente quer praticidade e conforto no sol sem trocar de óculos.',
      explain_why:
        'Foi escolhido porque combina uso diário com proteção e adaptação automática à luz.',
    },
  },
  blue_uv: {
    name: 'Filtro de Luz Azul',
    type: 'blue_uv',
    semantic: {
      usage_tags: ['telas', 'uso_diario'],
      benefit_tags: ['conforto_digital', 'redução_reflexos', 'proteção_luz_azul'],
      commercial_summary:
        'Tratamento embutido para conforto digital e gestão de luz azul em uso prolongado de telas.',
      recommendation_notes:
        'Sobe quando a rotina é intensa em telas ou o cliente relata cansaço visual.',
      explain_why:
        'Foi escolhido porque atende a necessidade de conforto digital com filtragem de luz azul.',
    },
  },
  uv: {
    name: 'Proteção UV',
    type: 'uv',
    semantic: {
      usage_tags: ['outdoor', 'uso_diario'],
      benefit_tags: ['proteção_uv'],
      commercial_summary:
        'Tratamento embutido com foco em proteção UV para uso diário e exposição ao sol.',
      recommendation_notes:
        'Indicado como complemento de proteção quando o cliente tem rotina externa.',
      explain_why:
        'Foi escolhido para reforçar proteção UV em situações de exposição ao sol.',
    },
  },
  polarizado: {
    name: 'Polarizado',
    type: 'polarizado',
    semantic: {
      usage_tags: ['sol', 'outdoor', 'dirigir'],
      benefit_tags: ['redução_ofuscamento', 'conforto_externo'],
      commercial_summary:
        'Tratamento solar polarizado embutido para reduzir reflexos e melhorar contraste.',
      recommendation_notes:
        'Boa opção para direção diurna, água e atividades externas com muito brilho.',
      explain_why:
        'Foi escolhido para reduzir ofuscamento em ambientes com reflexo intenso.',
    },
  },
  solar: {
    name: 'Solar',
    type: 'solar',
    semantic: {
      usage_tags: ['sol', 'outdoor'],
      benefit_tags: ['conforto_externo', 'proteção_uv'],
      commercial_summary: 'Tratamento solar embutido focado em conforto visual ao ar livre.',
      recommendation_notes:
        'Indicado quando o cliente prioriza proteção solar e conforto em ambientes externos.',
      explain_why: 'Foi escolhido para uso externo com maior intensidade de luz.',
    },
  },
  antirreflexo: {
    name: 'Antirreflexo',
    type: 'antirreflexo',
    semantic: {
      usage_tags: ['uso_diario', 'telas', 'dirigir_noite'],
      benefit_tags: ['antirreflexo', 'clareza', 'conforto_visual'],
      commercial_summary:
        'Tratamento antirreflexo embutido para reduzir reflexos e melhorar a nitidez.',
      recommendation_notes:
        'Sobe quando a prioridade é clareza visual no dia a dia ou em ambientes com luz artificial.',
      explain_why:
        'Foi escolhido para melhorar a nitidez e reduzir reflexos em uso diário.',
    },
  },
  espelhado: {
    name: 'Espelhado',
    type: 'espelhado',
    semantic: {
      usage_tags: ['sol', 'estilo'],
      benefit_tags: ['estetica', 'conforto_externo'],
      commercial_summary: 'Tratamento espelhado embutido com foco em estilo e conforto solar.',
      recommendation_notes:
        'Boa opção quando estética e uso externo são prioridades.',
      explain_why: 'Foi escolhido para unir estilo e conforto no sol.',
    },
  },
}

function resolveEmbeddedTreatment(
  offer: CatalogOffer,
  input: RecommendationCaseInput,
): EmbeddedTreatmentInfo | null {
  if (!offer.already_includes_treatment) return null

  const flags = normalizeFeatureFlags(offer.features)
  const preferred = input.preferred_features || []
  const rejected = input.rejected_features || []

  const pickIf = (key: string) => (flags[key] ? EMBEDDED_TREATMENT_SEMANTICS[key] : null)
  const pickIfAllowed = (key: string) => (rejected.includes(key) ? null : pickIf(key))

  if (preferred.includes('transitions') && !rejected.includes('transitions')) return pickIf('transitions')
  if (preferred.includes('blue_uv') && !rejected.includes('blue_uv')) return pickIf('blue_uv')
  if (preferred.includes('polarizado')) return pickIf('polarizado')
  if (preferred.includes('solar')) return pickIf('solar')

  return (
    pickIfAllowed('transitions') ||
    pickIfAllowed('blue_uv') ||
    pickIf('polarizado') ||
    pickIf('solar') ||
    pickIf('antirreflexo') ||
    pickIf('uv') ||
    pickIf('espelhado') ||
    null
  )
}

function scoreEmbeddedTreatment(params: {
  embedded: EmbeddedTreatmentInfo | null
  input: RecommendationCaseInput
}): { score: number; reasons: string[] } {
  const { embedded, input } = params
  if (!embedded) return { score: 0, reasons: [] }

  const fakeTreatment: CatalogTreatment = {
    id: 'embedded',
    nome: embedded.name,
    tipo: embedded.type,
    features: { semantic_profile: embedded.semantic },
  }

  return scoreTreatment({ treatment: fakeTreatment, input })
}

function resolveOfferClinicalCategory(family: CatalogFamily, offer: CatalogOffer): ClinicalCategory {
  if (offer.clinical_category !== 'indefinida') return offer.clinical_category
  if (family.clinical_category !== 'mista') return family.clinical_category
  return 'indefinida'
}

function inferMixedCategoryFromSemanticSignals(
  family: CatalogFamily,
  offer: CatalogOffer,
  usageProfile: CatalogUsageProfile | null,
): ClinicalCategory | null {
  const sharedSemantic = getSharedFamilySemanticProfile(family.nome)
  const descriptor = withoutAccents(
    `${family.nome} ${offer.raw_label} ${offer.canonical_label || ''} ${offer.material || ''}`.toLowerCase(),
  )
  const usageTags = mergeSemanticArrays(
    family.tags_uso,
    usageProfile?.usage_tags,
    sharedSemantic?.usage_tags,
  )
  const benefitTags = mergeSemanticArrays(
    family.tags_beneficios,
    usageProfile?.benefit_tags,
    sharedSemantic?.benefit_tags,
  )

  if (
    usageTags.includes('controle_miopia') ||
    benefitTags.includes('controle_miopia') ||
    /(stellest|miokids|miopia|myopi|kids)/.test(descriptor)
  ) {
    return 'controle_miopia'
  }

  if (/(interview|digitime|office|work|softwear|relax)/.test(descriptor)) {
    return 'ocupacional'
  }

  if (/(varilux|espace|comfort|liberty|physio|xr|precise|unique|network|progress)/.test(descriptor)) {
    return 'multifocal'
  }

  if (/(bifocal)/.test(descriptor)) {
    return 'bifocal'
  }

  if (/(solar|sun|transitions|foto|phot|fotossens)/.test(descriptor)) {
    return 'plana_solar'
  }

  return null
}

function evaluateClinicalEligibility(
  input: RecommendationCaseInput,
  family: CatalogFamily,
  offer: CatalogOffer,
  usageProfile: CatalogUsageProfile | null,
  forcedClinicalCategories?: ClinicalCategory[],
): ClinicalEvaluation {
  const desiredCategories = forcedClinicalCategories?.length
    ? forcedClinicalCategories
    : getDesiredClinicalCategories(input)
  const effectiveCategory = resolveOfferClinicalCategory(family, offer)
  const wantsPresbyopia =
    input.adicao != null || desiredCategories.includes('multifocal') || desiredCategories.includes('bifocal')

  if (effectiveCategory !== 'indefinida') {
    return {
      eligible: desiredCategories.includes(effectiveCategory),
      effectiveCategory,
      confidencePenalty: 0,
    }
  }

  if (family.clinical_category === 'mista') {
    const inferredCategory = inferMixedCategoryFromSemanticSignals(family, offer, usageProfile)
    if (inferredCategory) {
      return {
        eligible: desiredCategories.includes(inferredCategory),
        effectiveCategory: inferredCategory,
        confidencePenalty: desiredCategories.includes(inferredCategory) ? 1 : 0,
      }
    }

    if (wantsPresbyopia) {
      return {
        eligible: false,
        effectiveCategory,
        confidencePenalty: 6,
      }
    }

    return {
      eligible: !desiredCategories.includes('controle_miopia'),
      effectiveCategory,
      confidencePenalty: desiredCategories.includes('controle_miopia') ? 6 : 2,
    }
  }

  return {
    eligible: false,
    effectiveCategory,
    confidencePenalty: 0,
  }
}

function scoreBudget(mode: BudgetMode, price: number, prices: number[]): number {
  if (!Number.isFinite(price) || !prices.length) return 0
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  if (min === max) return 0

  const normalized = (price - min) / (max - min)

  if (mode === 'economico') {
    // Cheapest = +5, mid = 0, most expensive = -5
    return (0.5 - normalized) * 10
  }

  if (mode === 'premium') {
    // Most expensive = +5, mid = 0, cheapest = -5
    return (normalized - 0.5) * 10
  }

  return 1 - Math.abs(normalized - 0.5) * 2
}

function scorePriceTarget(params: {
  price: number
  targetPrice?: number | null
  maxPrice?: number | null
  minPrice?: number | null
}): number {
  const { price, targetPrice, maxPrice, minPrice } = params
  if (!Number.isFinite(price)) return 0
  if (targetPrice == null || !Number.isFinite(targetPrice) || targetPrice <= 0) return 0
  if (maxPrice != null && price > maxPrice) return 0
  if (minPrice != null && price < minPrice) return 0

  const ratio = price / targetPrice
  if (ratio > 1.2) return -6   // above 20% over target (safety; maxPrice filter handles this)
  if (ratio >= 0.8) return 5   // sweet spot: within ±20% of target
  if (ratio >= 0.6) return 1   // up to 40% below target: acceptable
  return -2                    // more than 40% below target
}

function getPrescriptionStrength(input: RecommendationCaseInput): number {
  return Math.abs(input.esferico || 0) + Math.abs(input.cilindrico || 0)
}

function wantsThinLens(input: RecommendationCaseInput): boolean {
  const benefits = input.desired_benefits || []
  const routine = input.rotina_tags || []
  return (
    getPrescriptionStrength(input) >= 4.5 ||
    benefits.includes('estetica') ||
    benefits.includes('lente_fina') ||
    routine.includes('alta_dioptria')
  )
}

function getResistancePriority(input: RecommendationCaseInput): number {
  const benefits = input.desired_benefits || []
  const routine = input.rotina_tags || []

  if (benefits.includes('resistencia')) return 1
  if (routine.includes('risco_quebra')) return 0.65
  if (routine.includes('crianca_ativa')) return 0.35
  return 0
}

function getThinnessPriority(input: RecommendationCaseInput): number {
  const benefits = input.desired_benefits || []
  const prescriptionStrength = getPrescriptionStrength(input)

  let priority = 0

  if (benefits.includes('estetica')) priority += 0.35
  if (benefits.includes('lente_fina')) priority += 0.35

  if (prescriptionStrength >= 7) return priority + 1
  if (prescriptionStrength >= 5.5) return priority + 0.8
  if (prescriptionStrength >= 4.5) return priority + 0.6

  return priority
}

function scoreOffer(params: {
  offer: CatalogOffer
  family: CatalogFamily
  usageProfile: CatalogUsageProfile | null
  input: RecommendationCaseInput
  peerPrices: number[]
  clinicalEvaluation: ClinicalEvaluation
  finalPrice: number
  targetPrice?: number | null
  maxPrice?: number | null
  minPrice?: number | null
}): { score: number; reasons: string[] } {
  const {
    offer,
    family,
    usageProfile,
    input,
    peerPrices,
    clinicalEvaluation,
    finalPrice,
    targetPrice,
    maxPrice,
    minPrice,
  } = params
  let score = 0
  const reasons: string[] = []

  const sharedSemantic = getSharedFamilySemanticProfile(family.nome)
  const familyUsage = mergeSemanticArrays(family.tags_uso, usageProfile?.usage_tags, sharedSemantic?.usage_tags)
  const familyBenefits = mergeSemanticArrays(
    family.tags_beneficios,
    usageProfile?.benefit_tags,
    sharedSemantic?.benefit_tags,
  )
  const offerFeatures = normalizeFeatureFlags(offer.features)
  const offerDescriptor = withoutAccents(
    `${offer.raw_label} ${offer.canonical_label || ''} ${offer.material || ''}`.toLowerCase(),
  )
  const indexValue = extractIndexValue(offerDescriptor)
  const budgetMode = normalizeBudgetMode(input.budget_mode)
  const prescriptionStrength = getPrescriptionStrength(input)
  const seeksThinness = wantsThinLens(input)
  const resistancePriority = getResistancePriority(input)
  const thinnessPriority = getThinnessPriority(input)
  const fulfillmentMode = resolveFulfillmentMode(offer, family)
  const desiredBenefits = input.desired_benefits || []
  const routineTags = input.rotina_tags || []
  const wantsMiopiaControl =
    routineTags.includes('controle_miopia') ||
    desiredBenefits.includes('controle_miopia') ||
    (input.objetivo_tags || []).includes('controle_miopia')
  const wantsFastDelivery = desiredBenefits.includes('pronta_entrega') || routineTags.includes('pronta_entrega')
  const surfacingDemandSignals = [
    'lente_fina',
    'estetica',
    'conforto_superior',
    'conforto_visual',
    'alta_nitidez',
    'qualidade_optica',
    'personalizacao',
  ]
  const surfacingDemandLevel =
    surfacingDemandSignals.reduce((acc, signal) => acc + (desiredBenefits.includes(signal) ? 0.25 : 0), 0) +
    (prescriptionStrength >= 6 ? 0.7 : prescriptionStrength >= 4 ? 0.45 : 0) +
    (input.adicao != null && input.adicao <= 1.5 ? 0.4 : 0)

  if (clinicalEvaluation.effectiveCategory !== 'indefinida') {
    score += 5
    reasons.push(`categoria:${clinicalEvaluation.effectiveCategory}`)
  } else if (clinicalEvaluation.confidencePenalty > 0) {
    score -= clinicalEvaluation.confidencePenalty
    reasons.push('categoria:mista_sem_oferta_definida')
  }

  if (input.adicao != null) {
    if (['multifocal', 'bifocal'].includes(clinicalEvaluation.effectiveCategory)) {
      score += 3
      reasons.push('beneficio:adicao_presente')
    } else {
      score -= 4
      reasons.push('opcao:adicao_incompativel')
    }
  }

  for (const need of input.rotina_tags || []) {
    if (familyUsage.includes(need)) {
      score += 4
      reasons.push(`uso:${need}`)
    }
  }

  for (const benefit of input.desired_benefits || []) {
    if (familyBenefits.includes(benefit)) {
      score += 3
      reasons.push(`beneficio:${benefit}`)
    }
  }

  for (const preferredFeature of input.preferred_features || []) {
    const matchesFulfillment =
      (preferredFeature === 'sob_demanda' && fulfillmentMode === 'sob_demanda') ||
      (preferredFeature === 'pronta' && fulfillmentMode === 'pronta')
    if (offerFeatures[preferredFeature] === true || matchesFulfillment) {
      score += 3
      reasons.push(`feature:${preferredFeature}`)
    }
  }

  if (wantsFastDelivery) {
    if (fulfillmentMode === 'pronta') {
      score += 2
      reasons.push('fulfillment:pronta_entrega')
    } else {
      score -= 2
      reasons.push('fulfillment:prazo_maior')
    }
  } else {
    if (surfacingDemandLevel >= 0.7 && fulfillmentMode === 'sob_demanda') {
      score += Number((1.5 + Math.min(surfacingDemandLevel, 1.8)).toFixed(2))
      reasons.push('fulfillment:sob_demanda_exigencia')
    }
    if (surfacingDemandLevel >= 0.9 && fulfillmentMode === 'pronta') {
      score -= Number(Math.min(surfacingDemandLevel, 1.8).toFixed(2))
      reasons.push('fulfillment:pronta_limite_personalizacao')
    }
  }

  if (resistancePriority > 0 && /(airwear|poly\b|policarbonato|trivex)/.test(offerDescriptor)) {
    score += Number((0.5 + resistancePriority * 1.5).toFixed(2))
    reasons.push('material:resistente')
  }

  if (seeksThinness && /(1\.67|1,67|1\.74|1,74|high[\s-]?index|thin|lite|mr-8|mr8|mr-174)/.test(offerDescriptor)) {
    score += Number((2 + thinnessPriority * 2.5).toFixed(2))
    reasons.push('material:lente_fina')
  }

  if (
    seeksThinness &&
    thinnessPriority >= 0.8 &&
    /(1\.50|1,50|1\.53|1,53|1\.56|1,56|1\.59|1,59|policarbonato|poly)/.test(offerDescriptor) &&
    !/(1\.67|1,67|1\.74|1,74)/.test(offerDescriptor)
  ) {
    score -= thinnessPriority >= 1 ? 1.5 : 0.75
  }

  if (indexValue != null) {
    if (prescriptionStrength < 2 && indexValue >= 1.67) {
      score -= 4
      reasons.push('material:indice_alto_pouco_ganho')
    } else if (prescriptionStrength < 3 && indexValue >= 1.67) {
      score -= 2.5
      reasons.push('material:indice_alto_pouco_ganho')
    } else if (prescriptionStrength < 4 && indexValue >= 1.67) {
      score -= 0.5
      reasons.push('material:indice_alto_pouco_ganho')
    }

    if (prescriptionStrength >= 4 && indexValue <= 1.56) {
      score -= 2
      reasons.push('material:indice_baixo_grau_alto')
    }

    if (prescriptionStrength >= 6 && indexValue <= 1.59) {
      score -= 3
      reasons.push('material:indice_baixo_grau_alto')
    }
  }

  if (
    ((input.rotina_tags || []).includes('controle_miopia') ||
      (input.desired_benefits || []).includes('controle_miopia')) &&
    (clinicalEvaluation.effectiveCategory === 'controle_miopia' ||
      offerDescriptor.includes('stellest') ||
      withoutAccents(family.nome.toLowerCase()).includes('stellest'))
  ) {
    score += 6
    reasons.push('beneficio:controle_miopia')
  }

  if (wantsMiopiaControl && clinicalEvaluation.effectiveCategory !== 'controle_miopia') {
    score -= 6
  }

  if (
    wantsMiopiaControl &&
    (clinicalEvaluation.effectiveCategory === 'plana_solar' || offerFeatures.solar)
  ) {
    score -= 3
    reasons.push('opcao:desvio_solar')
  }

  if (offer.is_atomic_offer) {
    score += 0.5
    reasons.push('oferta_atomica')
  }

  if (offer.already_includes_treatment) {
    score += 0.5
    reasons.push('inclui_tratamento')
  }

  const budgetScore = scoreBudget(budgetMode, Number(offer.base_price || 0), peerPrices)
  score += budgetScore
  if (budgetScore > 0.5) {
    reasons.push(`orcamento:${budgetMode}`)
  }

  const targetScore = scorePriceTarget({
    price: finalPrice,
    targetPrice,
    maxPrice,
    minPrice,
  })
  score += targetScore
  if (targetScore > 0.5 && targetPrice != null) {
    reasons.push(`alvo_preco:${targetPrice}`)
  }

  return {
    score: Number(score.toFixed(2)),
    reasons,
  }
}

function scoreTreatment(params: {
  treatment: CatalogTreatment | null
  input: RecommendationCaseInput
}): { score: number; reasons: string[] } {
  const { treatment, input } = params
  if (!treatment) return { score: 0, reasons: [] }

  let score = 0
  const reasons: string[] = []
  const name = (treatment.nome || '').toLowerCase()
  const type = (treatment.tipo || '').toLowerCase()
  const semantic = getTreatmentSemanticProfile(treatment)
  const semanticUsage = semantic?.usage_tags || []
  const semanticBenefits = semantic?.benefit_tags || []
  const priceTier = semantic?.price_tier || null
  const budgetMode = normalizeBudgetMode(input.budget_mode)

  if (type === 'antirreflexo') {
    score += 2
    reasons.push('tratamento:antirreflexo')
  }

  for (const need of input.rotina_tags || []) {
    if (semanticUsage.includes(need)) {
      score += 2
      reasons.push(`tratamento_uso:${need}`)
    }
  }

  for (const benefit of input.desired_benefits || []) {
    if (semanticBenefits.includes(benefit)) {
      score += 2
      reasons.push(`tratamento_beneficio:${benefit}`)
    }
  }

  if (budgetMode === 'economico' && ['economico', 'intermediario'].includes(String(priceTier))) {
    score += priceTier === 'economico' ? 2 : 1
    reasons.push(`tratamento_orcamento:${priceTier}`)
  }

  if (budgetMode === 'intermediario' && ['intermediario', 'premium'].includes(String(priceTier))) {
    score += priceTier === 'intermediario' ? 1.5 : 0.5
    reasons.push(`tratamento_orcamento:${priceTier}`)
  }

  if ((input.rotina_tags || []).includes('computador') && (name.includes('crizal') || name.includes('trio') || name.includes('vert clair'))) {
    score += 1.5
    reasons.push('tratamento:conforto_telas')
  }

  if ((input.rotina_tags || []).includes('dirigir_noite') && (name.includes('sapphire') || name.includes('crizal'))) {
    score += 1.5
    reasons.push('tratamento:dirigir_noite')
  }

  if ((input.rotina_tags || []).includes('sol') && name.includes('transitions')) {
    score += 1
    reasons.push('tratamento:outdoor')
  }

  return { score, reasons }
}

function dedupeRankedEntries(entries: RecommendationOption[]): RecommendationOption[] {
  const bestByKey = new Map<string, RecommendationOption>()

  for (const entry of entries) {
    const current = bestByKey.get(entry.configKey)
    if (
      !current ||
      entry.score > current.score ||
      (entry.score === current.score && entry.finalPrice < current.finalPrice)
    ) {
      bestByKey.set(entry.configKey, entry)
    }
  }

  return Array.from(bestByKey.values()).sort(
    (a, b) => b.score - a.score || a.finalPrice - b.finalPrice,
  )
}

function normalizeFamilyName(name: string): string {
  return withoutAccents(name.toLowerCase().replace(/[®™©°]/g, '').replace(/\s+/g, ' ').trim())
}

function selectDiverseTopEntries(
  entries: RecommendationOption[],
  topN: number,
): RecommendationOption[] {
  if (entries.length <= topN) return entries.slice(0, topN)

  const selected: RecommendationOption[] = []
  const selectedConfigKeys = new Set<string>()
  const selectedFamilies = new Set<string>()
  const selectedOffers = new Set<string>()
  const selectedLabs = new Set<string>()
  const selectedFamilyNames = new Set<string>() // cross-catalog dedupe by normalized name

  const trySelect = (entry: RecommendationOption) => {
    if (selected.length >= topN) return
    if (selectedConfigKeys.has(entry.configKey)) return
    selected.push(entry)
    selectedConfigKeys.add(entry.configKey)
    selectedFamilies.add(entry.familyId)
    selectedOffers.add(entry.offerId)
    if (entry.sourceLaboratorio) selectedLabs.add(entry.sourceLaboratorio)
    selectedFamilyNames.add(normalizeFamilyName(entry.familyName))
  }

  // Pass 1: best entry per unique lab, different product per slot
  for (const entry of entries) {
    if (selected.length >= topN) break
    const lab = entry.sourceLaboratorio
    const nameNorm = normalizeFamilyName(entry.familyName)
    if (lab && !selectedLabs.has(lab) && !selectedFamilyNames.has(nameNorm)) {
      trySelect(entry)
    }
  }

  // Pass 2: fill remaining — different product name (any lab)
  for (const entry of entries) {
    if (selected.length >= topN) break
    if (!selectedFamilyNames.has(normalizeFamilyName(entry.familyName))) {
      trySelect(entry)
    }
  }

  // Pass 3: fill remaining — different family id
  for (const entry of entries) {
    if (selected.length >= topN) break
    if (!selectedFamilies.has(entry.familyId)) {
      trySelect(entry)
    }
  }

  // Pass 4: fill any remaining slots
  for (const entry of entries) {
    if (selected.length >= topN) break
    trySelect(entry)
  }

  return selected
}

function appendPrioritizedEntries(
  selected: RecommendationOption[],
  pool: RecommendationOption[],
  topN: number,
): RecommendationOption[] {
  if (selected.length >= topN) return selected.slice(0, topN)

  const selectedConfigKeys = new Set(selected.map((entry) => entry.configKey))
  const selectedFamilies = new Set(selected.map((entry) => entry.familyId))
  const selectedOffers = new Set(selected.map((entry) => entry.offerId))
  const selectedLabs = new Set(selected.map((entry) => entry.sourceLaboratorio).filter(Boolean) as string[])
  const selectedFamilyNames = new Set(selected.map((entry) => normalizeFamilyName(entry.familyName)))

  const trySelect = (entry: RecommendationOption) => {
    if (selected.length >= topN) return
    if (selectedConfigKeys.has(entry.configKey)) return
    selected.push(entry)
    selectedConfigKeys.add(entry.configKey)
    selectedFamilies.add(entry.familyId)
    selectedOffers.add(entry.offerId)
    if (entry.sourceLaboratorio) selectedLabs.add(entry.sourceLaboratorio)
    selectedFamilyNames.add(normalizeFamilyName(entry.familyName))
  }

  // Pass 1: prefer entries from labs not yet represented, different product
  for (const entry of pool) {
    if (selected.length >= topN) break
    const lab = entry.sourceLaboratorio
    const nameNorm = normalizeFamilyName(entry.familyName)
    if (lab && !selectedLabs.has(lab) && !selectedFamilyNames.has(nameNorm)) {
      trySelect(entry)
    }
  }

  // Pass 2: fill remaining — different product name
  for (const entry of pool) {
    if (selected.length >= topN) break
    if (!selectedFamilyNames.has(normalizeFamilyName(entry.familyName))) {
      trySelect(entry)
    }
  }

  // Pass 3: fill remaining — different family id
  for (const entry of pool) {
    if (selected.length >= topN) break
    if (!selectedFamilies.has(entry.familyId)) {
      trySelect(entry)
    }
  }

  // Pass 4: fill any remaining slots
  for (const entry of pool) {
    if (selected.length >= topN) break
    trySelect(entry)
  }

  return selected.slice(0, topN)
}

function applyExploratoryPriceDiscipline(
  exploratoryEntries: RecommendationOption[],
  anchorEntries: RecommendationOption[],
): RecommendationOption[] {
  if (!anchorEntries.length) return exploratoryEntries

  const anchorPrices = anchorEntries
    .map((entry) => entry.finalPrice)
    .filter((value) => Number.isFinite(value) && value > 0)

  if (!anchorPrices.length) return exploratoryEntries

  const maxAnchorPrice = Math.max(...anchorPrices)
  const softCeiling = maxAnchorPrice * 1.8

  return exploratoryEntries
    .map((entry) => {
      if (!Number.isFinite(entry.finalPrice) || entry.finalPrice <= softCeiling) {
        return entry
      }

      const priceOverflowRatio = Math.min((entry.finalPrice - softCeiling) / softCeiling, 1.5)
      const penalty = Number((1.25 + priceOverflowRatio * 2.5).toFixed(2))

      return {
        ...entry,
        score: Number((entry.score - penalty).toFixed(2)),
        reasons: uniqueStrings([...entry.reasons, 'opcao:salto_preco_controlado']),
      }
    })
    .sort((a, b) => b.score - a.score || a.finalPrice - b.finalPrice)
}

function getExploratoryClinicalCategories(
  input: RecommendationCaseInput,
  forcedClinicalCategories?: ClinicalCategory[],
): ClinicalCategory[] {
  const strict = forcedClinicalCategories?.length
    ? forcedClinicalCategories
    : getDesiredClinicalCategories(input)

  if (strict.includes('controle_miopia')) {
    return uniqueCategories(['controle_miopia', 'visao_simples']) || strict
  }

  if (strict.includes('multifocal')) {
    return uniqueCategories(['multifocal', 'ocupacional', 'visao_simples']) || strict
  }

  if (strict.includes('ocupacional')) {
    return uniqueCategories(['ocupacional', 'visao_simples', 'multifocal']) || strict
  }

  if (strict.includes('visao_simples')) {
    return uniqueCategories(['visao_simples', 'ocupacional']) || strict
  }

  return strict
}

function sameCategories(a: ClinicalCategory[] | undefined, b: ClinicalCategory[] | undefined): boolean {
  const left = a || []
  const right = b || []
  if (left.length !== right.length) return false
  return left.every((value) => right.includes(value))
}

function rankRecommendationOptions(params: {
  catalog: RecommendationCatalog
  input: RecommendationCaseInput
  aiConfig?: AiSuggestionConfig
  forcedClinicalCategories?: ClinicalCategory[]
  requiredFeatures?: string[]
  maxPrice?: number | null
  minPrice?: number | null
  targetPrice?: number | null
  excludedConfigKeys?: string[]
}): RecommendationOption[] {
  const {
    catalog,
    input,
    aiConfig,
    forcedClinicalCategories,
    requiredFeatures = [],
    maxPrice,
    minPrice,
    targetPrice,
    excludedConfigKeys = [],
  } = params

  const familyById = new Map(catalog.families.map((family) => [family.id, family]))
  const usageProfileByFamilyId = new Map(catalog.usageProfiles.map((entry) => [entry.family_id, entry]))
  const treatmentById = new Map(catalog.treatments.map((treatment) => [treatment.id, treatment]))
  const gridsByOfferId = new Map<string, CatalogGrid[]>()
  const compatibilitiesByOfferId = new Map<string, CatalogCompatibility[]>()

  for (const grid of catalog.grids) {
    const list = gridsByOfferId.get(grid.offer_id) || []
    list.push(grid)
    gridsByOfferId.set(grid.offer_id, list)
  }

  for (const compatibility of catalog.compatibilities) {
    const list = compatibilitiesByOfferId.get(compatibility.offer_id) || []
    list.push(compatibility)
    compatibilitiesByOfferId.set(compatibility.offer_id, list)
  }

  const technicallyEligible: TechnicallyEligibleEntry[] = catalog.offers
    .map((offer) => {
      const family = familyById.get(offer.family_id)
      if (!family) return null

      const clinicalEvaluation = evaluateClinicalEligibility(
        input,
        family,
        offer,
        usageProfileByFamilyId.get(offer.family_id) || null,
        forcedClinicalCategories,
      )
      if (!clinicalEvaluation.eligible) return null

      const offerGrids = gridsByOfferId.get(offer.id) || []
      if (!matchesGrid(input, offerGrids)) return null

      const offerFeatures = normalizeFeatureFlags(offer.features)
      const fulfillmentMode = resolveFulfillmentMode(offer, family)
      if (
        requiredFeatures.some((feature) => {
          if (feature === 'sob_demanda' || feature === 'pronta') {
            return fulfillmentMode !== feature
          }
          return offerFeatures[feature] !== true
        })
      ) {
        return null
      }

      const rejectedFeatures = input.rejected_features || []
      if (rejectedFeatures.length > 0) {
        const offerDescriptor = withoutAccents(
          `${family.nome} ${offer.raw_label} ${offer.canonical_label || ''}`.toLowerCase()
        )
        const isRejected = rejectedFeatures.some((feature) => {
          if (feature === 'transitions') {
            return (
              offerFeatures.transitions === true ||
              /(transitions|fotossens|photochrom|sensity|photofusion)/.test(offerDescriptor)
            )
          }
          if (feature === 'blue_uv') {
            return offerFeatures.blue_uv === true || offerFeatures.bluecontrol === true
          }
          return offerFeatures[feature] === true
        })
        if (isRejected) return null
      }

      return {
        offer,
        family,
        usageProfile: usageProfileByFamilyId.get(offer.family_id) || null,
        clinicalEvaluation,
      }
    })
    .filter((entry): entry is TechnicallyEligibleEntry => entry !== null)

  const candidateConfigs: CandidateConfig[] = technicallyEligible.flatMap((entry): CandidateConfig[] => {
    const compatRows = compatibilitiesByOfferId.get(entry.offer.id) || []
    if (!compatRows.length) {
      return [
        {
          ...entry,
          treatment: null,
          compatibility: null,
          finalPrice: Number(entry.offer.base_price || 0),
        },
      ]
    }

    return compatRows.map((compatibility) => ({
      ...entry,
      treatment: treatmentById.get(compatibility.treatment_id) || null,
      compatibility,
      finalPrice: resolveConfigPrice(entry.offer, compatibility),
    }))
  })

  const filteredCandidates: CandidateConfig[] = candidateConfigs.filter((entry) => {
    if (maxPrice != null && entry.finalPrice > maxPrice) return false
    if (minPrice != null && entry.finalPrice < minPrice) return false
    return true
  })

  const peerPrices = filteredCandidates
    .map((entry) => entry.finalPrice)
    .filter((value) => Number.isFinite(value))

  const ranked: RecommendationOption[] = filteredCandidates.map((entry): RecommendationOption => {
    const offerScoring = scoreOffer({
      offer: entry.offer,
      family: entry.family,
      usageProfile: entry.usageProfile,
      input,
      peerPrices,
      clinicalEvaluation: entry.clinicalEvaluation,
      finalPrice: entry.finalPrice,
      targetPrice,
      maxPrice,
      minPrice,
    })
    const treatmentScoring = scoreTreatment({
      treatment: entry.treatment,
      input,
    })
    const embeddedTreatment = resolveEmbeddedTreatment(entry.offer, input)
    const embeddedScoring = scoreEmbeddedTreatment({
      embedded: embeddedTreatment,
      input,
    })

    const offerFeatures = normalizeFeatureFlags(entry.offer.features)
    const labWeight = findLabWeight(aiConfig, entry.family, entry.offer)
    const labBonus = labWeight != null ? (labWeight - 3) * 5 : 0
    const labReasons = labWeight != null && labBonus !== 0 ? [`preferencia_lab:${labWeight}`] : []

    const brandWeight = resolveBrandWeight(
      aiConfig,
      entry.clinicalEvaluation.effectiveCategory,
      entry.family,
      entry.offer,
    )
    const brandBonus = brandWeight.weight != null ? (brandWeight.weight - 3) * 5 : 0
    const brandReasons =
      brandWeight.weight != null && brandBonus !== 0 && brandWeight.brand
        ? [`preferencia_marca:${brandWeight.brand}:${brandWeight.weight}`]
        : []

    const profileScoring = scoreStoreProfile({
      aiConfig,
      input,
      offer: entry.offer,
      family: entry.family,
      offerFeatures,
      finalPrice: entry.finalPrice,
      peerPrices,
      seeksThinness: wantsThinLens(input),
      resistancePriority: getResistancePriority(input),
      thinnessPriority: getThinnessPriority(input),
    })

    const totalScore = Number(
      (
        offerScoring.score +
        treatmentScoring.score +
        embeddedScoring.score +
        labBonus +
        brandBonus +
        profileScoring.score
      ).toFixed(2),
    )
    const sourceLabel =
      entry.family.sourceLaboratorio ||
      entry.offer.sourceLaboratorio ||
      'catalogo'
    const configKey = `${sourceLabel} | ${entry.family.nome} | ${entry.offer.raw_label} | ${
      entry.treatment?.nome || embeddedTreatment?.name || 'sem_tratamento'
    }`

    return {
      configKey,
      familyId: entry.family.id,
      offerId: entry.offer.id,
      treatmentId: entry.treatment?.id || null,
      familyName: entry.family.nome,
      offerLabel: entry.offer.canonical_label || entry.offer.raw_label,
      treatmentName: entry.treatment?.nome || (embeddedTreatment ? `${embeddedTreatment.name} (embutido)` : null),
      treatmentType: entry.treatment?.tipo || embeddedTreatment?.type || null,
      sourceLaboratorio: entry.family.sourceLaboratorio || entry.offer.sourceLaboratorio || null,
      sourceVersao: entry.family.sourceVersao || entry.offer.sourceVersao || null,
      sourceVersionId: entry.family.sourceVersionId || entry.offer.sourceVersionId || null,
      clinicalCategory: entry.clinicalEvaluation.effectiveCategory,
      finalPrice: entry.finalPrice,
      basePrice: entry.offer.base_price,
      reasons: uniqueStrings([
        ...offerScoring.reasons,
        ...treatmentScoring.reasons,
        ...embeddedScoring.reasons,
        ...labReasons,
        ...brandReasons,
        ...profileScoring.reasons,
      ]),
      score: totalScore,
      sourcePageReference: entry.offer.source_page_reference,
      commercialSummary:
        entry.usageProfile?.commercial_summary ||
        getSharedFamilySemanticProfile(entry.family.nome)?.commercial_summary ||
        null,
      recommendationNotes:
        entry.usageProfile?.recommendation_notes ||
        getSharedFamilySemanticProfile(entry.family.nome)?.recommendation_notes ||
        null,
      treatmentSummary:
        getTreatmentSemanticProfile(entry.treatment)?.commercial_summary ||
        embeddedTreatment?.semantic.commercial_summary ||
        null,
      treatmentNotes:
        getTreatmentSemanticProfile(entry.treatment)?.recommendation_notes ||
        embeddedTreatment?.semantic.recommendation_notes ||
        null,
      treatmentExplainWhy:
        getTreatmentSemanticProfile(entry.treatment)?.explain_why ||
        embeddedTreatment?.semantic.explain_why ||
        null,
    } satisfies RecommendationOption
  })

  return dedupeRankedEntries(
    ranked.filter((entry) => !excludedConfigKeys.includes(entry.configKey)),
  )
}

export async function loadRecommendationCatalog(versionId: string): Promise<RecommendationCatalog> {
  const supabaseAdmin = createAdminClient() as any

  const { data: versionMeta, error: versionMetaError } = await supabaseAdmin
    .from('global_catalog_versions')
    .select('id,laboratorio,versao')
    .eq('id', versionId)
    .single()

  if (versionMetaError) throw versionMetaError

  const { data: families, error: familiesError } = await supabaseAdmin
    .from('global_lens_families')
    .select('id,nome,design,tags_uso,tags_beneficios,clinical_category')
    .eq('version_id', versionId)

  if (familiesError) throw familiesError

  const familyIds = (families || []).map((family: { id: string }) => family.id)

  const [
    { data: offers, error: offersError },
    { data: grids, error: gridsError },
    { data: usageProfiles, error: profilesError },
    { data: compatibilities, error: compatError },
    { data: treatments, error: treatmentsError },
  ] = await Promise.all([
    supabaseAdmin
      .from('global_lens_offers')
      .select('id,family_id,raw_label,canonical_label,material,clinical_category,features,base_price,is_atomic_offer,already_includes_treatment,allows_composition,source_page_reference')
      .in('family_id', familyIds),
    supabaseAdmin
      .from('global_offer_diopter_grids')
      .select('offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max'),
    supabaseAdmin
      .from('global_usage_profiles')
      .select('family_id,usage_tags,benefit_tags,commercial_summary,recommendation_notes')
      .eq('profile_scope', 'family')
      .in('family_id', familyIds),
    supabaseAdmin
      .from('global_offer_treatments_compatibility')
      .select('offer_id,treatment_id,special_price,price_mode'),
    supabaseAdmin
      .from('global_treatments')
      .select('id,nome,tipo,features')
      .eq('version_id', versionId),
  ])

  if (offersError) throw offersError
  if (gridsError) throw gridsError
  if (profilesError) throw profilesError
  if (compatError) throw compatError
  if (treatmentsError) throw treatmentsError

  return {
    families: (families || []).map((family: Record<string, unknown>) => ({
      id: String(family.id),
      nome: String(family.nome || ''),
      design: family.design ? String(family.design) : null,
      tags_uso: normalizeStringArray(family.tags_uso),
      tags_beneficios: normalizeStringArray(family.tags_beneficios),
      clinical_category: normalizeCategory(family.clinical_category),
      sourceLaboratorio: versionMeta?.laboratorio ? String(versionMeta.laboratorio) : null,
      sourceVersao: versionMeta?.versao ? String(versionMeta.versao) : null,
      sourceVersionId: versionMeta?.id ? String(versionMeta.id) : null,
    })),
    offers: (offers || []).map((offer: Record<string, unknown>) => ({
      id: String(offer.id),
      family_id: String(offer.family_id),
      raw_label: String(offer.raw_label || ''),
      canonical_label: offer.canonical_label ? String(offer.canonical_label) : null,
      material: offer.material ? String(offer.material) : null,
      clinical_category: normalizeCategory(offer.clinical_category),
      features: toFeatureRecord(offer.features),
      base_price: normalizeNumber(offer.base_price),
      is_atomic_offer: Boolean(offer.is_atomic_offer),
      already_includes_treatment: Boolean(offer.already_includes_treatment),
      allows_composition: Boolean(offer.allows_composition),
      source_page_reference: offer.source_page_reference ? String(offer.source_page_reference) : null,
      sourceLaboratorio: versionMeta?.laboratorio ? String(versionMeta.laboratorio) : null,
      sourceVersao: versionMeta?.versao ? String(versionMeta.versao) : null,
      sourceVersionId: versionMeta?.id ? String(versionMeta.id) : null,
    })),
    grids: (grids || []).map((grid: Record<string, unknown>) => ({
      offer_id: String(grid.offer_id),
      sph_min: normalizeNumber(grid.sph_min),
      sph_max: normalizeNumber(grid.sph_max),
      cyl_min: normalizeNumber(grid.cyl_min),
      cyl_max: normalizeNumber(grid.cyl_max),
      add_min: normalizeNumber(grid.add_min),
      add_max: normalizeNumber(grid.add_max),
    })),
    usageProfiles: (usageProfiles || []).map((profile: Record<string, unknown>) => ({
      family_id: String(profile.family_id),
      usage_tags: normalizeStringArray(profile.usage_tags),
      benefit_tags: normalizeStringArray(profile.benefit_tags),
      commercial_summary: profile.commercial_summary ? String(profile.commercial_summary) : null,
      recommendation_notes: profile.recommendation_notes ? String(profile.recommendation_notes) : null,
    })),
    compatibilities: (compatibilities || []).map((compatibility: Record<string, unknown>) => ({
      offer_id: String(compatibility.offer_id),
      treatment_id: String(compatibility.treatment_id),
      special_price: normalizeNumber(compatibility.special_price),
      price_mode: compatibility.price_mode === 'surcharge' ? 'surcharge' : 'final',
    })),
    treatments: (treatments || []).map((treatment: Record<string, unknown>) => ({
      id: String(treatment.id),
      nome: String(treatment.nome || ''),
      tipo: treatment.tipo ? String(treatment.tipo) : null,
      features: toFeatureRecord(treatment.features),
    })),
  }
}

async function loadRecommendationCatalogMulti(versionIds: string[]): Promise<RecommendationCatalog> {
  const uniqueIds = uniqueValues(versionIds.filter(Boolean))
  if (uniqueIds.length <= 1) {
    return loadRecommendationCatalog(uniqueIds[0])
  }

  const catalogs = await Promise.all(uniqueIds.map((id) => loadRecommendationCatalog(id)))
  return {
    families: catalogs.flatMap((catalog) => catalog.families),
    offers: catalogs.flatMap((catalog) => catalog.offers),
    grids: catalogs.flatMap((catalog) => catalog.grids),
    usageProfiles: catalogs.flatMap((catalog) => catalog.usageProfiles),
    compatibilities: catalogs.flatMap((catalog) => catalog.compatibilities),
    treatments: catalogs.flatMap((catalog) => catalog.treatments),
  }
}

export async function recommendLensConfigurations(params: {
  versionId: string
  versionIds?: string[]
  caseInput: RecommendationCaseInput
  topN?: number
  forcedClinicalCategories?: ClinicalCategory[]
  requiredFeatures?: string[]
    budgetModeOverride?: BudgetMode | null
    maxPrice?: number | null
    minPrice?: number | null
    targetPrice?: number | null
    excludedConfigKeys?: string[]
    catalog?: RecommendationCatalog
    aiConfig?: AiSuggestionConfig
}): Promise<RecommendationOption[]> {
  const {
    versionId,
    topN = 3,
    forcedClinicalCategories,
    requiredFeatures = [],
    budgetModeOverride,
    maxPrice,
    minPrice,
    targetPrice,
    excludedConfigKeys = [],
  } = params

  const resolvedVersionIds = params.versionIds?.length
    ? uniqueValues(params.versionIds)
    : [versionId]
  const catalog =
    params.catalog ||
    (resolvedVersionIds.length > 1
      ? await loadRecommendationCatalogMulti(resolvedVersionIds)
      : await loadRecommendationCatalog(resolvedVersionIds[0]))
  const input = enrichCaseInput({
    ...params.caseInput,
    budget_mode: budgetModeOverride || params.caseInput.budget_mode || 'intermediario',
  })
  const strictCategories = forcedClinicalCategories?.length
    ? forcedClinicalCategories
    : getDesiredClinicalCategories(input)
  const strictRanked = rankRecommendationOptions({
    catalog,
    input,
    aiConfig: params.aiConfig,
    forcedClinicalCategories: strictCategories,
    requiredFeatures,
    maxPrice,
    minPrice,
    targetPrice,
    excludedConfigKeys,
  })

  if (topN <= 2) {
    return selectDiverseTopEntries(strictRanked, topN)
  }

  const strictQuota = Math.min(2, topN)
  const selected = selectDiverseTopEntries(strictRanked, strictQuota)
  const exploratoryCategories = getExploratoryClinicalCategories(input, strictCategories)

  if (!sameCategories(strictCategories, exploratoryCategories)) {
    const exploratoryRanked = applyExploratoryPriceDiscipline(
      rankRecommendationOptions({
        catalog,
        input,
        aiConfig: params.aiConfig,
        forcedClinicalCategories: exploratoryCategories,
        requiredFeatures,
        maxPrice,
      minPrice,
      targetPrice,
      excludedConfigKeys,
      }).map((entry) => {
        if (strictCategories.includes(entry.clinicalCategory)) {
          return entry
        }

      return {
        ...entry,
        score: Number((entry.score - 0.75).toFixed(2)),
          reasons: uniqueStrings([...entry.reasons, 'opcao:alternativa_plausivel']),
        }
      }),
      selected,
    )

    appendPrioritizedEntries(selected, exploratoryRanked, topN)
  }

  if (selected.length < topN) {
    appendPrioritizedEntries(selected, strictRanked, topN)
  }

  return selected.slice(0, topN)
}

export function inferConversationIntents(message: string): ConversationIntent[] {
  const normalized = normalizeIntentText(message)
  const intents: ConversationIntent[] = []

  if (/\b(caro|cara|mais barata|mais barato|barata|barato|economica|economico)\b/.test(normalized)) {
    intents.push({ type: 'mais_barata', confidence: 'high', raw: message })
  }

  if (/\b(premium|melhor|mais completa|mais completo|top)\b/.test(normalized)) {
    intents.push({ type: 'mais_premium', confidence: 'medium', raw: message })
  }

  if (/\b(adapt|conforto|facil adaptar|mais facil)\b/.test(normalized)) {
    intents.push({ type: 'mais_facil_adaptar', confidence: 'medium', raw: message })
  }

  if (/\b(transitions|fotossens|photo)\b/.test(normalized)) {
    intents.push({ type: 'manter_transitions', confidence: 'high', raw: message })
  }

  if (/\b(blue uv|luz azul|blueuv)\b/.test(normalized)) {
    intents.push({ type: 'manter_blue_uv', confidence: 'high', raw: message })
  }

  if (/\b(outra|alternativa|outra sugestao|outra opcao)\b/.test(normalized)) {
    intents.push({ type: 'alternativa', confidence: 'medium', raw: message })
  }

  return intents
}

function uniqueCategories(values: ClinicalCategory[] | undefined): ClinicalCategory[] | undefined {
  if (!values?.length) return undefined
  return Array.from(new Set(values))
}

export function applyConversationIntents(params: {
  state: RecommendationConversationState
  intents: ConversationIntent[]
}): RecommendationConversationState {
  const { state, intents } = params
  const rawMessage = intents[0]?.raw || ''
  const explicitPriceTarget = extractPriceTarget(rawMessage)
  const nextState: RecommendationConversationState = {
    ...state,
    caseInput: enrichCaseInput({ ...state.caseInput }),
    requiredFeatures: [...(state.requiredFeatures || [])],
    excludedConfigKeys: [...(state.excludedConfigKeys || [])],
    forcedClinicalCategories: state.forcedClinicalCategories ? [...state.forcedClinicalCategories] : undefined,
    lastRecommendations: [...(state.lastRecommendations || [])],
    targetPrice: state.targetPrice ?? null,
  }

  const currentTop = state.lastRecommendations?.[0] || null
  if (currentTop?.clinicalCategory && currentTop.clinicalCategory !== 'indefinida') {
    nextState.forcedClinicalCategories = uniqueCategories([currentTop.clinicalCategory])
  }

  for (const intent of intents) {
    if (intent.type === 'mais_barata') {
      nextState.budgetModeOverride = explicitPriceTarget.maxPrice != null
        ? state.caseInput.budget_mode || 'intermediario'
        : 'economico'
      if (explicitPriceTarget.maxPrice != null) {
        nextState.maxPrice = explicitPriceTarget.maxPrice
        nextState.targetPrice = explicitPriceTarget.targetPrice ?? explicitPriceTarget.maxPrice
      } else if (currentTop) {
        nextState.maxPrice = Number((currentTop.finalPrice - 0.01).toFixed(2))
        nextState.targetPrice = nextState.maxPrice
      }
      continue
    }

    if (intent.type === 'mais_premium') {
      nextState.budgetModeOverride = 'premium'
      if (explicitPriceTarget.minPrice != null) {
        nextState.minPrice = explicitPriceTarget.minPrice
        nextState.targetPrice = explicitPriceTarget.targetPrice ?? explicitPriceTarget.minPrice
      } else if (currentTop) {
        nextState.minPrice = currentTop.finalPrice
        nextState.targetPrice = nextState.minPrice
      }
      continue
    }

    if (intent.type === 'mais_facil_adaptar') {
      nextState.caseInput = enrichCaseInput({
        ...nextState.caseInput,
        adaptation_difficulty: 'alta',
        desired_benefits: uniqueStrings([...(nextState.caseInput.desired_benefits || []), 'adaptacao_rapida']),
      })
      continue
    }

    if (intent.type === 'manter_transitions') {
      nextState.requiredFeatures = uniqueStrings([...(nextState.requiredFeatures || []), 'transitions'])
      nextState.caseInput = enrichCaseInput({
        ...nextState.caseInput,
        preferred_features: uniqueStrings([...(nextState.caseInput.preferred_features || []), 'transitions']),
      })
      continue
    }

    if (intent.type === 'manter_blue_uv') {
      nextState.requiredFeatures = uniqueStrings([...(nextState.requiredFeatures || []), 'blue_uv'])
      nextState.caseInput = enrichCaseInput({
        ...nextState.caseInput,
        preferred_features: uniqueStrings([...(nextState.caseInput.preferred_features || []), 'blue_uv']),
      })
      continue
    }

    if (intent.type === 'alternativa' && currentTop) {
      nextState.excludedConfigKeys = uniqueStrings([
        ...(nextState.excludedConfigKeys || []),
        currentTop.configKey,
      ])
    }
  }

  if (explicitPriceTarget.maxPrice != null) {
    nextState.maxPrice = explicitPriceTarget.maxPrice
    nextState.targetPrice = explicitPriceTarget.targetPrice ?? explicitPriceTarget.maxPrice
  }

  if (explicitPriceTarget.minPrice != null) {
    nextState.minPrice = explicitPriceTarget.minPrice
    nextState.targetPrice = explicitPriceTarget.targetPrice ?? explicitPriceTarget.minPrice
  }

  return nextState
}

export async function continueRecommendationConversation(params: {
  state: RecommendationConversationState
  userMessage: string
  topN?: number
}): Promise<{
  intents: ConversationIntent[]
  nextState: RecommendationConversationState
  recommendations: RecommendationOption[]
}> {
  const intents = inferConversationIntents(params.userMessage)
  const nextState = applyConversationIntents({
    state: params.state,
    intents,
  })

  const recommendations = await recommendLensConfigurations({
    versionId: nextState.versionId,
    versionIds: nextState.versionIds,
    caseInput: nextState.caseInput,
    aiConfig: nextState.aiConfig,
    topN: params.topN || 3,
    forcedClinicalCategories: nextState.forcedClinicalCategories,
    requiredFeatures: nextState.requiredFeatures,
    budgetModeOverride: nextState.budgetModeOverride,
    maxPrice: nextState.maxPrice,
    minPrice: nextState.minPrice,
    targetPrice: nextState.targetPrice,
    excludedConfigKeys: nextState.excludedConfigKeys,
  })

  nextState.lastRecommendations = recommendations

  return {
    intents,
    nextState,
    recommendations,
  }
}

export async function startRecommendationConversation(params: {
  versionId: string
  versionIds?: string[]
  caseInput: RecommendationCaseInput
  topN?: number
  aiConfig?: AiSuggestionConfig
}): Promise<{
  state: RecommendationConversationState
  recommendations: RecommendationOption[]
}> {
  const state: RecommendationConversationState = {
    versionId: params.versionId,
    versionIds: params.versionIds,
    caseInput: enrichCaseInput(params.caseInput),
    aiConfig: params.aiConfig,
    requiredFeatures: [],
    excludedConfigKeys: [],
    targetPrice: null,
    lastRecommendations: [],
  }

  const tPrice = params.caseInput.targetPrice ?? null
  const recommendations = await recommendLensConfigurations({
    versionId: params.versionId,
    versionIds: params.versionIds,
    caseInput: state.caseInput,
    aiConfig: params.aiConfig,
    topN: params.topN || 3,
    targetPrice: tPrice,
    maxPrice: tPrice ? tPrice * 1.2 : undefined,
  })

  state.lastRecommendations = recommendations

  return {
    state,
    recommendations,
  }
}
