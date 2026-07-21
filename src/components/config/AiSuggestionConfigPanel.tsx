'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
    Sparkles, Loader2, Star, FlaskConical, Building2,
    Gauge, Gem, Cpu, Palette, ChevronDown, ChevronUp, Info
} from 'lucide-react'
import {
    AiSuggestionConfig, AiStoreProfile,
    AiStoreProfileLevel, AiCategoryBrandPreferences, AiStoreInvestmentProfile,
    AiConfigCatalogInfo, AiConfigBrandsByCategory,
} from '@/lib/types/ai-config.types'

type AiConfigApiResponse = {
    config: AiSuggestionConfig
    catalogs: AiConfigCatalogInfo[]
    brandsByCategory: AiConfigBrandsByCategory[]
}

const cardStyle = "bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-xl shadow-xl relative overflow-hidden"

const PROFILE_FIELDS: {
    key: Exclude<keyof AiStoreProfile, 'investment_profile'>
    label: string
    description: string
    icon: typeof Gauge
    color: string
}[] = [
    { key: 'tech_adoption', label: 'Apetite Tecnológico', description: 'Interesse em inovações e novidades', icon: Cpu, color: 'sky' },
    { key: 'aesthetic_priority', label: 'Prioridade Estética', description: 'Valorizam lentes finas e discretas', icon: Palette, color: 'rose' },
]

const LEVEL_OPTIONS: { value: AiStoreProfileLevel; label: string }[] = [
    { value: 'baixo', label: 'Baixo' },
    { value: 'medio', label: 'Médio' },
    { value: 'alto', label: 'Alto' },
]

const INVESTMENT_OPTIONS: { value: AiStoreInvestmentProfile; label: string }[] = [
    { value: 'economico', label: 'Econômico' },
    { value: 'equilibrado', label: 'Equilibrado' },
    { value: 'premium', label: 'Premium' },
]

function StarRating({ value, onChange, max = 5, size = 'md', disabled = false }: {
    value: number
    onChange: (v: number) => void
    max?: number
    size?: 'sm' | 'md'
    disabled?: boolean
}) {
    const sizeClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
    return (
        <div className="flex items-center gap-0.5">
            {Array.from({ length: max }, (_, i) => (
                <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(i + 1 === value ? 0 : i + 1)}
                    className={`transition-all ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:scale-125'}`}
                    title={`${i + 1} estrela${i > 0 ? 's' : ''}`}
                >
                    <Star
                        className={`${sizeClass} transition-colors ${
                            i < value
                                ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.4)]'
                                : 'text-slate-600'
                        }`}
                    />
                </button>
            ))}
        </div>
    )
}

