// Centralização de tipos e constantes para as sugestões de IA
// Este arquivo NÃO possui 'use server' para poder ser importado em ambos os lados (client/server)

export type AiLabPreference = {
    versionId: string
    laboratorio: string
    weight: number
}

export type AiStoreProfileLevel = 'baixo' | 'medio' | 'alto'
export type AiStoreInvestmentProfile = 'economico' | 'equilibrado' | 'premium'

export type AiStoreProfile = {
    investment_profile: AiStoreInvestmentProfile
    tech_adoption: AiStoreProfileLevel
    aesthetic_priority: AiStoreProfileLevel
}

export type AiBrandWeight = {
    brand: string
    weight: number
}

export type AiCategoryBrandPreferences = {
    multifocal?: AiBrandWeight[]
    ocupacional?: AiBrandWeight[]
    controle_miopia?: AiBrandWeight[]
    visao_simples?: AiBrandWeight[]
    bifocal?: AiBrandWeight[]
    plana_solar?: AiBrandWeight[]
}

export type AiSuggestionConfig = {
    lab_preferences: AiLabPreference[]
    store_profile: AiStoreProfile
    category_brand_preferences: AiCategoryBrandPreferences
}

export const AI_SUGGESTION_CONFIG_DEFAULTS: AiSuggestionConfig = {
    lab_preferences: [],
    store_profile: {
        investment_profile: 'equilibrado',
        tech_adoption: 'medio',
        aesthetic_priority: 'medio',
    },
    category_brand_preferences: {},
}

export const CLINICAL_CATEGORY_LABELS: Record<string, string> = {
    multifocal: 'Multifocal',
    ocupacional: 'Ocupacional',
    controle_miopia: 'Controle de Miopia',
    visao_simples: 'Visão Simples',
    bifocal: 'Bifocal',
    plana_solar: 'Solar / Plana',
}

export type AiConfigCatalogInfo = {
    versionId: string
    laboratorio: string
    versao: string
}

export type AiConfigBrandsByCategory = {
    category: string
    categoryLabel: string
    brands: string[]
}
