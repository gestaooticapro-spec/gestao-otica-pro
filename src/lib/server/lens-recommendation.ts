import { createAdminClient } from '@/lib/supabase/admin'

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
  budget_mode?: BudgetMode
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
  caseInput: RecommendationCaseInput
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
  tags_uso: string[]
  tags_beneficios: string[]
  clinical_category: ClinicalCategory
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
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

function normalizeFeatureFlags(features: Record<string, unknown> = {}): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(features).filter(([, featureValue]) => featureValue === true),
  ) as Record<string, boolean>
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

function resolveOfferClinicalCategory(family: CatalogFamily, offer: CatalogOffer): ClinicalCategory {
  if (offer.clinical_category !== 'indefinida') return offer.clinical_category
  if (family.clinical_category !== 'mista') return family.clinical_category
  return 'indefinida'
}

function evaluateClinicalEligibility(
  input: RecommendationCaseInput,
  family: CatalogFamily,
  offer: CatalogOffer,
  forcedClinicalCategories?: ClinicalCategory[],
): ClinicalEvaluation {
  const desiredCategories = forcedClinicalCategories?.length
    ? forcedClinicalCategories
    : getDesiredClinicalCategories(input)
  const effectiveCategory = resolveOfferClinicalCategory(family, offer)

  if (effectiveCategory !== 'indefinida') {
    return {
      eligible: desiredCategories.includes(effectiveCategory),
      effectiveCategory,
      confidencePenalty: 0,
    }
  }

  if (family.clinical_category === 'mista') {
    return {
      eligible: true,
      effectiveCategory,
      confidencePenalty: 2,
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
    return (1 - normalized) * 2
  }

  if (mode === 'premium') {
    return normalized * 2
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

  const distance = Math.abs(targetPrice - price)
  const normalizedDistance = Math.min(distance / targetPrice, 1)
  return (1 - normalizedDistance) * 3
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

  const familyUsage = usageProfile?.usage_tags || family.tags_uso
  const familyBenefits = usageProfile?.benefit_tags || family.tags_beneficios
  const offerFeatures = normalizeFeatureFlags(offer.features)
  const offerDescriptor = withoutAccents(
    `${offer.raw_label} ${offer.canonical_label || ''} ${offer.material || ''}`.toLowerCase(),
  )
  const budgetMode = normalizeBudgetMode(input.budget_mode)

  if (clinicalEvaluation.effectiveCategory !== 'indefinida') {
    score += 5
    reasons.push(`categoria:${clinicalEvaluation.effectiveCategory}`)
  } else if (clinicalEvaluation.confidencePenalty > 0) {
    score -= clinicalEvaluation.confidencePenalty
    reasons.push('categoria:mista_sem_oferta_definida')
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
    if (offerFeatures[preferredFeature] === true) {
      score += 3
      reasons.push(`feature:${preferredFeature}`)
    }
  }

  const seeksResistance =
    (input.desired_benefits || []).includes('resistencia') ||
    (input.rotina_tags || []).includes('crianca_ativa') ||
    (input.rotina_tags || []).includes('risco_quebra')

  if (seeksResistance && /(airwear|poly\b|policarbonato)/.test(offerDescriptor)) {
    score += 4
    reasons.push('material:resistente')
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

export async function loadRecommendationCatalog(versionId: string): Promise<RecommendationCatalog> {
  const supabaseAdmin = createAdminClient() as any

  const { data: families, error: familiesError } = await supabaseAdmin
    .from('global_lens_families')
    .select('id,nome,tags_uso,tags_beneficios,clinical_category')
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
      tags_uso: normalizeStringArray(family.tags_uso),
      tags_beneficios: normalizeStringArray(family.tags_beneficios),
      clinical_category: normalizeCategory(family.clinical_category),
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

export async function recommendLensConfigurations(params: {
  versionId: string
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

  const catalog = params.catalog || (await loadRecommendationCatalog(versionId))
  const input = enrichCaseInput({
    ...params.caseInput,
    budget_mode: budgetModeOverride || params.caseInput.budget_mode || 'intermediario',
  })

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

      const clinicalEvaluation = evaluateClinicalEligibility(input, family, offer, forcedClinicalCategories)
      if (!clinicalEvaluation.eligible) return null

      const offerGrids = gridsByOfferId.get(offer.id) || []
      if (!matchesGrid(input, offerGrids)) return null

      const offerFeatures = normalizeFeatureFlags(offer.features)
      if (requiredFeatures.some((feature) => offerFeatures[feature] !== true)) {
        return null
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
    const totalScore = Number((offerScoring.score + treatmentScoring.score).toFixed(2))
    const configKey = `${entry.family.nome} | ${entry.offer.raw_label} | ${entry.treatment?.nome || 'sem_tratamento'}`

    return {
      configKey,
      familyId: entry.family.id,
      offerId: entry.offer.id,
      treatmentId: entry.treatment?.id || null,
      familyName: entry.family.nome,
      offerLabel: entry.offer.canonical_label || entry.offer.raw_label,
      treatmentName: entry.treatment?.nome || null,
      treatmentType: entry.treatment?.tipo || null,
      clinicalCategory: entry.clinicalEvaluation.effectiveCategory,
      finalPrice: entry.finalPrice,
      basePrice: entry.offer.base_price,
      reasons: [...offerScoring.reasons, ...treatmentScoring.reasons],
      score: totalScore,
      sourcePageReference: entry.offer.source_page_reference,
      commercialSummary: entry.usageProfile?.commercial_summary || null,
      recommendationNotes: entry.usageProfile?.recommendation_notes || null,
      treatmentSummary: getTreatmentSemanticProfile(entry.treatment)?.commercial_summary || null,
      treatmentNotes: getTreatmentSemanticProfile(entry.treatment)?.recommendation_notes || null,
      treatmentExplainWhy: getTreatmentSemanticProfile(entry.treatment)?.explain_why || null,
    } satisfies RecommendationOption
  })

  const dedupedRanked = dedupeRankedEntries(
    ranked.filter((entry) => !excludedConfigKeys.includes(entry.configKey)),
  )
  return dedupedRanked.slice(0, topN)
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
    caseInput: nextState.caseInput,
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
  caseInput: RecommendationCaseInput
  topN?: number
}): Promise<{
  state: RecommendationConversationState
  recommendations: RecommendationOption[]
}> {
  const state: RecommendationConversationState = {
    versionId: params.versionId,
    caseInput: enrichCaseInput(params.caseInput),
    requiredFeatures: [],
    excludedConfigKeys: [],
    targetPrice: null,
    lastRecommendations: [],
  }

  const recommendations = await recommendLensConfigurations({
    versionId: params.versionId,
    caseInput: state.caseInput,
    topN: params.topN || 3,
  })

  state.lastRecommendations = recommendations

  return {
    state,
    recommendations,
  }
}