function LevelPicker({ value, onChange, disabled, color }: {
    value: AiStoreProfileLevel
    onChange: (v: AiStoreProfileLevel) => void
    disabled: boolean
    color: string
}) {
    const colorMap: Record<string, string> = {
        emerald: 'bg-emerald-500/30 text-emerald-300 border-emerald-500/40 shadow-emerald-500/10',
        amber: 'bg-amber-500/30 text-amber-300 border-amber-500/40 shadow-amber-500/10',
        sky: 'bg-sky-500/30 text-sky-300 border-sky-500/40 shadow-sky-500/10',
        rose: 'bg-rose-500/30 text-rose-300 border-rose-500/40 shadow-rose-500/10',
        indigo: 'bg-indigo-500/30 text-indigo-300 border-indigo-500/40 shadow-indigo-500/10',
        orange: 'bg-orange-500/30 text-orange-300 border-orange-500/40 shadow-orange-500/10',
    }
    const activeStyle = colorMap[color] || colorMap.indigo

    return (
        <div className="flex gap-1">
            {LEVEL_OPTIONS.map(opt => (
                <button
                    key={opt.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(opt.value)}
                    className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border transition-all
                        ${value === opt.value
                            ? `${activeStyle} shadow-lg`
                            : 'bg-white/5 text-slate-500 border-white/10 hover:bg-white/10 hover:text-slate-300'
                        }
                        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    )
}

function InvestmentPicker({ value, onChange, disabled }: {
    value: AiStoreInvestmentProfile
    onChange: (v: AiStoreInvestmentProfile) => void
    disabled: boolean
}) {
    return (
        <div className="flex gap-1">
            {INVESTMENT_OPTIONS.map(opt => (
                <button
                    key={opt.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(opt.value)}
                    className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border transition-all
                        ${value === opt.value
                            ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/40 shadow-emerald-500/10 shadow-lg'
                            : 'bg-white/5 text-slate-500 border-white/10 hover:bg-white/10 hover:text-slate-300'
                        }
                        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    )
}

export default function AiSuggestionConfigPanel({ storeId, endpoint, collapsible = false }: { storeId: number; endpoint?: string; collapsible?: boolean }) {
    const configEndpoint = endpoint || `/api/store/${storeId}/ai-suggestion-config`
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const [config, setConfig] = useState<AiSuggestionConfig | null>(null)
    const [catalogs, setCatalogs] = useState<AiConfigCatalogInfo[]>([])
    const [brandsByCategory, setBrandsByCategory] = useState<AiConfigBrandsByCategory[]>([])

    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() =>
        collapsible ? new Set(['laboratories', 'profile', 'brands']) : new Set()
    )

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        fetch(configEndpoint)
            .then(r => r.json())
            .then((data: AiConfigApiResponse) => {
                setConfig(data.config)
                setCatalogs(data.catalogs)
                setBrandsByCategory(data.brandsByCategory)

                if (data.config.lab_preferences.length === 0 && data.catalogs.length > 0) {
                    setConfig(prev => prev ? {
                        ...prev,
                        lab_preferences: data.catalogs.map(c => ({
                            versionId: c.versionId,
                            laboratorio: c.laboratorio,
                            weight: 3,
                        })),
                    } : prev)
                }
            })
            .catch(() => setError('Falha ao carregar configurações.'))
            .finally(() => setLoading(false))
    }, [configEndpoint])

    const persistConfig = useCallback((updated: AiSuggestionConfig) => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
            setSaving(true)
            try {
                const res = await fetch(configEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updated),
                })
                const data = await res.json()
                if (data.success) {
                    setLastSaved(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
                } else {
                    setError(data.error || 'Erro ao salvar.')
                }
            } catch {
                setError('Erro de conexão.')
            } finally {
                setSaving(false)
            }
        }, 1200)
    }, [configEndpoint])

    const updateConfig = useCallback((updater: (prev: AiSuggestionConfig) => AiSuggestionConfig) => {
        setConfig(prev => {
            if (!prev) return prev
            const updated = updater(prev)
            persistConfig(updated)
            return updated
        })
    }, [persistConfig])

    const updateLabWeight = (versionId: string, weight: number) => {
        updateConfig(prev => ({
            ...prev,
            lab_preferences: prev.lab_preferences.map(lp =>
                lp.versionId === versionId ? { ...lp, weight } : lp
            ),
        }))
    }

    const updateProfileField = (key: keyof AiStoreProfile, value: AiStoreProfileLevel) => {
        updateConfig(prev => ({
            ...prev,
            store_profile: { ...prev.store_profile, [key]: value },
        }))
    }

    const updateInvestmentProfile = (value: AiStoreInvestmentProfile) => {
        updateConfig(prev => ({
            ...prev,
            store_profile: { ...prev.store_profile, investment_profile: value },
        }))
    }

    const updateBrandWeight = (category: string, brand: string, weight: number) => {
        updateConfig(prev => {
            const catKey = category as keyof AiCategoryBrandPreferences
            const currentBrands = prev.category_brand_preferences[catKey] || []
            const exists = currentBrands.find(b => b.brand === brand)

            const updatedBrands = exists
                ? currentBrands.map(b => b.brand === brand ? { ...b, weight } : b)
                : [...currentBrands, { brand, weight }]

            return {
                ...prev,
                category_brand_preferences: {
                    ...prev.category_brand_preferences,
                    [catKey]: updatedBrands,
                },
            }
        })
    }

    const getBrandWeight = (category: string, brand: string): number => {
        if (!config) return 3
        const catKey = category as keyof AiCategoryBrandPreferences
        const brands = config.category_brand_preferences[catKey] || []
        const found = brands.find(b => b.brand === brand)
        return found?.weight ?? 3
    }

    const toggleCategory = (cat: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev)
            if (next.has(cat)) next.delete(cat)
            else next.add(cat)
            return next
        })
    }

    const toggleSection = (section: string) => {
        if (!collapsible) return
        setCollapsedSections(prev => {
            const next = new Set(prev)
            if (next.has(section)) next.delete(section)
            else next.add(section)
            return next
        })
    }

    if (loading) {
        return (
            <div className="p-10 text-center">
                <Loader2 className="animate-spin h-8 w-8 text-cyan-400 mx-auto" />
                <p className="text-xs text-slate-500 mt-3">Carregando configurações do motor de IA...</p>
            </div>
        )
    }

    if (error && !config) {
        return (
            <div className="p-6 text-center text-sm font-bold text-red-300">{error}</div>
        )
    }

    if (!config) return null

    return (
        <div className="space-y-5 animate-in fade-in">
            {/* STATUS HEADER */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="bg-cyan-500/20 p-1.5 rounded-lg border border-cyan-500/30">
                        <FlaskConical className="h-4 w-4 text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.15em]">
                            Motor de Sugestões
                        </h3>
                        <p className="text-[10px] text-slate-500">Pesos comerciais aplicados após a elegibilidade clínica</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {saving && (
                        <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 animate-pulse font-bold tracking-widest uppercase">
                            <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                        </div>
                    )}
                    {lastSaved && !saving && (
                        <span className="text-[10px] text-emerald-400/70 font-bold tracking-wider">
                            ✓ Salvo às {lastSaved}
                        </span>
                    )}
                </div>
            </div>

            {/* CARD A — Lab Preferences */}
            {config.lab_preferences.length > 0 && (
                <div className={cardStyle}>
                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                    {collapsible && <button type="button" onClick={() => toggleSection('laboratories')} className="absolute right-4 top-4 rounded-lg p-1 text-amber-300 hover:bg-white/10" aria-label="Alternar preferência por laboratório">{collapsedSections.has('laboratories') ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</button>}
                    <h4 className="text-xs font-bold text-amber-300 uppercase mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
                        <Building2 className="h-4 w-4 text-amber-400" /> Preferência por Laboratório
                    </h4>
                    {!collapsedSections.has('laboratories') && <>
                    <div className="space-y-2">
                        {config.lab_preferences.map(lp => (
                            <div key={lp.versionId} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-4 py-2.5 hover:bg-white/5 transition-colors">
                                <div>
                                    <p className="text-sm font-bold text-slate-200">{lp.laboratorio}</p>
                                </div>
                                <StarRating
                                    value={lp.weight}
                                    onChange={(w) => updateLabWeight(lp.versionId, w)}
                                    disabled={saving}
                                />
                            </div>
                        ))}
                    </div>
                    <p className="text-[9px] text-slate-500 mt-3 flex items-start gap-1">
                        <Info className="h-3 w-3 mt-0.5 shrink-0" />
                        Mais estrelas = maior chance de aparecer quando houver empate clínico entre laboratórios.
                    </p>
                    </>}
                </div>
            )}

            {/* CARD B — Store Profile */}
            <div className={cardStyle}>
                <div className="absolute top-0 left-0 w-1 h-full bg-sky-500"></div>
                {collapsible && <button type="button" onClick={() => toggleSection('profile')} className="absolute right-4 top-4 rounded-lg p-1 text-sky-300 hover:bg-white/10" aria-label="Alternar perfil geral da loja">{collapsedSections.has('profile') ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</button>}
                <h4 className="text-xs font-bold text-sky-300 uppercase mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
                    <Gauge className="h-4 w-4 text-sky-400" /> Perfil Geral da Loja
                </h4>
                {!collapsedSections.has('profile') && <>
                <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-4 py-2.5 hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                                <Gem className="h-4 w-4 text-emerald-300" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-200">Perfil de investimento</p>
                                <p className="text-[10px] text-slate-500">Define o foco geral de preço quando o cliente não informa orçamento</p>
                            </div>
                        </div>
                        <InvestmentPicker
                            value={config.store_profile.investment_profile}
                            onChange={updateInvestmentProfile}
                            disabled={saving}
                        />
                    </div>
                    {PROFILE_FIELDS.map(field => {
                        const Icon = field.icon
                        return (
                            <div key={field.key} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-4 py-2.5 hover:bg-white/5 transition-colors">
                                <div className="flex items-center gap-3">
                                    <Icon className={`h-4 w-4 text-${field.color}-400 shrink-0`} />
                                    <div>
                                        <p className="text-xs font-bold text-slate-200">{field.label}</p>
                                        <p className="text-[10px] text-slate-500">{field.description}</p>
                                    </div>
                                </div>
                                <LevelPicker
                                    value={config.store_profile[field.key] as AiStoreProfileLevel}
                                    onChange={(v) => updateProfileField(field.key, v)}
                                    disabled={saving}
                                    color={field.color}
                                />
                            </div>
                        )
                    })}
                </div>
                </>}
            </div>

            {/* CARD C — Brands by Category */}
            {brandsByCategory.length > 0 && (
                <div className={cardStyle}>
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                    {collapsible && <button type="button" onClick={() => toggleSection('brands')} className="absolute right-4 top-4 rounded-lg p-1 text-emerald-300 hover:bg-white/10" aria-label="Alternar marcas preferidas por categoria">{collapsedSections.has('brands') ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</button>}
                    <h4 className="text-xs font-bold text-emerald-300 uppercase mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
                        <Sparkles className="h-4 w-4 text-emerald-400" /> Marcas Preferidas por Categoria
                    </h4>
                    {!collapsedSections.has('brands') && <>
                    <p className="text-[10px] text-slate-500 mb-4 flex items-start gap-1">
                        <Info className="h-3 w-3 mt-0.5 shrink-0" />
                        Defina quais marcas (famílias) a IA deve priorizar dentro de cada categoria clínica. O padrão é 3 estrelas.
                    </p>
                    <div className="space-y-2">
                        {brandsByCategory.map(catData => {
                            const isExpanded = expandedCategories.has(catData.category)
                            return (
                                <div key={catData.category} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => toggleCategory(catData.category)}
                                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-emerald-300 uppercase tracking-wider">
                                                {catData.categoryLabel}
                                            </span>
                                            <span className="text-[9px] text-slate-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/5 font-bold">
                                                {catData.brands.length} marca{catData.brands.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        {isExpanded
                                            ? <ChevronUp className="h-4 w-4 text-slate-500" />
                                            : <ChevronDown className="h-4 w-4 text-slate-500" />
                                        }
                                    </button>
                                    {isExpanded && (
                                        <div className="border-t border-white/5 px-4 py-2 space-y-1">
                                            {catData.brands.map(brand => (
                                                <div key={brand} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                                                    <span className="text-xs text-slate-300 font-bold">{brand}</span>
                                                    <StarRating
                                                        value={getBrandWeight(catData.category, brand)}
                                                        onChange={(w) => updateBrandWeight(catData.category, brand, w)}
                                                        size="sm"
                                                        disabled={saving}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    </>}
                </div>
            )}

            {/* No catalog warning */}
            {catalogs.length === 0 && (
                <div className={`${cardStyle} text-center`}>
                    <div className="absolute top-0 left-0 w-1 h-full bg-slate-500"></div>
                    <p className="text-xs text-slate-400 py-4">
                        Nenhum catálogo ativo encontrado para esta loja.<br />
                        <span className="text-slate-500">Ative uma tabela de preços para configurar o motor de sugestões.</span>
                    </p>
                </div>
            )}
        </div>
    )
}
