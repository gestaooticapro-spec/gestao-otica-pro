import { createAdminClient } from '@/lib/supabase/admin'
import { getSharedFamilySemanticProfile } from '@/lib/server/shared-lens-semantics'
import type { AiSuggestionConfig, AiStoreProfileLevel } from '@/lib/types/ai-config.types'
import type { LensGeometry } from '@/lib/actions/lens-geometry.actions'
import {
  evaluateHeatmapGeometryCompatibility,
  findGeometryForRecommendation,
  type HeatmapGeometryCompatibility,
  type PersistedHeatmapSample,
} from '@/lib/server/heatmap-geometry-compatibility'

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

export type PrescriptionEye = {
  esferico: number | null
  cilindrico: number | null
  eixo?: number | null
}

export type UsablePrescriptionEyes = 'ambos' | 'od' | 'oe'

const MAX_ANTI_FATIGUE_ADDITION = 1.25

export type RecommendationCaseInput = {
  idade?: number | null
  marca_atual?: string | null
  esferico: number | null
  cilindrico: number | null
  adicao?: number | null
  /** Receita completa usada para a disponibilidade técnica. */
  receita?: {
    od: PrescriptionEye
    oe: PrescriptionEye
    olhos_utilizaveis?: UsablePrescriptionEyes
  }
  rotina_tags?: string[]
  objetivo_tags?: string[]
  desired_benefits?: string[]
  preferred_features?: string[]
  rejected_features?: string[]
  /** Categorias que o cliente recusou explicitamente. Sao filtros absolutos. */
  rejected_categories?: ClinicalCategory[]
  /** Marcas/familias e laboratorios recusados explicitamente. */
  rejected_brands?: string[]
  rejected_labs?: string[]
  interview_completed?: boolean
  current_lens?: {
    name: string
    source: 'history' | 'catalog' | 'free_text'
    satisfaction?: 'satisfied' | 'partial' | 'unsatisfied' | null
  } | null
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
  originalRank?: number
  presentationRank?: number
  commercialRole?: 'anchor' | 'target' | 'alternative'
  presentationLabel?: 'Opção 1' | 'Opção 2' | 'Opção 3'
  budgetDelta?: number | null
  heatmapCompatibility?: HeatmapGeometryCompatibility
}

