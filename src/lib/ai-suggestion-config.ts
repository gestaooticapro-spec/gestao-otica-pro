import type {
  AiStoreInvestmentProfile,
  AiStoreProfileLevel,
  AiSuggestionConfig,
} from '@/lib/types/ai-config.types'

export function sanitizeAiSuggestionConfig(config: AiSuggestionConfig): AiSuggestionConfig {
  const clampWeight = (weight: number) => Math.max(0, Math.min(5, Math.round(weight)))
  const validLevels: AiStoreProfileLevel[] = ['baixo', 'medio', 'alto']
  const clampLevel = (value: string): AiStoreProfileLevel =>
    validLevels.includes(value as AiStoreProfileLevel) ? value as AiStoreProfileLevel : 'medio'
  const validInvestment: AiStoreInvestmentProfile[] = ['economico', 'equilibrado', 'premium']
  const clampInvestment = (value: string): AiStoreInvestmentProfile =>
    validInvestment.includes(value as AiStoreInvestmentProfile) ? value as AiStoreInvestmentProfile : 'equilibrado'

  return {
    lab_preferences: (config.lab_preferences || []).map((preference) => ({
      versionId: preference.versionId,
      laboratorio: preference.laboratorio,
      weight: clampWeight(preference.weight),
    })),
    store_profile: {
      investment_profile: clampInvestment(config.store_profile?.investment_profile || 'equilibrado'),
      tech_adoption: clampLevel(config.store_profile?.tech_adoption || 'medio'),
      aesthetic_priority: clampLevel(config.store_profile?.aesthetic_priority || 'medio'),
    },
    category_brand_preferences: Object.fromEntries(
      Object.entries(config.category_brand_preferences || {}).map(([category, brands]) => [
        category,
        (brands || []).map((brand) => ({ brand: brand.brand, weight: clampWeight(brand.weight) })),
      ]),
    ),
  }
}
