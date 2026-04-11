'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, ChevronUp, Filter, Search, Tag, X } from 'lucide-react'
import type {
  PriceTableAllActiveOffersData,
  PriceTableCompatibility,
  PriceTableMixedOffer,
} from '@/lib/actions/price-table.actions'

function formatCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function resolvePrice(
  offer: PriceTableMixedOffer,
  compatibility: { specialPrice: number | null; priceMode: 'final' | 'surcharge' } | null,
): number | null {
  if (!compatibility) return offer.basePrice
  if (compatibility.priceMode === 'surcharge') {
    return (offer.basePrice || 0) + (compatibility.specialPrice || 0)
  }
  return compatibility.specialPrice ?? offer.basePrice
}

function getOfferLabel(offer: PriceTableMixedOffer): string {
  return offer.displayName || offer.canonicalLabel || offer.rawLabel
}

function getClinicalLabel(category: string): string {
  const map: Record<string, string> = {
    multifocal: 'Multifocal',
    visao_simples: 'Visao Simples',
    ocupacional: 'Ocupacional',
    bifocal: 'Bifocal',
    controle_miopia: 'Controle Miopia',
    plana_solar: 'Solar/Plana',
    mista: 'Mista',
    indefinida: 'Indefinida',
  }

  return map[category] || category
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
        active
          ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
          : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white'
      }`}
    >
      {label}
      {active ? <X className="h-3 w-3" /> : null}
    </button>
  )
}

function getPriceRange(
  offer: PriceTableMixedOffer,
  compatibilityMap: Map<string, PriceTableCompatibility[]>,
): { minPrice: number | null; maxPrice: number | null } {
  const compatibilities = compatibilityMap.get(offer.globalOfferId) || []
  const prices = compatibilities
    .map((compatibility) => resolvePrice(offer, compatibility))
    .filter((value): value is number => value != null)

  if (offer.basePrice != null) {
    prices.unshift(offer.basePrice)
  }

  if (!prices.length) {
    return {
      minPrice: offer.basePrice,
      maxPrice: offer.basePrice,
    }
  }

  return {
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
  }
}

function matchesSearch(offer: PriceTableMixedOffer, term: string): boolean {
  const haystack = [
    offer.familyName,
    getOfferLabel(offer),
    offer.rawLabel,
    offer.canonicalLabel || '',
    offer.sourceLaboratorio,
    offer.sourceVersao,
    offer.material || '',
    offer.indiceRefracao != null ? String(offer.indiceRefracao) : '',
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(term)
}

export default function PriceTableLensSearchInterface({
  data,
}: {
  data: PriceTableAllActiveOffersData
}) {
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [laboratorioFilter, setLaboratorioFilter] = useState<string | null>(null)
  const [familyFilter, setFamilyFilter] = useState<string | null>(null)
  const [clinicalFilter, setClinicalFilter] = useState<string | null>(null)
  const [featureFilter, setFeatureFilter] = useState<string[]>([])
  const [materialFilter, setMaterialFilter] = useState<string | null>(null)
  const [indiceFilter, setIndiceFilter] = useState<number | null>(null)
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())

  const compatibilityMap = useMemo(() => {
    const map = new Map<string, PriceTableCompatibility[]>()
    for (const compatibility of data.compatibilities) {
      const current = map.get(compatibility.offerId) || []
      current.push(compatibility)
      map.set(compatibility.offerId, current)
    }
    return map
  }, [data.compatibilities])

  const filterOptions = useMemo(() => {
    const laboratorios = new Set<string>()
    const families = new Set<string>()
    const clinicals = new Set<string>()
    const materials = new Set<string>()
    const indices = new Set<number>()
    const features = new Set<string>()

    const matchesBase = (
      offer: PriceTableMixedOffer,
      opts: { ignoreMaterial?: boolean; ignoreIndice?: boolean } = {},
    ) => {
      if (deferredSearch.length >= 2 && !matchesSearch(offer, deferredSearch)) return false
      if (laboratorioFilter && offer.sourceLaboratorio !== laboratorioFilter) return false
      if (familyFilter && offer.familyName !== familyFilter) return false
      if (clinicalFilter && offer.clinicalCategory !== clinicalFilter) return false
      if (featureFilter.length > 0) {
        const feat = offer.features as Record<string, unknown>
        if (!featureFilter.every((key) => feat?.[key])) return false
      }
      if (!opts.ignoreMaterial && materialFilter && offer.material !== materialFilter) return false
      if (!opts.ignoreIndice && indiceFilter != null && offer.indiceRefracao !== indiceFilter) return false
      return true
    }

    for (const offer of data.offers) {
      if (!matchesBase(offer)) continue
      laboratorios.add(offer.sourceLaboratorio)
      families.add(offer.familyName)
      if (offer.clinicalCategory && offer.clinicalCategory !== 'indefinida') {
        clinicals.add(offer.clinicalCategory)
      }
      const feat = offer.features || {}
      for (const [key, val] of Object.entries(feat)) {
        if (val === true) features.add(key)
      }
    }

    for (const offer of data.offers) {
      if (!matchesBase(offer, { ignoreMaterial: true })) continue
      if (offer.material) materials.add(offer.material)
    }

    for (const offer of data.offers) {
      if (!matchesBase(offer, { ignoreIndice: true })) continue
      if (offer.indiceRefracao != null) indices.add(offer.indiceRefracao)
    }

    return {
      laboratorios: Array.from(laboratorios).sort(),
      families: Array.from(families).sort(),
      clinicals: Array.from(clinicals).sort(),
      materials: Array.from(materials).sort(),
      indices: Array.from(indices).sort((a, b) => a - b),
      features: Array.from(features).sort(),
    }
  }, [
    clinicalFilter,
    data.offers,
    deferredSearch,
    familyFilter,
    featureFilter,
    indiceFilter,
    laboratorioFilter,
    materialFilter,
  ])

  const activeFilterCount = [
    laboratorioFilter,
    familyFilter,
    clinicalFilter,
    featureFilter.length > 0 ? 'feature' : null,
    materialFilter,
    indiceFilter,
  ].filter(Boolean).length

  const hasSearchOrFilter = deferredSearch.length >= 2 || activeFilterCount > 0

  const filteredOffers = useMemo(() => {
    if (!hasSearchOrFilter) return []

    return [...data.offers]
      .filter((offer) => {
        if (deferredSearch.length >= 2 && !matchesSearch(offer, deferredSearch)) return false
        if (laboratorioFilter && offer.sourceLaboratorio !== laboratorioFilter) return false
        if (familyFilter && offer.familyName !== familyFilter) return false
        if (clinicalFilter && offer.clinicalCategory !== clinicalFilter) return false
        if (featureFilter.length > 0) {
          const feat = offer.features as Record<string, unknown>
          if (!featureFilter.every((key) => feat?.[key])) return false
        }
        if (materialFilter && offer.material !== materialFilter) return false
        if (indiceFilter != null && offer.indiceRefracao !== indiceFilter) return false
        return true
      })
      .sort((left, right) => {
        const familyComparison = left.familyName.localeCompare(right.familyName)
        if (familyComparison !== 0) return familyComparison

        const labelComparison = getOfferLabel(left).localeCompare(getOfferLabel(right))
        if (labelComparison !== 0) return labelComparison

        return left.sourceLaboratorio.localeCompare(right.sourceLaboratorio)
      })
  }, [
    clinicalFilter,
    data.offers,
    deferredSearch,
    familyFilter,
    featureFilter,
    hasSearchOrFilter,
    indiceFilter,
    laboratorioFilter,
    materialFilter,
  ])

  const clearFilters = () => {
    setLaboratorioFilter(null)
    setFamilyFilter(null)
    setClinicalFilter(null)
    setFeatureFilter([])
    setMaterialFilter(null)
    setIndiceFilter(null)
  }

  useEffect(() => {
    if (materialFilter && !filterOptions.materials.includes(materialFilter)) {
      setMaterialFilter(null)
    }
  }, [filterOptions.materials, materialFilter])

  useEffect(() => {
    if (indiceFilter != null && !filterOptions.indices.includes(indiceFilter)) {
      setIndiceFilter(null)
    }
  }, [filterOptions.indices, indiceFilter])

  useEffect(() => {
    if (featureFilter.length === 0) return
    const next = featureFilter.filter((feature) => filterOptions.features.includes(feature))
    if (next.length !== featureFilter.length) {
      setFeatureFilter(next)
    }
  }, [featureFilter, filterOptions.features])

  const buildOpenTableHref = (offer: PriceTableMixedOffer) => {
    const params = new URLSearchParams()
    params.set('scope', 'laboratorio')
    params.set('versionId', offer.sourceVersionId)
    if (search.trim()) params.set('q', search.trim())
    if (clinicalFilter) params.set('clinical', clinicalFilter)
    if (featureFilter.length > 0) params.set('feature', featureFilter.join(','))
    if (materialFilter) params.set('material', materialFilter)
    if (indiceFilter != null) params.set('indice', String(indiceFilter))
    return `/dashboard/loja/${data.storeId}/tabela-precos?${params.toString()}`
  }

  return (
    <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-6 shadow-[0_25px_80px_rgba(2,6,23,0.35)] sm:p-7">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-cyan-300/80">
              Tabela de Precos
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Pesquisa por lente
            </h2>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-500">
            {data.activeCatalogs.length} tabelas ativas
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-md sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por lente, familia, material ou laboratorio"
                className="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40"
              />
            </div>

            <button
              onClick={() => setShowFilters((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
                showFilters || activeFilterCount
                  ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
                  : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
              }`}
            >
              {showFilters ? <ChevronUp className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
              Filtros
              {activeFilterCount > 0 ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-black text-slate-950">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>

            {activeFilterCount > 0 ? (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 transition hover:text-red-300"
              >
                <X className="h-3 w-3" />
                Limpar
              </button>
            ) : null}
          </div>

          {showFilters ? (
            <div className="space-y-4 border-t border-white/8 pt-4">
              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Laboratorio
                </p>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.laboratorios.map((laboratorio) => (
                    <FilterPill
                      key={laboratorio}
                      label={laboratorio}
                      active={laboratorioFilter === laboratorio}
                      onClick={() =>
                        setLaboratorioFilter(laboratorioFilter === laboratorio ? null : laboratorio)
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Categoria
                </p>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.clinicals.map((clinical) => (
                    <FilterPill
                      key={clinical}
                      label={getClinicalLabel(clinical)}
                      active={clinicalFilter === clinical}
                      onClick={() => setClinicalFilter(clinicalFilter === clinical ? null : clinical)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Material
                </p>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.materials.map((material) => (
                    <FilterPill
                      key={material}
                      label={material}
                      active={materialFilter === material}
                      onClick={() => setMaterialFilter(materialFilter === material ? null : material)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Indice
                </p>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.indices.map((indice) => (
                    <FilterPill
                      key={indice}
                      label={String(indice)}
                      active={indiceFilter === indice}
                      onClick={() => setIndiceFilter(indiceFilter === indice ? null : indice)}
                    />
                  ))}
                </div>
              </div>

              {filterOptions.features.length > 0 ? (
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Features
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.features.map((feature) => (
                      <FilterPill
                        key={feature}
                        label={feature.replace(/_/g, ' ')}
                        active={featureFilter.includes(feature)}
                        onClick={() =>
                          setFeatureFilter((current) =>
                            current.includes(feature)
                              ? current.filter((item) => item !== feature)
                              : [...current, feature],
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Familia
                </p>
                <select
                  value={familyFilter || ''}
                  onChange={(event) => setFamilyFilter(event.target.value || null)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
                >
                  <option value="">Todas as familias</option>
                  {filterOptions.families.map((family) => (
                    <option key={family} value={family}>
                      {family}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </div>

        {!hasSearchOrFilter ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/10 px-6 py-12 text-center">
            <Tag className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="text-lg font-bold text-slate-300">Digite pelo menos 2 caracteres ou use filtros</p>
            <p className="mt-1 text-sm text-slate-500">
              Exemplo: Varilux, Kodak, Eyezen, Stellest, Airwear
            </p>
          </div>
        ) : filteredOffers.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/10 px-6 py-12 text-center">
            <Tag className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="text-lg font-bold text-slate-300">Nenhuma lente encontrada</p>
            <p className="mt-1 text-sm text-slate-500">
              Tente outro termo para procurar entre os laboratorios ativos.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              {filteredOffers.length} resultados
            </p>

            {filteredOffers.map((offer) => {
              const { minPrice, maxPrice } = getPriceRange(offer, compatibilityMap)
              const samePrice = minPrice === maxPrice

              return (
                <div
                  key={`${offer.sourceVersionId}:${offer.globalOfferId}`}
                  className="rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:border-white/15 hover:bg-black/30"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">
                          {offer.sourceLaboratorio}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                          {offer.familyName}
                        </span>
                      </div>

                      <h3 className="mt-3 text-lg font-black tracking-tight text-white">
                        {getOfferLabel(offer)}
                      </h3>

                      <p className="mt-1 text-sm text-slate-400">{offer.sourceVersao}</p>

                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {[offer.material, offer.indiceRefracao != null ? `Indice ${offer.indiceRefracao}` : null]
                          .filter(Boolean)
                          .join(' - ') || 'Sem material/indice informado'}
                      </p>
                    </div>

                    <div className="flex flex-col items-start gap-3 lg:items-end">
                      <div className="text-left lg:text-right">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                          Faixa de preco
                        </p>
                        <p className="mt-1 text-xl font-black text-white">
                          {samePrice
                            ? formatCurrency(minPrice)
                            : `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`}
                        </p>
                      </div>

                      <Link
                        href={buildOpenTableHref(offer)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-slate-200 transition hover:border-cyan-400/30 hover:text-white"
                      >
                        Abrir na tabela
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