export type RecommendationPresentationStrategy = {
  applied: boolean
  type: 'target_as_second_option' | 'none'
  reason: string | null
  originalOrder: string[]
  displayOrder: string[]
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

type CommercialTier = 'entrada' | 'intermediaria' | 'premium'

type CatalogTreatment = {
  id: string
  nome: string
  tipo: string | null
  features: Record<string, unknown>
}

export type RecommendationCatalog = {
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

function rejectsPremiumPreference(input: RecommendationCaseInput): boolean {
  const note = withoutAccents(String(input.notes || '').toLowerCase())

  return (
    (input.objetivo_tags || []).includes('premium_recusado') ||
    note.includes('aceita premium: nao') ||
    note.includes('nao aceita premium') ||
    note.includes('não aceita premium') ||
    note.includes('evitar pacote premium') ||
    note.includes('evitando pacote premium') ||
    note.includes('evitar pacotes premium') ||
    note.includes('evitando pacotes premium') ||
    note.includes('evitar solucoes premium') ||
    note.includes('evitando solucoes premium') ||
    note.includes('evitar soluções premium') ||
    note.includes('evitando soluções premium') ||
    note.includes('não aceita premium')
  )
}

function normalizeCommercialTier(value: string | null | undefined): CommercialTier {
  const normalized = withoutAccents(String(value || '').toLowerCase())
    .replace(/-/g, '_')
    .replace(/\s+/g, '_')
  if (normalized === 'entrada') return 'entrada'
  if (normalized.includes('basico') || normalized.includes('economico')) return 'entrada'
  if (normalized.includes('intermediaria') || normalized.includes('intermediario') || normalized.includes('equilibrado')) {
    return 'intermediaria'
  }
  if (normalized.startsWith('premium') || normalized.includes('ultra_premium')) return 'premium'
  return 'intermediaria'
}

function resolveLensTier(family: CatalogFamily, offer: CatalogOffer): CommercialTier {
  const shared = getSharedFamilySemanticProfile(family.nome)
  const sharedTier = normalizeCommercialTier(shared?.positioning || null)
  if (shared?.positioning) return sharedTier

  const features = toFeatureRecord(offer.features)
  const semantic = toFeatureRecord(features.semantic_profile)
  const fromOffer = normalizeCommercialTier(
    typeof semantic.positioning === 'string' ? semantic.positioning : null,
  )
  return fromOffer
}

function resolveTreatmentTier(
  treatment: CatalogTreatment | null,
  embedded: EmbeddedTreatmentInfo | null,
): CommercialTier {
  const semantic = getTreatmentSemanticProfile(treatment)
  const rawTier =
    semantic?.positioning ||
    semantic?.price_tier ||
    embedded?.semantic.positioning ||
    embedded?.semantic.price_tier ||
    null

  return normalizeCommercialTier(rawTier)
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
  if (/(trivex|pnx)/.test(descriptor)) return 1.53
  return null
}

function stringifyPositiveFeatureValues(features: Record<string, unknown> = {}): string {
  return Object.entries(features)
    .filter(([, value]) => {
      if (value === true) return true
      if (typeof value === 'string' && value.trim()) return true
      if (Array.isArray(value) && value.length > 0) return true
      return false
    })
    .map(([key, value]) => `${key} ${Array.isArray(value) ? value.join(' ') : String(value)}`)
    .join(' ')
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

  const clinicalCat =
    offer.clinical_category !== 'indefinida' ? offer.clinical_category : family?.clinical_category
  if (clinicalCat === 'multifocal' || clinicalCat === 'ocupacional' || clinicalCat === 'bifocal') {
    return hasProntaSignals ? 'pronta' : 'sob_demanda'
  }

  const isLikelySobDemanda =
    !hasProntaSignals &&
    /(varilux|progressiva|multifocal|bifocal|interview|digitime|workstyle|enroute|gamavision|itop|myfocus|sync iii|sync3|eyezen boost|eyezen\+)/.test(
      descriptor,
    )
  if (isLikelySobDemanda) return 'sob_demanda'

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
    finalPrice,
    peerPrices,
    seeksThinness,
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

function hasPrimaryOccupationalDemand(input: RecommendationCaseInput): boolean {
  const rotinaTags = input.rotina_tags || []
  const desiredBenefits = input.desired_benefits || []
  const objectiveTags = input.objetivo_tags || []
  const notes = withoutAccents((input.notes || '').toLowerCase())
  const hasExplicitOccupationalObjective =
    objectiveTags.includes('ocupacional') || desiredBenefits.includes('ocupacional')
  const hasExplicitFirstMultifocalObjective = objectiveTags.includes('primeira_multifocal')
  const hasNearIntermediateFocus =
    rotinaTags.includes('computador') &&
    rotinaTags.includes('leitura') &&
    !rotinaTags.includes('dirigir') &&
    !rotinaTags.includes('dirigir_noite')

  if (hasExplicitOccupationalObjective) return true
  if (hasExplicitFirstMultifocalObjective) return false

  return (
    desiredBenefits.includes('campo_intermediario') ||
    notes.includes('oculos_escritorio') ||
    notes.includes('oculos de escritorio') ||
    notes.includes('escritorio') ||
    notes.includes('perto/intermediario') ||
    notes.includes('perto e intermediario') ||
    (hasNearIntermediateFocus &&
      input.adicao != null &&
      input.adicao >= 1.25 &&
      (notes.includes('nao dirige') || notes.includes('longe plena nao e prioridade')))
  )
}

export function getDesiredClinicalCategories(input: RecommendationCaseInput): ClinicalCategory[] {
  const rotinaTags = input.rotina_tags || []
  const desiredBenefits = input.desired_benefits || []
  const objetivoTags = input.objetivo_tags || []
  const hasPositiveAddition = input.adicao != null && input.adicao > 0

  const rejected = new Set(input.rejected_categories || [])
  const allowed = (categories: ClinicalCategory[]) => categories.filter((category) => !rejected.has(category))

  if (objetivoTags.includes('ocupacional') || desiredBenefits.includes('ocupacional')) {
    return allowed(hasPositiveAddition ? ['ocupacional'] : ['visao_simples'])
  }

  // Explicit occupational request from UI (e.g. "óculos para trabalho/escritório")
  if (hasPrimaryOccupationalDemand(input)) {
    return allowed(hasPositiveAddition
      ? ['ocupacional', 'multifocal', 'bifocal']
      : ['ocupacional', 'visao_simples'])
  }

  if (hasPositiveAddition) {
    if (objetivoTags.includes('uso_perto_especifico') && !rejected.has('ocupacional')) return ['ocupacional']
    if (!rejected.has('multifocal')) return ['multifocal']
    if (!rejected.has('bifocal')) return ['bifocal']
    return []
  }

  if (
    isPlausibleMyopiaControlCase(input) &&
    (rotinaTags.includes('controle_miopia') ||
      desiredBenefits.includes('controle_miopia') ||
      objetivoTags.includes('controle_miopia'))
  ) {
    return ['controle_miopia']
  }

  if (acceptsDedicatedSolarAlternative(input)) {
    return ['plana_solar']
  }

  if (hasPrimarySunDemand(input)) {
    return ['visao_simples']
  }

  return ['visao_simples']
}

function isPlausibleMyopiaControlCase(input: RecommendationCaseInput): boolean {
  const isYoungPatient = input.idade != null && input.idade <= 17
  const hasMyopia = input.esferico != null && input.esferico < 0
  return input.adicao == null && isYoungPatient && hasMyopia
}

function hasPrimarySunDemand(input: RecommendationCaseInput): boolean {
  const rotinaTags = input.rotina_tags || []
  const desiredBenefits = input.desired_benefits || []
  const objectiveTags = input.objetivo_tags || []
  const preferredFeatures = input.preferred_features || []
  const notes = withoutAccents((input.notes || '').toLowerCase())
  const highThinLensPriority =
    getPrescriptionStrength(input) >= 6 &&
    (wantsThinLens(input) || desiredBenefits.includes('estetica') || desiredBenefits.includes('lente_fina'))
  const secondaryPhotochromicForHighPrescription =
    objectiveTags.includes('transitions_secundario') && highThinLensPriority
  const explicitSolarPrimaryDemand =
    objectiveTags.includes('oculos_sol_grau') ||
    objectiveTags.includes('solar') ||
    notes.includes('oculos_sol_grau') ||
    notes.includes('oculos de sol') ||
    notes.includes('sol grau') ||
    notes.includes('trabalha ao ar livre') ||
    notes.includes('conforto no sol') ||
    notes.includes('prioridade: sol') ||
    notes.includes('incomodo principal: luz')

  if (secondaryPhotochromicForHighPrescription) {
    return explicitSolarPrimaryDemand
  }

  return (
    (preferredFeatures.includes('transitions') &&
      (rotinaTags.includes('sol') || desiredBenefits.includes('conforto_luz'))) ||
    explicitSolarPrimaryDemand ||
    notes.includes('sensibilidade a luz')
  )
}

function acceptsDedicatedSolarAlternative(input: RecommendationCaseInput): boolean {
  const objectiveTags = input.objetivo_tags || []
  const preferredFeatures = input.preferred_features || []
  const notes = withoutAccents((input.notes || '').toLowerCase())

  return (
    preferredFeatures.includes('solar') ||
    objectiveTags.includes('oculos_sol_grau') ||
    objectiveTags.includes('solar') ||
    notes.includes('oculos_sol_grau') ||
    notes.includes('oculos de sol') ||
    notes.includes('sol grau') ||
    notes.includes('lente solar') ||
    notes.includes('solar dedicada')
  )
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

function matchesGrid(
  input: RecommendationCaseInput,
  grids: CatalogGrid[],
  effectiveCategory?: ClinicalCategory,
): boolean {
  // Sem faixa de grau publicada não existe prova de disponibilidade.
  if (!grids.length) return false
  const requiresAddRange =
    effectiveCategory === 'multifocal' ||
    effectiveCategory === 'bifocal' ||
    effectiveCategory === 'ocupacional'

  const selectedEyes = input.receita
    ? input.receita.olhos_utilizaveis === 'od'
      ? [input.receita.od]
      : input.receita.olhos_utilizaveis === 'oe'
        ? [input.receita.oe]
        : [input.receita.od, input.receita.oe]
    : [{ esferico: input.esferico, cilindrico: input.cilindrico }]
  // Na entrevista manual, cilindro vazio significa ausencia de astigmatismo (0,00),
  // e uma receita pode ser monocular mesmo quando o seletor ainda esta em "ambos".
  const prescribedEyes = selectedEyes.filter((eye) => eye.esferico != null)
  if (prescribedEyes.length === 0) return false
  if (requiresAddRange && input.adicao == null) return false

  return prescribedEyes.every((eye) => grids.some((grid) => {
    const sphOk = between(eye.esferico, grid.sph_min, grid.sph_max)
    const cylOk = between(eye.cilindrico ?? 0, grid.cyl_min, grid.cyl_max)
    const addOk =
      input.adicao == null
        ? true
        : grid.add_min == null && grid.add_max == null
          ? !requiresAddRange
          : between(input.adicao, grid.add_min, grid.add_max)
    return sphOk && cylOk && addOk
  }))
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

const EXPLICIT_EMBEDDED_TREATMENTS: Array<{
  pattern: RegExp
  treatment: EmbeddedTreatmentInfo
}> = [
  {
    pattern: /\bantirreflexo blue premium\b|\bfiltro de luz azul\b/,
    treatment: {
      name: 'Antirreflexo Blue Premium',
      type: 'Antirreflexo',
      semantic: {
        positioning: 'premium',
        price_tier: 'premium',
        usage_tags: ['uso_diario', 'telas', 'computador', 'celular'],
        benefit_tags: ['antirreflexo', 'conforto_digital', 'conforto_visual', 'protecao_luz_azul'],
        commercial_summary: 'Tratamento premium com antirreflexo e filtro azul para rotina digital.',
        recommendation_notes: 'Sobe quando telas, Blue/UV e custo-beneficio sao prioridades.',
        explain_why: 'Foi escolhido por combinar conforto digital e filtragem de luz azul.',
      },
    },
  },
  {
    pattern: /\bcrizal sapphire hr\b/,
    treatment: {
      name: 'Crizal Sapphire HR',
      type: 'Antirreflexo',
      semantic: {
        positioning: 'premium',
        price_tier: 'premium',
        usage_tags: ['uso_diario', 'telas', 'dirigir_noite', 'computador'],
        benefit_tags: ['antirreflexo', 'clareza', 'conforto_visual', 'qualidade_optica', 'ar_premium'],
        commercial_summary: 'Antirreflexo premium com foco em transparência, clareza e desempenho geral.',
        recommendation_notes: 'Sobe quando o caso pede AR premium, direção noturna e melhor transparência.',
        explain_why: 'Foi escolhido por entregar antirreflexo premium com boa performance visual geral.',
      },
    },
  },
  {
    pattern: /\bcrizal rock\b/,
    treatment: {
      name: 'Crizal Rock',
      type: 'Antirreflexo',
      semantic: {
        positioning: 'premium',
        price_tier: 'premium',
        usage_tags: ['uso_diario', 'dirigir_noite', 'computador'],
        benefit_tags: ['antirreflexo', 'durabilidade', 'resistencia_riscos', 'conforto_visual', 'ar_premium'],
        commercial_summary: 'Antirreflexo premium com foco em durabilidade, riscos e manchas.',
        recommendation_notes: 'Sobe quando o caso pede AR premium com maior robustez de uso.',
        explain_why: 'Foi escolhido por combinar antirreflexo com maior proposta de durabilidade.',
      },
    },
  },
  {
    pattern: /\bcrizal prevencia\b/,
    treatment: {
      name: 'Crizal Prevencia',
      type: 'Antirreflexo',
      semantic: {
        positioning: 'premium',
        price_tier: 'premium',
        usage_tags: ['uso_diario', 'telas', 'computador', 'celular'],
        benefit_tags: ['antirreflexo', 'protecao_luz_azul', 'conforto_digital', 'conforto_visual', 'ar_premium'],
        commercial_summary: 'Antirreflexo premium com filtragem seletiva de luz azul-violeta.',
        recommendation_notes: 'Sobe quando blue/UV e uso digital sao prioridades.',
        explain_why: 'Foi escolhido por unir antirreflexo e filtragem azul-violeta.',
      },
    },
  },
  {
    pattern: /\bcrizal easy pro\b/,
    treatment: {
      name: 'Crizal Easy Pro',
      type: 'Antirreflexo',
      semantic: {
        positioning: 'intermediaria',
        price_tier: 'intermediario',
        usage_tags: ['uso_diario', 'telas', 'computador'],
        benefit_tags: ['antirreflexo', 'facilidade_limpeza', 'conforto_visual'],
        commercial_summary: 'Antirreflexo Crizal de acesso/intermediario para rotina diaria.',
        recommendation_notes: 'Sobe quando o caso pede Crizal com bom custo-beneficio.',
        explain_why: 'Foi escolhido por equilibrar antirreflexo e custo-beneficio.',
      },
    },
  },
  {
    pattern: /\btrio easy clean\b/,
    treatment: {
      name: 'Trio Easy Clean',
      type: 'Antirreflexo',
      semantic: {
        positioning: 'entrada',
        price_tier: 'economico',
        usage_tags: ['uso_diario'],
        benefit_tags: ['antirreflexo', 'custo_beneficio'],
        commercial_summary: 'Antirreflexo de entrada com foco em custo-beneficio.',
        recommendation_notes: 'Sobe quando o orcamento e o principal limitador.',
        explain_why: 'Foi escolhido por manter antirreflexo com menor investimento.',
      },
    },
  },
  {
    pattern: /\bno reflex\b/,
    treatment: {
      name: 'No Reflex',
      type: 'Antirreflexo',
      semantic: {
        positioning: 'entrada',
        price_tier: 'economico',
        usage_tags: ['uso_diario'],
        benefit_tags: ['antirreflexo', 'custo_beneficio'],
        commercial_summary: 'Antirreflexo de entrada para reduzir reflexos com investimento menor.',
        recommendation_notes: 'Sobe quando a prioridade e preco controlado.',
        explain_why: 'Foi escolhido como antirreflexo de entrada.',
      },
    },
  },
  {
    pattern: /\bhi[\s-]?vision meiryo\b|\bmeiryo\b/,
    treatment: {
      name: 'Hi-Vision Meiryo',
      type: 'Antirreflexo',
      semantic: {
        positioning: 'premium',
        price_tier: 'premium',
        usage_tags: ['uso_diario', 'dirigir_noite', 'telas'],
        benefit_tags: ['antirreflexo', 'clareza', 'conforto_visual', 'qualidade_optica', 'ar_premium'],
        commercial_summary: 'Coating HOYA premium com foco em clareza, resistencia e facil limpeza.',
        recommendation_notes: 'Sobe quando o caso pede AR premium e conforto visual superior.',
        explain_why: 'Foi escolhido por entregar coating premium da HOYA.',
      },
    },
  },
  {
    pattern: /\bhi[\s-]?vision longlife bluecontrol\b|\blonglife bluecontrol\b|\blonglife bc\b/,
    treatment: {
      name: 'Hi-Vision LongLife BlueControl',
      type: 'Antirreflexo',
      semantic: {
        positioning: 'premium',
        price_tier: 'premium',
        usage_tags: ['uso_diario', 'telas', 'computador', 'dirigir_noite'],
        benefit_tags: ['antirreflexo', 'conforto_digital', 'conforto_visual', 'ar_premium'],
        commercial_summary: 'Coating HOYA LongLife com BlueControl, acima de No-Risk na hierarquia da tabela.',
        recommendation_notes: 'Sobe quando o caso une AR forte, durabilidade e demanda digital.',
        explain_why: 'Foi escolhido por combinar LongLife com BlueControl.',
      },
    },
  },
  {
    pattern: /\bno[\s-]?risk bluecontrol\b|\bno[\s-]?risk\b/,
    treatment: {
      name: 'No-Risk BlueControl',
      type: 'Antirreflexo',
      semantic: {
        positioning: 'intermediaria',
        price_tier: 'intermediario',
        usage_tags: ['uso_diario', 'telas', 'computador'],
        benefit_tags: ['antirreflexo', 'conforto_digital', 'conforto_visual'],
        commercial_summary: 'Coating intermediario HOYA com BlueControl.',
        recommendation_notes: 'Sobe como equilibrio entre custo e conforto digital.',
        explain_why: 'Foi escolhido como tratamento intermediario com BlueControl.',
      },
    },
  },
  {
    pattern: /\bhi[\s-]?vision hard\b|\bhard\b/,
    treatment: {
      name: 'Hi-Vision Hard',
      type: 'Antirreflexo',
      semantic: {
        positioning: 'entrada',
        price_tier: 'economico',
        usage_tags: ['uso_diario'],
        benefit_tags: ['antirreflexo', 'custo_beneficio'],
        commercial_summary: 'Tratamento base HOYA com antirreflexo/endurecimento.',
        recommendation_notes: 'Sobe quando a proposta e manter tratamento basico.',
        explain_why: 'Foi escolhido como tratamento de entrada.',
      },
    },
  },
  {
    pattern: /\bsigma blue\b/,
    treatment: {
      name: 'Sigma Blue',
      type: 'Antirreflexo',
      semantic: {
        positioning: 'premium',
        price_tier: 'premium',
        usage_tags: ['uso_diario', 'telas', 'computador', 'dirigir_noite'],
        benefit_tags: ['antirreflexo', 'conforto_digital', 'conforto_visual', 'ar_premium'],
        commercial_summary: 'Tratamento Sigma com filtro azul e proposta premium.',
        recommendation_notes: 'Sobe quando telas e AR mais completo sao relevantes.',
        explain_why: 'Foi escolhido por unir antirreflexo Sigma e filtro azul.',
      },
    },
  },
]

function resolveExplicitEmbeddedTreatment(offer: CatalogOffer): EmbeddedTreatmentInfo | null {
  const descriptor = withoutAccents(
    `${offer.raw_label || ''} ${offer.canonical_label || ''}`.toLowerCase(),
  )
  return EXPLICIT_EMBEDDED_TREATMENTS.find((entry) => entry.pattern.test(descriptor))?.treatment || null
}

function resolveEmbeddedTreatment(
  offer: CatalogOffer,
  input: RecommendationCaseInput,
): EmbeddedTreatmentInfo | null {
  if (!offer.already_includes_treatment) return null

  const explicitTreatment = resolveExplicitEmbeddedTreatment(offer)
  if (explicitTreatment) return explicitTreatment

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
  const sharedSemantic = getSharedFamilySemanticProfile(family.nome)
  if (sharedSemantic?.category === 'ocupacional') return 'ocupacional'

  const descriptor = withoutAccents(
    `${family.nome} ${offer.raw_label} ${offer.canonical_label || ''}`.toLowerCase(),
  )
  if (/\b(vision office|digitime|interview|softwear|workstyle|worksmart)\b/.test(descriptor)) {
    return 'ocupacional'
  }

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

  if (/(interview|digitime|office|work|softwear)/.test(descriptor)) {
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
    (input.adicao != null && input.adicao > 0) || desiredCategories.includes('multifocal') || desiredCategories.includes('bifocal')

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
  if (ratio > 1.6) return -16
  if (ratio > 1.45) return -13
  if (ratio > 1.3) return -10
  if (ratio > 1.2) return -7
  if (ratio > 1.1) return -4
  if (ratio > 1.03) return -1.5
  if (ratio >= 0.8) return 7
  if (ratio >= 0.6) return 2
  return -2
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
  const routine = input.rotina_tags || []
  const prescriptionStrength = getPrescriptionStrength(input)

  let priority = 0

  if (benefits.includes('estetica')) priority += 0.35
  if (benefits.includes('lente_fina')) priority += 0.35

  if (
    priority === 0 &&
    (routine.includes('crianca') || routine.includes('crianca_ativa') || routine.includes('risco_quebra'))
  ) {
    return 0
  }

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
  const hasResistantMaterial = /(airwear|poly\b|policarbonato|trivex|pnx|1\.59|1,59)/.test(offerDescriptor)
  const hasImpactResistantMaterial = /(airwear|poly\b|policarbonato|trivex|pnx)/.test(offerDescriptor)
  const indexValue = extractIndexValue(offerDescriptor)
  const budgetMode = normalizeBudgetMode(input.budget_mode)
  const prescriptionStrength = getPrescriptionStrength(input)
  const seeksThinness = wantsThinLens(input)
  const resistancePriority = getResistancePriority(input)
  const thinnessPriority = getThinnessPriority(input)
  const fulfillmentMode = resolveFulfillmentMode(offer, family)
  const desiredBenefits = input.desired_benefits || []
  const routineTags = input.rotina_tags || []
  const objectiveTags = input.objetivo_tags || []
  const primaryOccupationalDemand = hasPrimaryOccupationalDemand(input)
  const wantsMiopiaControl =
    isPlausibleMyopiaControlCase(input) &&
    (routineTags.includes('controle_miopia') ||
      desiredBenefits.includes('controle_miopia') ||
      (input.objetivo_tags || []).includes('controle_miopia'))
  const isChildCase = (input.idade != null && input.idade <= 14) || routineTags.includes('crianca')
  const isPediatricMyopiaControlCase = isChildCase && wantsMiopiaControl
  const isMyopiaControlOption = clinicalEvaluation.effectiveCategory === 'controle_miopia'
  const highResistanceChildCase =
    isChildCase &&
    (desiredBenefits.includes('resistencia') ||
      routineTags.includes('crianca_ativa') ||
      routineTags.includes('risco_quebra'))
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
    (input.adicao != null && input.adicao > 0 && input.adicao <= MAX_ANTI_FATIGUE_ADDITION ? 0.4 : 0)

  if (clinicalEvaluation.effectiveCategory !== 'indefinida') {
    score += 5
    reasons.push(`categoria:${clinicalEvaluation.effectiveCategory}`)
  } else if (clinicalEvaluation.confidencePenalty > 0) {
    score -= clinicalEvaluation.confidencePenalty
    reasons.push('categoria:mista_sem_oferta_definida')
  }

  if (input.adicao != null && input.adicao > 0) {
    if (['multifocal', 'bifocal'].includes(clinicalEvaluation.effectiveCategory)) {
      score += 3
      reasons.push('beneficio:adicao_presente')
    } else if (clinicalEvaluation.effectiveCategory === 'ocupacional') {
      score += primaryOccupationalDemand ? 7 : 1
      reasons.push('beneficio:adicao_ocupacional')
    } else if (
      clinicalEvaluation.effectiveCategory === 'visao_simples' &&
      input.adicao <= MAX_ANTI_FATIGUE_ADDITION
    ) {
      reasons.push('opcao:anti_fadiga_adicao_baixa')
    } else {
      score -= input.adicao >= 1.5 ? 24 : 4
      reasons.push('opcao:adicao_incompativel')
    }
  }

  if (
    clinicalEvaluation.effectiveCategory === 'ocupacional' &&
    objectiveTags.includes('primeira_multifocal') &&
    !primaryOccupationalDemand
  ) {
    score -= 5
    reasons.push('opcao:ocupacional_nao_substitui_primeira_multifocal')
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

  if (
    objectiveTags.includes('adaptacao_critica') &&
    input.adicao != null &&
    (input.adicao >= 2 || objectiveTags.includes('primeira_multifocal')) &&
    familyBenefits.includes('adaptacao_rapida')
  ) {
    score += objectiveTags.includes('primeira_multifocal') ? 5 : 2
    reasons.push('beneficio:adaptacao_rapida_risco_multifocal')
  }

  const PENALIZABLE_FEATURES = new Set(['blue_uv', 'transitions'])
  for (const preferredFeature of input.preferred_features || []) {
    const matchesFulfillment =
      (preferredFeature === 'sob_demanda' && fulfillmentMode === 'sob_demanda') ||
      (preferredFeature === 'pronta' && fulfillmentMode === 'pronta')
    const matchesSolarAlternative =
      preferredFeature === 'transitions' &&
      acceptsDedicatedSolarAlternative(input) &&
      (offerFeatures.solar === true || offerFeatures.polarizado === true)
    if (offerFeatures[preferredFeature] === true || matchesFulfillment || matchesSolarAlternative) {
      score += matchesSolarAlternative ? 2 : 3
      reasons.push(matchesSolarAlternative ? 'feature:solar_grau_alternativa' : `feature:${preferredFeature}`)
      if (preferredFeature === 'transitions' && hasPrimarySunDemand(input) && !matchesSolarAlternative) {
        score += 4
        reasons.push('feature:transitions_prioritario')
      }
    } else if (PENALIZABLE_FEATURES.has(preferredFeature)) {
      const isSecondaryFeature =
        (preferredFeature === 'transitions' &&
          objectiveTags.includes('transitions_secundario') &&
          !hasPrimarySunDemand(input)) ||
        (preferredFeature === 'blue_uv' && objectiveTags.includes('blue_uv_secundario'))
      const hasPrimaryTransitionsDemand =
        preferredFeature === 'transitions' && hasPrimarySunDemand(input)
      const hasPremiumFeatureDemand =
        budgetMode === 'premium' &&
        ((preferredFeature === 'transitions' &&
          (routineTags.includes('sol') || desiredBenefits.includes('conforto_luz'))) ||
          (preferredFeature === 'blue_uv' &&
            (routineTags.includes('computador') ||
              routineTags.includes('celular') ||
              desiredBenefits.includes('conforto_digital'))))
      const missingFeaturePenalty =
        isPediatricMyopiaControlCase && isMyopiaControlOption
          ? 3
          : hasPrimaryTransitionsDemand
            ? 12
          : isSecondaryFeature && budgetMode !== 'premium'
            ? 2
          : hasPremiumFeatureDemand && targetPrice != null && finalPrice > targetPrice
            ? 12
          : hasPremiumFeatureDemand
            ? 9
          : preferredFeature === 'transitions' &&
        isChildCase &&
        (routineTags.includes('sol') || desiredBenefits.includes('conforto_luz'))
          ? 9
          : preferredFeature === 'blue_uv' &&
              isChildCase &&
              ((input.rotina_tags || []).includes('celular') || desiredBenefits.includes('conforto_digital'))
            ? 8
          : 5
      score -= missingFeaturePenalty
      reasons.push(`feature:ausente_${preferredFeature}`)
      if (preferredFeature === 'transitions' && missingFeaturePenalty > 5) {
        reasons.push(isChildCase ? 'feature:ausente_transitions_pediatrico' : 'feature:ausente_transitions_prioritario')
      }
      if (preferredFeature === 'blue_uv' && missingFeaturePenalty > 5) {
        reasons.push(isChildCase ? 'feature:ausente_blue_uv_pediatrico' : 'feature:ausente_blue_uv_prioritario')
      }
      if (isPediatricMyopiaControlCase && isMyopiaControlOption) {
        reasons.push(`feature:${preferredFeature}_secundario_ao_controle_miopia`)
      } else if (isSecondaryFeature) {
        reasons.push(`feature:${preferredFeature}_secundario_triagem`)
      }
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

  if (resistancePriority > 0 && hasResistantMaterial) {
    score += Number((0.5 + resistancePriority * 1.5).toFixed(2))
    reasons.push('material:resistente')
  }

  if (objectiveTags.includes('resistencia_impacto_prioritaria')) {
    if (hasImpactResistantMaterial) {
      score += 3
      reasons.push('material:resistencia_impacto')
    } else if (!highResistanceChildCase) {
      score -= 2
      reasons.push('material:resistencia_impacto_nao_confirmada')
    }
  }

  if (
    !highResistanceChildCase &&
    resistancePriority >= 0.75 &&
    indexValue != null &&
    indexValue >= 1.67 &&
    !hasImpactResistantMaterial
  ) {
    score -= indexValue >= 1.74 ? 2.5 : 1.5
    reasons.push('material:alto_indice_menos_resistente')
  }

  if (highResistanceChildCase && !hasResistantMaterial) {
    score -= 5
    reasons.push('material:resistencia_infantil_nao_atendida')
  }

  if (highResistanceChildCase && /(1\.67|1,67|1\.74|1,74)/.test(offerDescriptor)) {
    score -= indexValue != null && indexValue >= 1.74 ? 5 : 3.5
    reasons.push('material:alto_indice_fraco_crianca')
  }

  if (seeksThinness && /(1\.67|1,67|1\.74|1,74|high[\s-]?index|thin|lite|mr-8|mr8|mr-174)/.test(offerDescriptor)) {
    if (prescriptionStrength >= 1.5 && thinnessPriority > 0) {
      score += Number((2 + thinnessPriority * 2.5).toFixed(2))
      reasons.push('material:lente_fina')
    }
  }

  if (
    seeksThinness &&
    thinnessPriority >= 0.6 &&
    /(1\.50|1,50|1\.53|1,53|1\.56|1,56|1\.59|1,59|policarbonato|poly)/.test(offerDescriptor) &&
    !/(1\.67|1,67|1\.74|1,74)/.test(offerDescriptor)
  ) {
    score -= thinnessPriority >= 1 ? 1.5 : 0.75
  }

  if (
    seeksThinness &&
    thinnessPriority >= 0.6 &&
    prescriptionStrength >= 4.5 &&
    /(1\.50|1,50|orma)/.test(offerDescriptor) &&
    !/(1\.56|1,56|1\.59|1,59|1\.60|1,60|1\.67|1,67|1\.74|1,74|policarbonato|poly|trivex)/.test(offerDescriptor)
  ) {
    score -= 1.5
    reasons.push('material:orma_estetica_incompativel')
  }

  if (indexValue != null) {
    if (
      !highResistanceChildCase &&
      prescriptionStrength >= 6 &&
      thinnessPriority >= 0.8 &&
      indexValue >= 1.74
    ) {
      score += 2.5
      reasons.push('material:indice_174_grau_alto')
      if (targetPrice != null && Number.isFinite(finalPrice) && finalPrice <= targetPrice) {
        const valueBonus = finalPrice <= targetPrice * 0.7 ? 16 : 12
        score += valueBonus
        reasons.push('material:indice_174_custo_beneficio')
      }
    } else if (
      !highResistanceChildCase &&
      prescriptionStrength >= 6 &&
      thinnessPriority >= 0.8 &&
      indexValue >= 1.67
    ) {
      score += 1
      reasons.push('material:indice_167_grau_alto')
    }

    if (prescriptionStrength < 2) {
      if (indexValue >= 1.74) {
        score -= 8
        reasons.push('material:indice_alto_pouco_ganho')
      } else if (indexValue >= 1.67) {
        score -= 4
        reasons.push('material:indice_alto_pouco_ganho')
      }
    } else if (prescriptionStrength < 3) {
      if (indexValue >= 1.74) {
        score -= 5
        reasons.push('material:indice_alto_pouco_ganho')
      } else if (indexValue >= 1.67) {
        score -= 2.5
        reasons.push('material:indice_alto_pouco_ganho')
      }
    } else if (prescriptionStrength < 4) {
      if (indexValue >= 1.74) {
        score -= 2
        reasons.push('material:indice_alto_pouco_ganho')
      } else if (indexValue >= 1.67) {
        score -= 0.5
        reasons.push('material:indice_alto_pouco_ganho')
      }
    }

    if (!highResistanceChildCase && prescriptionStrength >= 4 && indexValue <= 1.56) {
      score -= 2
      reasons.push('material:indice_baixo_grau_alto')
    }

    if (!highResistanceChildCase && prescriptionStrength >= 6 && indexValue <= 1.59) {
      score -= thinnessPriority >= 0.8 ? 16 : 8
      reasons.push('material:indice_baixo_grau_alto')
    }

    if (
      !highResistanceChildCase &&
      prescriptionStrength >= 6 &&
      indexValue <= 1.59 &&
      thinnessPriority >= 0.6
    ) {
      score -= indexValue <= 1.56 ? 8 : 5
      reasons.push('material:indice_baixo_incompativel_estetica')
    }
  } else if (seeksThinness && prescriptionStrength >= 4.5) {
    score -= prescriptionStrength >= 6 && thinnessPriority >= 0.8 ? 10 : prescriptionStrength >= 6 ? 5 : 3
    reasons.push('material:indice_nao_informado_grau_alto')
  }

  if (
    /(esferic|sferic)/.test(offerDescriptor) &&
    prescriptionStrength >= 4.5 &&
    (desiredBenefits.includes('qualidade_optica') || desiredBenefits.includes('estetica'))
  ) {
    score -= prescriptionStrength >= 6 && thinnessPriority >= 0.8 ? 8 : prescriptionStrength >= 6 ? 3 : 2
    reasons.push('design:esferico_limitado_grau_alto')
  }

  if (
    wantsMiopiaControl &&
    (clinicalEvaluation.effectiveCategory === 'controle_miopia' ||
      offerDescriptor.includes('stellest') ||
      withoutAccents(family.nome.toLowerCase()).includes('stellest'))
  ) {
    score += isChildCase ? 16 : 6
    reasons.push('beneficio:controle_miopia')
  }

  if (wantsMiopiaControl && clinicalEvaluation.effectiveCategory !== 'controle_miopia') {
    score -= isChildCase ? 10 : 6
    reasons.push('beneficio:controle_miopia_nao_atendido')
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

  const budgetScore =
    isPediatricMyopiaControlCase && isMyopiaControlOption && budgetMode === 'economico'
      ? 0
      : scoreBudget(budgetMode, finalPrice, peerPrices)
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
  if (targetPrice != null) {
    if (targetScore > 0.5) reasons.push(`alvo_preco:${targetPrice}`)
    if (targetScore < -0.5 && finalPrice > targetPrice) reasons.push('alvo_preco:acima_alvo')
  }
  if (targetPrice != null && finalPrice > targetPrice) {
    const overTargetRatio = finalPrice / targetPrice
    const overTargetPenalty =
      budgetMode === 'economico'
        ? overTargetRatio > 1.1 ? 4 : 2
        : overTargetRatio > 1.5 ? 3 : overTargetRatio > 1.25 ? 1.5 : 0
    if (overTargetPenalty > 0) {
      score -= overTargetPenalty
      reasons.push('alvo_preco:acima_alvo_relevante')
    }
  }
  if (
    targetPrice != null &&
    objectiveTags.includes('orcamento_limita_solucao_ideal') &&
    finalPrice > targetPrice * 1.2
  ) {
    score -= 2
    reasons.push('alvo_preco:orcamento_limita_solucao_ideal')
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

  if ((input.rotina_tags || []).includes('dirigir_noite') && (name.includes('sapphire') || name.includes('rock') || name.includes('prevencia'))) {
    score += 1.5
    reasons.push('tratamento:dirigir_noite')
  }

  if ((input.rotina_tags || []).includes('sol') && name.includes('transitions')) {
    score += 1
    reasons.push('tratamento:outdoor')
  }

  return { score, reasons }
}

function scoreExternalAntireflexoPenalty(params: {
  offer: CatalogOffer
  treatment: CatalogTreatment | null
  input: RecommendationCaseInput
}): { score: number; reasons: string[] } {
  const { offer, treatment, input } = params
  const descriptor = withoutAccents(
    `${offer.raw_label} ${offer.canonical_label || ''} ${offer.material || ''}`.toLowerCase(),
  )
  const treatmentType = withoutAccents(String(treatment?.tipo || '').toLowerCase())
  const treatmentName = withoutAccents(String(treatment?.nome || '').toLowerCase())
  const isExternalAr =
    /\b(antirreflexo|anti[\s-]?reflexo|ar)\s+externo\b/.test(descriptor) ||
    /\bexterno\b/.test(descriptor) && /\b(antirreflexo|anti[\s-]?reflexo)\b/.test(descriptor)
  const isArTreatment =
    treatmentType.includes('antirreflexo') ||
    treatmentName.includes('sigma') ||
    treatmentName.includes('antirreflexo') ||
    /\b(antirreflexo|anti[\s-]?reflexo)\b/.test(descriptor)
  const highPrescription = getPrescriptionStrength(input) >= 4

  if (!isExternalAr || !isArTreatment) return { score: 0, reasons: [] }

  let penalty = -3
  const reasons = ['tratamento:ar_externo_limitado']

  if (input.budget_mode === 'premium' || (input.desired_benefits || []).includes('qualidade_optica')) {
    penalty -= 2
    reasons.push('tratamento:ar_externo_inadequado_premium')
  }

  if ((input.rotina_tags || []).includes('dirigir_noite')) {
    penalty -= 1.5
    reasons.push('tratamento:ar_externo_pior_dirigir_noite')
  }

  if ((input.objetivo_tags || []).includes('evitar_ar_externo')) {
    penalty -= 2
    reasons.push('tratamento:ar_externo_rejeitado_triagem')
  }

  if (highPrescription && (input.rotina_tags || []).includes('dirigir_noite')) {
    penalty -= 3.5
    reasons.push('tratamento:ar_externo_critico_grau_alto_noite')
  }

  return { score: penalty, reasons }
}

function scoreAntireflexoCompleteness(params: {
  offer: CatalogOffer
  treatment: CatalogTreatment | null
  embeddedTreatment: EmbeddedTreatmentInfo | null
  input: RecommendationCaseInput
}): { score: number; reasons: string[] } {
  const { offer, treatment, embeddedTreatment, input } = params
  const featureText = stringifyPositiveFeatureValues(offer.features)
  const descriptor = withoutAccents(
    `${offer.raw_label} ${offer.canonical_label || ''} ${offer.material || ''} ${featureText}`.toLowerCase(),
  )
  const treatmentName = withoutAccents(
    `${treatment?.nome || ''} ${treatment?.tipo || ''} ${embeddedTreatment?.name || ''} ${embeddedTreatment?.type || ''}`.toLowerCase(),
  )
  const text = `${descriptor} ${treatmentName}`
  const hasExternalAr =
    /\b(antirreflexo|anti[\s-]?reflexo|ar)\s+externo\b/.test(descriptor) ||
    /\bexterno\b/.test(descriptor) && /\b(antirreflexo|anti[\s-]?reflexo)\b/.test(descriptor)
  const wantsPremiumAr =
    (input.desired_benefits || []).includes('ar_premium') ||
    (input.objetivo_tags || []).includes('evitar_ar_externo') ||
    (input.rotina_tags || []).includes('dirigir_noite') ||
    (input.desired_benefits || []).includes('qualidade_optica')
  const highPrescription = getPrescriptionStrength(input) >= 4

  if (!wantsPremiumAr && !highPrescription) return { score: 0, reasons: [] }

  if (hasExternalAr) {
    const penalty =
      highPrescription && (input.rotina_tags || []).includes('dirigir_noite')
        ? -16
        : (input.rotina_tags || []).includes('dirigir_noite') ||
      (input.desired_benefits || []).includes('ar_premium')
        ? -6
        : -3
    return {
      score: penalty,
      reasons: ['tratamento:ar_externo_nao_equivale_ar_noite'],
    }
  }

  const hasAr =
    /\b(antirreflexo|anti[\s-]?reflexo)\b/.test(text) ||
    /(crizal|hi[\s-]?vision|hivision|longlife|meiryo|sigma|trio|vert clair|sapphire|rock|prevencia|easy pro|no[\s-]?risk|bluecontrol)/.test(text)
  const hasPremiumAr = /(sapphire|rock|prevencia|longlife|meiryo|hi[\s-]?vision longlife|hivision longlife)/.test(text)
  const hasBasicAr = hasAr && /(easy pro|trio|vert clair|hi[\s-]?vision hard|hivision hard|no[\s-]?risk|bluecontrol)/.test(text) && !hasPremiumAr

  if (!hasAr) {
    const highDigitalNeed =
      (input.rotina_tags || []).includes('computador') ||
      (input.rotina_tags || []).includes('celular') ||
      (input.desired_benefits || []).includes('conforto_digital')
    const penalty =
      (input.rotina_tags || []).includes('dirigir_noite') && highPrescription
        ? -16
        : highDigitalNeed && (input.desired_benefits || []).includes('ar_premium')
          ? -12
        : highDigitalNeed
          ? -8
        : (input.rotina_tags || []).includes('dirigir_noite') || highPrescription
          ? -7
          : -3
    return {
      score: penalty,
      reasons: ['tratamento:ar_ausente_critico'],
    }
  }

  const reasons: string[] = []
  let score = 0

  if ((input.rotina_tags || []).includes('dirigir_noite')) {
    if (hasPremiumAr) {
      score += 2.5
      reasons.push('tratamento:ar_premium_dirigir_noite')
    } else if (hasBasicAr && (input.desired_benefits || []).includes('ar_premium')) {
      score += 0.5
      reasons.push('tratamento:ar_basico_limitado_dirigir_noite')
    } else if (highPrescription && (input.desired_benefits || []).includes('ar_premium')) {
      score -= 3
      reasons.push('tratamento:ar_intermediario_limitado_dirigir_noite')
    } else {
      score += 1
      reasons.push('tratamento:ar_para_dirigir_noite')
    }
  }

  if (hasPremiumAr && (input.desired_benefits || []).includes('ar_premium')) {
    score += 2
    reasons.push('tratamento:ar_premium')
  }

  if (hasBasicAr && (input.desired_benefits || []).includes('ar_premium')) {
    score -= 1.25
    if (!(input.rotina_tags || []).includes('dirigir_noite')) {
      reasons.push('tratamento:ar_basico_limitado')
    }
  }

  return { score, reasons }
}

function hasMeaningfulAntireflexo(params: {
  offer: CatalogOffer
  treatment: CatalogTreatment | null
  embeddedTreatment: EmbeddedTreatmentInfo | null
}): boolean {
  const { offer, treatment, embeddedTreatment } = params
  const featureText = stringifyPositiveFeatureValues(offer.features)
  const text = withoutAccents(
    [
      offer.raw_label,
      offer.canonical_label,
      offer.material,
      featureText,
      treatment?.nome,
      treatment?.tipo,
      embeddedTreatment?.name,
      embeddedTreatment?.type,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  )
  const hasExternalAr =
    /\b(antirreflexo|anti[\s-]?reflexo|ar)\s+externo\b/.test(text) ||
    /\bexterno\b/.test(text) && /\b(antirreflexo|anti[\s-]?reflexo)\b/.test(text)

  if (hasExternalAr) return false

  return (
    /\b(antirreflexo|anti[\s-]?reflexo)\b/.test(text) ||
    /(crizal|hi[\s-]?vision|hivision|longlife|meiryo|sigma|trio|vert clair|sapphire|rock|prevencia|easy pro|no[\s-]?risk|bluecontrol|optifog)/.test(
      text,
    )
  )
}

function isAntiFatigueSupportOption(params: {
  family: CatalogFamily
  offer: CatalogOffer
  input: RecommendationCaseInput
  clinicalCategory: ClinicalCategory
}): boolean {
  const { family, offer, input, clinicalCategory } = params
  if (clinicalCategory !== 'visao_simples') return false
  if (input.adicao == null || input.adicao > MAX_ANTI_FATIGUE_ADDITION) return false

  const descriptor = withoutAccents(
    `${family.nome} ${offer.raw_label} ${offer.canonical_label || ''} ${offer.material || ''}`.toLowerCase(),
  )

  return /\b(eyezen boost|eyezen start|dynamic relax|sync iii|sync 3|visao simples digital|visao simples digital|anti[\s-]?fadiga|suporte acomodativo)\b/.test(
    descriptor,
  )
}

function scoreAntiFadigaAlternative(params: {
  family: CatalogFamily
  offer: CatalogOffer
  treatment: CatalogTreatment | null
  embeddedTreatment: EmbeddedTreatmentInfo | null
  input: RecommendationCaseInput
  clinicalCategory: ClinicalCategory
  finalPrice: number
  targetPrice?: number | null
  lensTier: CommercialTier
}): { score: number; reasons: string[] } {
  const {
    family,
    offer,
    treatment,
    embeddedTreatment,
    input,
    clinicalCategory,
    finalPrice,
    targetPrice,
    lensTier,
  } = params
  const objectiveTags = input.objetivo_tags || []
  const routineTags = input.rotina_tags || []
  const desiredBenefits = input.desired_benefits || []
  const firstMultifocal = objectiveTags.includes('primeira_multifocal')
  const highDigitalNeed =
    routineTags.includes('computador') ||
    routineTags.includes('celular') ||
    desiredBenefits.includes('conforto_digital')

  if (!firstMultifocal || !highDigitalNeed) return { score: 0, reasons: [] }
  if (
    !isAntiFatigueSupportOption({
      family,
      offer,
      input,
      clinicalCategory,
    })
  ) {
    return { score: 0, reasons: [] }
  }

  const hasAr = hasMeaningfulAntireflexo({ offer, treatment, embeddedTreatment })
  if (!hasAr) {
    return {
      score: -10,
      reasons: ['opcao:anti_fadiga_sem_ar_insuficiente'],
    }
  }

  const reasons = ['opcao:anti_fadiga_com_ar', 'tratamento:ar_anti_fadiga_digital']
  let score = 4

  if (targetPrice != null && Number.isFinite(finalPrice) && finalPrice <= targetPrice) {
    score += 1
    reasons.push('alvo_preco:anti_fadiga_dentro_alvo')
  }

  if (lensTier !== 'premium') {
    score += 1
    reasons.push('opcao:anti_fadiga_sem_lente_premium')
  }

  return { score, reasons }
}

function scoreRejectedFeatureConflicts(params: {
  offer: CatalogOffer
  treatment: CatalogTreatment | null
  embeddedTreatment: EmbeddedTreatmentInfo | null
  input: RecommendationCaseInput
  treatmentTier: CommercialTier
  finalPrice: number
  targetPrice?: number | null
}): { score: number; reasons: string[] } {
  const { offer, treatment, embeddedTreatment, input, treatmentTier, finalPrice, targetPrice } = params
  const rejectedFeatures = input.rejected_features || []
  const objectiveTags = input.objetivo_tags || []
  const descriptor = withoutAccents(
    `${offer.raw_label} ${offer.canonical_label || ''} ${treatment?.nome || ''} ${embeddedTreatment?.name || ''}`.toLowerCase(),
  )
  const semantic = treatment ? getTreatmentSemanticProfile(treatment) : null
  const embeddedBenefits = embeddedTreatment?.semantic.benefit_tags || []
  const semanticBenefits = semantic?.benefit_tags || []
  const budgetMode = normalizeBudgetMode(input.budget_mode)
  const priceStrict =
    budgetMode === 'economico' ||
    objectiveTags.includes('orcamento_limita_solucao_ideal') ||
    (targetPrice != null && finalPrice > targetPrice)
  const hasStrongPremiumArNeed =
    (input.rotina_tags || []).includes('dirigir_noite') ||
    (input.desired_benefits || []).includes('ar_premium')

  let score = 0
  const reasons: string[] = []

  if (rejectedFeatures.includes('blue_uv')) {
    const blueUvIsCentral =
      descriptor.includes('prevencia') ||
      descriptor.includes('bluecontrol') ||
      descriptor.includes('blue uv') ||
      descriptor.includes('blueuv') ||
      semanticBenefits.some((benefit) => benefit.includes('azul') || benefit.includes('blue')) ||
      embeddedBenefits.some((benefit) => benefit.includes('azul') || benefit.includes('blue'))

    if (blueUvIsCentral) {
      score -= priceStrict ? 6 : 3
      reasons.push('feature:blue_uv_rejeitado')
    }
  }

  if (
    rejectsPremiumPreference(input) &&
    treatmentTier === 'premium' &&
    budgetMode === 'economico' &&
    !hasStrongPremiumArNeed
  ) {
    score -= priceStrict ? 10 : 6
    reasons.push('tratamento:premium_rejeitado_orcamento')
  }

  return { score, reasons }
}

function scoreTreatmentFeatureFulfillment(params: {
  treatment: CatalogTreatment | null
  embeddedTreatment: EmbeddedTreatmentInfo | null
  input: RecommendationCaseInput
  offerReasons: string[]
}): { score: number; reasons: string[]; suppressReasons: string[] } {
  const { treatment, embeddedTreatment, input, offerReasons } = params
  const preferredFeatures = input.preferred_features || []
  const treatmentDescriptor = withoutAccents(
    `${treatment?.nome || ''} ${embeddedTreatment?.name || ''}`.toLowerCase(),
  )
  const semantic = treatment ? getTreatmentSemanticProfile(treatment) : null
  const benefitTags = [
    ...(semantic?.benefit_tags || []),
    ...(embeddedTreatment?.semantic.benefit_tags || []),
  ]
  const fulfillsBlueUv =
    treatmentDescriptor.includes('prevencia') ||
    treatmentDescriptor.includes('bluecontrol') ||
    treatmentDescriptor.includes('blue uv') ||
    treatmentDescriptor.includes('blueuv') ||
    benefitTags.some((benefit) => benefit.includes('azul') || benefit.includes('blue'))

  let score = 0
  const reasons: string[] = []
  const suppressReasons: string[] = []

  if (
    preferredFeatures.includes('blue_uv') &&
    fulfillsBlueUv &&
    offerReasons.includes('feature:ausente_blue_uv')
  ) {
    const hadPriorityPenalty =
      offerReasons.includes('feature:ausente_blue_uv_prioritario') ||
      offerReasons.includes('feature:ausente_blue_uv_pediatrico')
    const hadSecondaryPenalty = offerReasons.includes('feature:blue_uv_secundario_triagem')
    score += hadPriorityPenalty ? 12 : hadSecondaryPenalty ? 5 : 8
    reasons.push('feature:blue_uv')
    suppressReasons.push(
      'feature:ausente_blue_uv',
      'feature:ausente_blue_uv_prioritario',
      'feature:ausente_blue_uv_pediatrico',
      'feature:blue_uv_secundario_triagem',
    )
  }

  return { score, reasons, suppressReasons }
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

function normalizeProductSemanticName(entry: RecommendationOption): string {
  const descriptor = withoutAccents(
    `${entry.familyName} ${entry.offerLabel} ${entry.treatmentName || ''}`.toLowerCase(),
  )

  if (descriptor.includes('stellest')) return 'stellest'
  if (descriptor.includes('miokids') || descriptor.includes('mio kids')) return 'miokids'
  if (descriptor.includes('eyezen kids')) return 'eyezen kids'

  return normalizeFamilyName(entry.familyName)
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
  const selectedProductNames = new Set<string>() // cross-catalog dedupe by actual product
  const primaryCategory = entries[0]?.clinicalCategory
  const shouldDiversifyLabs = primaryCategory === 'multifocal' || primaryCategory === 'ocupacional'

  const trySelect = (entry: RecommendationOption) => {
    if (selected.length >= topN) return
    if (selectedConfigKeys.has(entry.configKey)) return
    selected.push(entry)
    selectedConfigKeys.add(entry.configKey)
    selectedFamilies.add(entry.familyId)
    selectedOffers.add(entry.offerId)
    if (entry.sourceLaboratorio) selectedLabs.add(entry.sourceLaboratorio)
    selectedFamilyNames.add(normalizeFamilyName(entry.familyName))
    selectedProductNames.add(normalizeProductSemanticName(entry))
  }

  // Pass 1: best entry per unique lab, only for categories where lab diversity is commercially useful.
  if (shouldDiversifyLabs) {
    for (const entry of entries) {
      if (selected.length >= topN) break
      const lab = entry.sourceLaboratorio
      const nameNorm = normalizeFamilyName(entry.familyName)
      const productNorm = normalizeProductSemanticName(entry)
      if (lab && !selectedLabs.has(lab) && !selectedFamilyNames.has(nameNorm) && !selectedProductNames.has(productNorm)) {
        trySelect(entry)
      }
    }
  }

  // Pass 2: fill remaining — different product name (any lab)
  for (const entry of entries) {
    if (selected.length >= topN) break
    if (
      !selectedFamilyNames.has(normalizeFamilyName(entry.familyName)) &&
      !selectedProductNames.has(normalizeProductSemanticName(entry))
    ) {
      trySelect(entry)
    }
  }

  // Pass 3: fill remaining — different family id
  for (const entry of entries) {
    if (selected.length >= topN) break
    if (
      !selectedFamilies.has(entry.familyId) &&
      !selectedProductNames.has(normalizeProductSemanticName(entry))
    ) {
      trySelect(entry)
    }
  }

  // Pass 4: fill any remaining slots
  for (const entry of entries) {
    if (selected.length >= topN) break
    if (!selectedProductNames.has(normalizeProductSemanticName(entry))) {
      trySelect(entry)
    }
  }

  return selected
    .slice(0, topN)
    .sort((a, b) => b.score - a.score || a.finalPrice - b.finalPrice)
}

function applyHeatmapCompatibility(
  entries: RecommendationOption[],
  samples: PersistedHeatmapSample[],
  geometries: LensGeometry[],
): RecommendationOption[] {
  return entries
    .map((entry) => {
      if (entry.clinicalCategory !== 'multifocal') return entry
      const compatibility = evaluateHeatmapGeometryCompatibility(
        samples,
        findGeometryForRecommendation(entry.familyName, geometries),
      )
      return {
        ...entry,
        score: entry.score + compatibility.scoreAdjustment,
        reasons: [...entry.reasons, `heatmap:${compatibility.status}`],
        heatmapCompatibility: compatibility,
      }
    })
    .filter((entry) => entry.heatmapCompatibility?.status !== 'nao_indicada')
    .sort((a, b) => b.score - a.score || a.finalPrice - b.finalPrice)
}

type CurrentLensBenchmark = {
  name: string
  tier: CommercialTier
}

function commercialTierRank(tier: CommercialTier): number {
  if (tier === 'entrada') return 1
  if (tier === 'premium') return 3
  return 2
}

function resolveCurrentLensBenchmark(
  input: RecommendationCaseInput,
  catalog: RecommendationCatalog,
): CurrentLensBenchmark | null {
  const raw = input.marca_atual?.trim()
  if (!raw) return null
  const normalizedRaw = normalizeIntentText(raw)
  if (normalizedRaw.length < 5) return null

  const catalogMatch = catalog.families
    .filter((family) => {
      const normalizedFamily = normalizeIntentText(family.nome)
      return normalizedFamily.length >= 5 &&
        (normalizedRaw.includes(normalizedFamily) || normalizedFamily.includes(normalizedRaw))
    })
    .sort((left, right) => right.nome.length - left.nome.length)[0]

  if (catalogMatch) {
    const offer = catalog.offers.find((item) => item.family_id === catalogMatch.id)
    return {
      name: catalogMatch.nome,
      tier: offer ? resolveLensTier(catalogMatch, offer) : normalizeCommercialTier(getSharedFamilySemanticProfile(catalogMatch.nome)?.positioning),
    }
  }

  const semanticMatch = getSharedFamilySemanticProfile(raw)
  if (!semanticMatch) return null
  return {
    name: semanticMatch.entity_name,
    tier: normalizeCommercialTier(semanticMatch.positioning),
  }
}

function applyCurrentLensUpgradePreference(
  entries: RecommendationOption[],
  input: RecommendationCaseInput,
  catalog: RecommendationCatalog,
): RecommendationOption[] {
  const benchmark = resolveCurrentLensBenchmark(input, catalog)
  if (!benchmark) return entries

  const economyRequested =
    input.budget_mode === 'economico' ||
    (input.objetivo_tags || []).some((tag) => ['custo_beneficio', 'economia', 'premium_recusado'].includes(tag)) ||
    (input.rejected_features || []).includes('premium')
  const benchmarkRank = commercialTierRank(benchmark.tier)
  const adjusted = entries.map((entry) => {
    const tierReason = entry.reasons.find((reason) => reason.startsWith('lens_tier:'))
    const candidateTier = normalizeCommercialTier(tierReason?.split(':')[1])
    const candidateRank = commercialTierRank(candidateTier)
    const sameFamily = normalizeIntentText(entry.familyName) === normalizeIntentText(benchmark.name)
    const adjustment = candidateRank > benchmarkRank
      ? (candidateRank - benchmarkRank) * 12
      : candidateRank < benchmarkRank
        ? -40
        : sameFamily ? -4 : 2

    return {
      ...entry,
      score: Number((entry.score + adjustment).toFixed(2)),
      reasons: uniqueStrings([
        ...entry.reasons,
        candidateRank > benchmarkRank
          ? `upgrade_lente_atual:acima:${benchmark.name}`
          : candidateRank < benchmarkRank
            ? `upgrade_lente_atual:abaixo:${benchmark.name}`
            : sameFamily
              ? `upgrade_lente_atual:mesma_familia:${benchmark.name}`
              : `upgrade_lente_atual:mesmo_nivel:${benchmark.name}`,
      ]),
    }
  })

  const sameOrHigher = adjusted.filter((entry) => {
    const tierReason = entry.reasons.find((reason) => reason.startsWith('lens_tier:'))
    return commercialTierRank(normalizeCommercialTier(tierReason?.split(':')[1])) >= benchmarkRank
  })
  const explicitBudgetRequiresDowngrade = input.targetPrice != null && input.targetPrice > 0 && !sameOrHigher.some((entry) => entry.finalPrice <= input.targetPrice!)
  if (economyRequested || explicitBudgetRequiresDowngrade) {
    return adjusted.sort((left, right) => right.score - left.score || left.finalPrice - right.finalPrice)
  }
  const pool = sameOrHigher.length ? sameOrHigher : adjusted
  return pool.sort((left, right) => right.score - left.score || left.finalPrice - right.finalPrice)
}

function isUnsafeTopRecommendation(
  input: RecommendationCaseInput,
  entry: RecommendationOption,
): boolean {
  const reasons = entry.reasons || []
  const highDigitalNeed =
    (input.rotina_tags || []).includes('computador') ||
    (input.rotina_tags || []).includes('celular') ||
    (input.desired_benefits || []).includes('conforto_digital')
  const firstMultifocal = (input.objetivo_tags || []).includes('primeira_multifocal')
  const highPrescriptionNightArNeed =
    getPrescriptionStrength(input) >= 4 &&
    (input.rotina_tags || []).includes('dirigir_noite') &&
    (input.desired_benefits || []).includes('ar_premium')
  const highPrescriptionThinLensNeed =
    getPrescriptionStrength(input) >= 4.5 &&
    ((input.desired_benefits || []).includes('lente_fina') ||
      (input.desired_benefits || []).includes('estetica') ||
      wantsThinLens(input))
  const transitionsExplicitlySecondary =
    (input.objetivo_tags || []).includes('transitions_secundario') && !hasPrimarySunDemand(input)
  const primaryTransitionsNeed =
    (input.preferred_features || []).includes('transitions') &&
    !transitionsExplicitlySecondary &&
    (normalizeBudgetMode(input.budget_mode) === 'premium' ||
      (input.rotina_tags || []).includes('sol') ||
      (input.desired_benefits || []).includes('conforto_luz') ||
      hasPrimarySunDemand(input))

  if (rejectsPremiumPreference(input) && reasons.includes('lens_tier:premium')) return true
  if (reasons.includes('tratamento:ar_ausente_critico') && highDigitalNeed) return true
  if (reasons.includes('tratamento:ar_externo_nao_equivale_ar_noite') && highDigitalNeed) return true
  if (primaryTransitionsNeed && reasons.includes('feature:ausente_transitions_prioritario')) return true
  if (
    reasons.includes('tratamento:ar_intermediario_limitado_dirigir_noite') &&
    highPrescriptionNightArNeed
  ) {
    return true
  }
  if (
    highPrescriptionThinLensNeed &&
    entry.clinicalCategory !== 'controle_miopia' &&
    (reasons.includes('material:indice_nao_informado_grau_alto') ||
      reasons.includes('design:esferico_limitado_grau_alto') ||
      reasons.includes('material:indice_baixo_grau_alto') ||
      reasons.includes('material:indice_baixo_incompativel_estetica'))
  ) {
    return true
  }
  if (
    firstMultifocal &&
    input.adicao != null &&
    input.adicao >= 1 &&
    entry.clinicalCategory === 'visao_simples' &&
    reasons.includes('tratamento:ar_ausente_critico')
  ) {
    return true
  }

  return false
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

      const normalizedFamily = normalizeIntentText(`${family.nome} ${offer.raw_label}`)
      if ((input.rejected_brands || []).some((brand) => normalizedFamily.includes(normalizeIntentText(brand)))) return null
      const lab = normalizeIntentText(family.sourceLaboratorio || offer.sourceLaboratorio || '')
      if ((input.rejected_labs || []).some((rejectedLab) => lab.includes(normalizeIntentText(rejectedLab)))) return null
      const semantic = getSharedFamilySemanticProfile(family.nome)
      const antiFatigueDescriptor = normalizeIntentText(`${normalizedFamily} ${(semantic?.usage_tags || []).join(' ')} ${(semantic?.benefit_tags || []).join(' ')}`)
      const isAntiFatigue = /(antifad|anti fad|eyezen|sync|relax|boost)/.test(antiFatigueDescriptor)
      const wantsAntiFatigue = (input.objetivo_tags || []).includes('antifadiga')
      if (wantsAntiFatigue !== isAntiFatigue && (wantsAntiFatigue || isAntiFatigue)) return null

      const clinicalEvaluation = evaluateClinicalEligibility(
        input,
        family,
        offer,
        usageProfileByFamilyId.get(offer.family_id) || null,
        forcedClinicalCategories,
      )
      if (!clinicalEvaluation.eligible) return null

      const offerGrids = gridsByOfferId.get(offer.id) || []
      if (!matchesGrid(input, offerGrids, clinicalEvaluation.effectiveCategory)) return null

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

      // Solar/polarized lenses are secondary for daily-use cases, but valid when the
      // customer explicitly asks for prescription sunglasses or strong outdoor comfort.
      {
        const offerDescriptorForSolar = withoutAccents(
          `${family.nome} ${offer.raw_label} ${offer.canonical_label || ''}`.toLowerCase()
        )
        const offerFeaturesForSolar = normalizeFeatureFlags(offer.features)
        const isSolarOffer =
          offerFeaturesForSolar.solar === true ||
          offerFeaturesForSolar.polarizado === true ||
          /\b(solar|polarizado)\b/.test(offerDescriptorForSolar)
        if (isSolarOffer && !acceptsDedicatedSolarAlternative(input)) return null
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
    const compatRowsRaw = compatibilitiesByOfferId.get(entry.offer.id) || []
    const hasNamedTreatment = compatRowsRaw.some((row) => row.treatment_id != null)
    const compatRows = hasNamedTreatment
      ? compatRowsRaw.filter((row) => row.treatment_id != null)
      : compatRowsRaw
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
    const rejected = input.rejected_features || []
    if (rejected.length > 0) {
      const embedded = resolveEmbeddedTreatment(entry.offer, input)
      const descriptor = normalizeIntentText(`${entry.treatment?.nome || ''} ${entry.treatment?.tipo || ''} ${embedded?.name || ''} ${embedded?.type || ''}`)
      const treatmentFlags = normalizeFeatureFlags(entry.treatment?.features || {})
      if (rejected.includes('transitions') && (/(transition|fotossens|photochrom|sensity|photofusion)/.test(descriptor) || treatmentFlags.transitions)) return false
      if (rejected.includes('blue_uv') && (/(blue|azul|screen|digital)/.test(descriptor) || treatmentFlags.blue_uv)) return false
      if (rejected.includes('antirreflexo') && (/(antirreflex|anti reflex|\bar\b)/.test(descriptor) || treatmentFlags.antirreflexo)) return false
    }
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
    const externalArScoring = scoreExternalAntireflexoPenalty({
      offer: entry.offer,
      treatment: entry.treatment,
      input,
    })
    const embeddedTreatment = resolveEmbeddedTreatment(entry.offer, input)
    const arCompletenessScoring = scoreAntireflexoCompleteness({
      offer: entry.offer,
      treatment: entry.treatment,
      embeddedTreatment,
      input,
    })
    const embeddedScoring = scoreEmbeddedTreatment({
      embedded: embeddedTreatment,
      input,
    })
    const lensTier = resolveLensTier(entry.family, entry.offer)
    const treatmentTier = resolveTreatmentTier(entry.treatment, embeddedTreatment)
    const antiFadigaScoring = scoreAntiFadigaAlternative({
      family: entry.family,
      offer: entry.offer,
      treatment: entry.treatment,
      embeddedTreatment,
      input,
      clinicalCategory: entry.clinicalEvaluation.effectiveCategory,
      finalPrice: entry.finalPrice,
      targetPrice,
      lensTier,
    })
    const rejectedFeatureScoring = scoreRejectedFeatureConflicts({
      offer: entry.offer,
      treatment: entry.treatment,
      embeddedTreatment,
      input,
      treatmentTier,
      finalPrice: entry.finalPrice,
      targetPrice,
    })
    const treatmentFeatureScoring = scoreTreatmentFeatureFulfillment({
      treatment: entry.treatment,
      embeddedTreatment,
      input,
      offerReasons: offerScoring.reasons,
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
        externalArScoring.score +
        arCompletenessScoring.score +
        embeddedScoring.score +
        antiFadigaScoring.score +
        rejectedFeatureScoring.score +
        treatmentFeatureScoring.score +
        labBonus +
        brandBonus +
        profileScoring.score
      ).toFixed(2),
    )
    const violatesPremiumRejection = lensTier === 'premium'
    const premiumRejectionPenalty =
      rejectsPremiumPreference(input) && violatesPremiumRejection
        ? targetPrice != null && entry.finalPrice > targetPrice
          ? -22
          : -16
        : 0
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
        ...externalArScoring.reasons,
        ...arCompletenessScoring.reasons,
        ...embeddedScoring.reasons,
        ...antiFadigaScoring.reasons,
        ...rejectedFeatureScoring.reasons,
        ...treatmentFeatureScoring.reasons,
        ...labReasons,
        ...brandReasons,
        ...profileScoring.reasons,
        `lens_tier:${lensTier}`,
        `treatment_tier:${treatmentTier}`,
        ...(premiumRejectionPenalty < 0 ? ['orcamento:premium_recusado'] : []),
      ]).filter((reason) => {
        if (treatmentFeatureScoring.suppressReasons.includes(reason)) return false
        if (premiumRejectionPenalty < 0 && reason === 'orcamento:economico') return false
        return true
      }),
      score: Number((totalScore + premiumRejectionPenalty).toFixed(2)),
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
  // The generated Supabase types do not include the global catalog tables yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAdmin = createAdminClient() as any
  type CatalogRangeQuery<T> = {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
  }
  const fetchAllCatalogRows = async <T,>(buildQuery: () => CatalogRangeQuery<T>): Promise<T[]> => {
    const pageSize = 1000
    const rows: T[] = []

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await buildQuery().range(from, from + pageSize - 1)
      if (error) throw error

      const page = (data || []) as T[]
      rows.push(...page)
      if (page.length < pageSize) break
    }

    return rows
  }
  const fetchAllCatalogRowsInChunks = async <T,>(
    values: string[],
    buildQuery: (chunk: string[]) => CatalogRangeQuery<T>,
  ): Promise<T[]> => {
    const chunkSize = 150
    const rows: T[] = []

    for (let index = 0; index < values.length; index += chunkSize) {
      const chunk = values.slice(index, index + chunkSize)
      rows.push(...await fetchAllCatalogRows<T>(() => buildQuery(chunk)))
    }

    return rows
  }

  const { data: versionMeta, error: versionMetaError } = await supabaseAdmin
    .from('global_catalog_versions')
    .select('id,laboratorio,versao')
    .eq('id', versionId)
    .single()

  if (versionMetaError) throw versionMetaError

  const families = await fetchAllCatalogRows<Record<string, unknown>>(() =>
    supabaseAdmin
      .from('global_lens_families')
      .select('id,nome,design,tags_uso,tags_beneficios,clinical_category')
      .eq('version_id', versionId)
  )

  const familyIds = families.map((family) => String(family.id))

  const offers = familyIds.length
    ? await fetchAllCatalogRowsInChunks<Record<string, unknown>>(familyIds, (chunk) =>
      supabaseAdmin
      .from('global_lens_offers')
      .select('id,family_id,raw_label,canonical_label,material,clinical_category,features,base_price,is_atomic_offer,already_includes_treatment,allows_composition,source_page_reference')
      .in('family_id', chunk)
    )
    : []

  const offerIds = offers.map((offer) => String(offer.id))

  const [grids, usageProfiles, compatibilities, treatments] = await Promise.all([
    offerIds.length
      ? fetchAllCatalogRowsInChunks<Record<string, unknown>>(offerIds, (chunk) =>
        supabaseAdmin
          .from('global_offer_diopter_grids')
          .select('offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max')
          .in('offer_id', chunk)
      )
      : Promise.resolve([]),
    familyIds.length
      ? fetchAllCatalogRowsInChunks<Record<string, unknown>>(familyIds, (chunk) =>
        supabaseAdmin
          .from('global_usage_profiles')
          .select('family_id,usage_tags,benefit_tags,commercial_summary,recommendation_notes')
          .eq('profile_scope', 'family')
          .in('family_id', chunk)
      )
      : Promise.resolve([]),
    offerIds.length
      ? fetchAllCatalogRowsInChunks<Record<string, unknown>>(offerIds, (chunk) =>
        supabaseAdmin
          .from('global_offer_treatments_compatibility')
          .select('offer_id,treatment_id,special_price,price_mode')
          .in('offer_id', chunk)
      )
      : Promise.resolve([]),
    fetchAllCatalogRows<Record<string, unknown>>(() =>
      supabaseAdmin
        .from('global_treatments')
        .select('id,nome,tipo,features')
        .eq('version_id', versionId)
    ),
  ])

  return {
    families: families.map((family: Record<string, unknown>) => ({
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
    offers: offers.map((offer: Record<string, unknown>) => ({
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
    grids: grids.map((grid: Record<string, unknown>) => ({
      offer_id: String(grid.offer_id),
      sph_min: normalizeNumber(grid.sph_min),
      sph_max: normalizeNumber(grid.sph_max),
      cyl_min: normalizeNumber(grid.cyl_min),
      cyl_max: normalizeNumber(grid.cyl_max),
      add_min: normalizeNumber(grid.add_min),
      add_max: normalizeNumber(grid.add_max),
    })),
    usageProfiles: usageProfiles.map((profile: Record<string, unknown>) => ({
      family_id: String(profile.family_id),
      usage_tags: normalizeStringArray(profile.usage_tags),
      benefit_tags: normalizeStringArray(profile.benefit_tags),
      commercial_summary: profile.commercial_summary ? String(profile.commercial_summary) : null,
      recommendation_notes: profile.recommendation_notes ? String(profile.recommendation_notes) : null,
    })),
    compatibilities: compatibilities.map((compatibility: Record<string, unknown>) => ({
      offer_id: String(compatibility.offer_id),
      treatment_id: String(compatibility.treatment_id),
      special_price: normalizeNumber(compatibility.special_price),
      price_mode: compatibility.price_mode === 'surcharge' ? 'surcharge' : 'final',
    })),
    treatments: treatments.map((treatment: Record<string, unknown>) => ({
      id: String(treatment.id),
      nome: String(treatment.nome || ''),
      tipo: treatment.tipo ? String(treatment.tipo) : null,
      features: toFeatureRecord(treatment.features),
    })),
  }
}

export async function loadRecommendationCatalogMulti(versionIds: string[]): Promise<RecommendationCatalog> {
  const uniqueIds = uniqueValues(versionIds.filter(Boolean))
  if (uniqueIds.length <= 1) {
    return loadRecommendationCatalog(uniqueIds[0])
  }

  // The generated Supabase types do not include the global catalog tables yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAdmin = createAdminClient() as any
  type CatalogRangeQuery<T> = {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
  }
  const fetchAllCatalogRows = async <T,>(buildQuery: () => CatalogRangeQuery<T>): Promise<T[]> => {
    const pageSize = 1000
    const rows: T[] = []

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await buildQuery().range(from, from + pageSize - 1)
      if (error) throw error

      const page = (data || []) as T[]
      rows.push(...page)
      if (page.length < pageSize) break
    }

    return rows
  }
  const fetchAllCatalogRowsInChunks = async <T,>(
    values: string[],
    buildQuery: (chunk: string[]) => CatalogRangeQuery<T>,
  ): Promise<T[]> => {
    const chunkSize = 150
    const rows: T[] = []

    for (let index = 0; index < values.length; index += chunkSize) {
      const chunk = values.slice(index, index + chunkSize)
      rows.push(...await fetchAllCatalogRows<T>(() => buildQuery(chunk)))
    }

    return rows
  }

  const versions = await fetchAllCatalogRows<Record<string, unknown>>(() =>
    supabaseAdmin
      .from('global_catalog_versions')
      .select('id,laboratorio,versao')
      .in('id', uniqueIds)
  )
  const versionById = new Map(versions.map((version) => [String(version.id), version]))

  const families = await fetchAllCatalogRowsInChunks<Record<string, unknown>>(uniqueIds, (chunk) =>
    supabaseAdmin
      .from('global_lens_families')
      .select('id,version_id,nome,design,tags_uso,tags_beneficios,clinical_category')
      .in('version_id', chunk)
  )

  const familyIds = families.map((family) => String(family.id))
  const offers = familyIds.length
    ? await fetchAllCatalogRowsInChunks<Record<string, unknown>>(familyIds, (chunk) =>
      supabaseAdmin
        .from('global_lens_offers')
        .select('id,family_id,raw_label,canonical_label,material,clinical_category,features,base_price,is_atomic_offer,already_includes_treatment,allows_composition,source_page_reference')
        .in('family_id', chunk)
    )
    : []
  const offerIds = offers.map((offer) => String(offer.id))

  const [grids, usageProfiles, compatibilities, treatments] = await Promise.all([
    offerIds.length
      ? fetchAllCatalogRowsInChunks<Record<string, unknown>>(offerIds, (chunk) =>
        supabaseAdmin
          .from('global_offer_diopter_grids')
          .select('offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max')
          .in('offer_id', chunk)
      )
      : Promise.resolve([]),
    familyIds.length
      ? fetchAllCatalogRowsInChunks<Record<string, unknown>>(familyIds, (chunk) =>
        supabaseAdmin
          .from('global_usage_profiles')
          .select('family_id,usage_tags,benefit_tags,commercial_summary,recommendation_notes')
          .eq('profile_scope', 'family')
          .in('family_id', chunk)
      )
      : Promise.resolve([]),
    offerIds.length
      ? fetchAllCatalogRowsInChunks<Record<string, unknown>>(offerIds, (chunk) =>
        supabaseAdmin
          .from('global_offer_treatments_compatibility')
          .select('offer_id,treatment_id,special_price,price_mode')
          .in('offer_id', chunk)
      )
      : Promise.resolve([]),
    fetchAllCatalogRowsInChunks<Record<string, unknown>>(uniqueIds, (chunk) =>
      supabaseAdmin
        .from('global_treatments')
        .select('id,version_id,nome,tipo,features')
        .in('version_id', chunk)
    ),
  ])

  const familyById = new Map(families.map((family) => [String(family.id), family]))

  return {
    families: families.map((family) => {
      const versionMeta = versionById.get(String(family.version_id))
      return {
        id: String(family.id),
        nome: String(family.nome || ''),
        design: family.design ? String(family.design) : null,
        tags_uso: normalizeStringArray(family.tags_uso),
        tags_beneficios: normalizeStringArray(family.tags_beneficios),
        clinical_category: normalizeCategory(family.clinical_category),
        sourceLaboratorio: versionMeta?.laboratorio ? String(versionMeta.laboratorio) : null,
        sourceVersao: versionMeta?.versao ? String(versionMeta.versao) : null,
        sourceVersionId: versionMeta?.id ? String(versionMeta.id) : null,
      }
    }),
    offers: offers.map((offer) => {
      const family = familyById.get(String(offer.family_id))
      const versionMeta = family ? versionById.get(String(family.version_id)) : null
      return {
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
      }
    }),
    grids: grids.map((grid) => ({
      offer_id: String(grid.offer_id),
      sph_min: normalizeNumber(grid.sph_min),
      sph_max: normalizeNumber(grid.sph_max),
      cyl_min: normalizeNumber(grid.cyl_min),
      cyl_max: normalizeNumber(grid.cyl_max),
      add_min: normalizeNumber(grid.add_min),
      add_max: normalizeNumber(grid.add_max),
    })),
    usageProfiles: usageProfiles.map((profile) => ({
      family_id: String(profile.family_id),
      usage_tags: normalizeStringArray(profile.usage_tags),
      benefit_tags: normalizeStringArray(profile.benefit_tags),
      commercial_summary: profile.commercial_summary ? String(profile.commercial_summary) : null,
      recommendation_notes: profile.recommendation_notes ? String(profile.recommendation_notes) : null,
    })),
    compatibilities: compatibilities.map((compatibility) => ({
      offer_id: String(compatibility.offer_id),
      treatment_id: String(compatibility.treatment_id),
      special_price: normalizeNumber(compatibility.special_price),
      price_mode: compatibility.price_mode === 'surcharge' ? 'surcharge' : 'final',
    })),
    treatments: treatments.map((treatment) => {
      const versionMeta = versionById.get(String(treatment.version_id))
      return {
        id: String(treatment.id),
        nome: String(treatment.nome || ''),
        tipo: treatment.tipo ? String(treatment.tipo) : null,
        features: toFeatureRecord(treatment.features),
        sourceLaboratorio: versionMeta?.laboratorio ? String(versionMeta.laboratorio) : null,
        sourceVersao: versionMeta?.versao ? String(versionMeta.versao) : null,
        sourceVersionId: versionMeta?.id ? String(versionMeta.id) : null,
      }
    }),
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
  if (strictCategories.length === 0) return []
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
  }).filter((entry) => !isUnsafeTopRecommendation(input, entry))

  const upgradeAwareRanked = applyCurrentLensUpgradePreference(strictRanked, input, catalog)
  const sameCategory = upgradeAwareRanked.filter((option) => option.clinicalCategory === strictCategories[0])
  if (topN !== 3) return selectDiverseTopEntries(sameCategory, topN)

  const valid = sameCategory.filter((option) => Number.isFinite(option.finalPrice))
  if (valid.length === 0) return []
  const topScore = Math.max(...valid.map((option) => option.score))
  const strong = valid.filter((option) => option.score >= topScore - 12)
  const budget = input.targetPrice ?? targetPrice ?? null
  const withinBudget = budget == null ? strong : strong.filter((option) => option.finalPrice <= budget)
  const affordablePool = withinBudget.length > 0 ? withinBudget : strong
  const good = [...affordablePool].sort((a, b) => a.finalPrice - b.finalPrice || b.score - a.score)[0]
  const better = [...affordablePool].sort((a, b) => b.score - a.score || a.finalPrice - b.finalPrice).find((option) => option.configKey !== good?.configKey)
  const ideal = [...valid].sort((a, b) => b.score - a.score || b.finalPrice - a.finalPrice).find((option) => option.configKey !== good?.configKey && option.configKey !== better?.configKey)
  return [good, better, ideal].filter((option): option is RecommendationOption => !!option).map((option, index) => ({
    ...option,
    presentationLabel: (['Opção 1', 'Opção 2', 'Opção 3'] as const)[index],
    budgetDelta: budget != null && option.finalPrice > budget ? option.finalPrice - budget : null,
    presentationRank: index + 1,
  }))
}

function getStorePreferenceSnapshot(option: RecommendationOption): { lab: number; brand: number } {
  let lab = 3
  let brand = 3

  for (const reason of option.reasons) {
    const labMatch = reason.match(/^preferencia_lab:(\d+)$/)
    if (labMatch) lab = Number(labMatch[1])

    const brandMatch = reason.match(/^preferencia_marca:.+:(\d+)$/)
    if (brandMatch) brand = Number(brandMatch[1])
  }

  return { lab, brand }
}

function getStorePreferencePresentationReason(
  first: RecommendationOption,
  second: RecommendationOption,
): string | null {
  const firstPreference = getStorePreferenceSnapshot(first)
  const secondPreference = getStorePreferenceSnapshot(second)
  const firstHasStrongPreference = firstPreference.lab >= 5 || firstPreference.brand >= 5
  if (!firstHasStrongPreference) return null

  if (firstPreference.lab > secondPreference.lab) {
    return `preferencia_lab:${firstPreference.lab}>${secondPreference.lab}`
  }
  if (firstPreference.brand > secondPreference.brand) {
    return `preferencia_marca:${firstPreference.brand}>${secondPreference.brand}`
  }

  return null
}

function applyRecommendationPresentationStrategy(
  recommendations: RecommendationOption[],
): {
  recommendations: RecommendationOption[]
  presentationStrategy: RecommendationPresentationStrategy
} {
  const labelForIndex = (index: number): NonNullable<RecommendationOption['presentationLabel']> =>
    (['Opção 1', 'Opção 2', 'Opção 3'] as const)[index] || 'Opção 3'
  const roleForIndex = (index: number): NonNullable<RecommendationOption['commercialRole']> =>
    index === 0 ? 'anchor' : index === 1 ? 'target' : 'alternative'
  const ranked = recommendations.map((option, index) => ({
    ...option,
    originalRank: index + 1,
  }))
  const originalOrder = ranked.map((option) => option.configKey)
  const preferenceReason =
    ranked[0] && ranked[1]
      ? getStorePreferencePresentationReason(ranked[0], ranked[1])
      : null

  if (ranked.length < 2 || !preferenceReason) {
    return {
      recommendations: ranked.map((option, index) => ({
        ...option,
        presentationLabel: labelForIndex(index),
        presentationRank: index + 1,
      })),
      presentationStrategy: {
        applied: false,
        type: 'none',
        reason: null,
        originalOrder,
        displayOrder: originalOrder,
      },
    }
  }

  const display = [ranked[1], ranked[0], ...ranked.slice(2)].map((option, index) => ({
    ...option,
    presentationLabel: labelForIndex(index),
    presentationRank: index + 1,
    commercialRole: roleForIndex(index),
  }))

  return {
    recommendations: display,
    presentationStrategy: {
      applied: true,
      type: 'target_as_second_option',
      reason: preferenceReason,
      originalOrder,
      displayOrder: display.map((option) => option.configKey),
    },
  }
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
  heatmap?: {
    samples: PersistedHeatmapSample[]
    geometries: LensGeometry[]
  }
}): Promise<{
  state: RecommendationConversationState
  recommendations: RecommendationOption[]
  presentationStrategy: RecommendationPresentationStrategy
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
  const requestedTopN = params.topN || 3
  const rankedRecommendations = await recommendLensConfigurations({
    versionId: params.versionId,
    versionIds: params.versionIds,
    caseInput: state.caseInput,
    aiConfig: params.aiConfig,
    topN: params.heatmap ? Math.max(8, requestedTopN) : requestedTopN,
    targetPrice: tPrice,
  })
  const heatmapAdjusted = params.heatmap
    ? applyHeatmapCompatibility(rankedRecommendations, params.heatmap.samples, params.heatmap.geometries)
    : rankedRecommendations
  const finalRecommendations = params.heatmap
    ? selectDiverseTopEntries(heatmapAdjusted, requestedTopN)
    : heatmapAdjusted
  const { recommendations, presentationStrategy } = applyRecommendationPresentationStrategy(finalRecommendations)

  state.lastRecommendations = recommendations

  return {
    state,
    recommendations,
    presentationStrategy,
  }
}


