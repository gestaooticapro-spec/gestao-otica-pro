'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Filter,
  Info,
  Layers3,
  LayoutGrid,
  List,
  Package,
  Search,
  Sparkles,
  Tag,
  X,
} from 'lucide-react'
import type { PriceTableData, PriceTableOffer } from '@/lib/actions/price-table.actions'

type ViewMode = 'matrix' | 'list'

type InitialFilters = {
  search?: string
  clinicalFilter?: string | null
  materialFilter?: string | null
  indiceFilter?: number | null
  featureFilter?: string[]
  sectionFilter?: string | null
}

function formatCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(2).replace('.', ',')
}

function formatRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  if (min != null && max != null && min === max) return formatNumber(min)
  return `${formatNumber(min)} a ${formatNumber(max)}`
}

type OfferGridSummary = {
  sphMin: number | null
  sphMax: number | null
  cylMin: number | null
  cylMax: number | null
  addMin: number | null
  addMax: number | null
  metadata?: Record<string, unknown> | null
}

function resolvePrice(
  offer: PriceTableOffer,
  compatibility: { specialPrice: number | null; priceMode: 'final' | 'surcharge' } | null,
): number | null {
  if (!compatibility) return offer.basePrice
  if (compatibility.priceMode === 'surcharge') {
    return (offer.basePrice || 0) + (compatibility.specialPrice || 0)
  }
  return compatibility.specialPrice ?? offer.basePrice
}

function getOfferLabel(offer: PriceTableOffer): string {
  return offer.displayName || offer.canonicalLabel || offer.rawLabel
}

function getClinicalLabel(category: string): string {
  const map: Record<string, string> = {
    multifocal: 'Multifocal',
    visao_simples: 'Visão Simples',
    ocupacional: 'Ocupacional',
    bifocal: 'Bifocal',
    controle_miopia: 'Controle Miopia',
    plana_solar: 'Solar/Plana',
    mista: 'Mista',
    indefinida: 'Indefinida',
  }
  return map[category] || category
}

const FEATURE_LABELS: Record<string, string> = {
  'uso:dirigir_a_noite': 'Dirigir a noite',
  'uso:uso_noturno': 'Uso noturno',
  'uso:uso_telas': 'Uso em telas',
  'uso:conforto_visual_telas': 'Conforto em telas',
  'beneficio:reduzir_ofuscamento': 'Reduzir ofuscamento',
}

function formatFeatureLabel(feature: string): string {
  if (FEATURE_LABELS[feature]) return FEATURE_LABELS[feature]
  const normalized = feature.replace(/^uso:/, '').replace(/^beneficio:/, '')
  return normalized.replace(/_/g, ' ')
}

function extractSemanticTags(features: Record<string, unknown> | null | undefined): string[] {
  if (!features) return []
  const profile = (features as any).semantic_profile || {}
  const usage = Array.isArray(profile.usage_tags) ? profile.usage_tags : []
  const benefits = Array.isArray(profile.benefit_tags) ? profile.benefit_tags : []
  return [
    ...usage.filter(Boolean).map((tag: string) => `uso:${tag}`),
    ...benefits.filter(Boolean).map((tag: string) => `beneficio:${tag}`),
  ]
}

function extractDiameter(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata) return null
  const value =
    (metadata as any).diametro ||
    (metadata as any).diameter ||
    (metadata as any).diametro_mm ||
    (metadata as any).diametroMin ||
    (metadata as any).diametroMax
  if (value == null) return null
  return String(value)
}

function buildOfferDetailTitle(summary: OfferGridSummary | null): string {
  if (!summary) return 'Sem grade informada'
  const parts: string[] = []
  const sph = formatRange(summary.sphMin, summary.sphMax)
  if (sph) parts.push(`Esférico: ${sph}`)
  const cyl = formatRange(summary.cylMin, summary.cylMax)
  if (cyl) parts.push(`Cilíndrico: ${cyl}`)
  const add = formatRange(summary.addMin, summary.addMax)
  if (add) parts.push(`Adição: ${add}`)
  const diam = extractDiameter(summary.metadata)
  if (diam) parts.push(`Diâmetro: ${diam}`)
  return parts.length ? parts.join(' | ') : 'Sem grade informada'
}

function mergeMin(a: number | null, b: number | null): number | null {
  if (a == null) return b
  if (b == null) return a
  return Math.min(a, b)
}

function mergeMax(a: number | null, b: number | null): number | null {
  if (a == null) return b
  if (b == null) return a
  return Math.max(a, b)
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
      {active && <X className="h-3 w-3" />}
    </button>
  )
}

function MatrixTable({
  offers,
  treatments,
  compatibilityMap,
  gridSummaryByOffer,
}: {
  offers: PriceTableOffer[]
  treatments: { id: string; nome: string }[]
  compatibilityMap: Map<string, Map<string, { specialPrice: number | null; priceMode: 'final' | 'surcharge' }>>
  gridSummaryByOffer: Map<string, OfferGridSummary>
}) {
  if (!offers.length) return null

  // Only show treatments that have at least one compatibility with these offers
  const relevantTreatmentIds = new Set<string>()
  for (const offer of offers) {
    const offerCompat = compatibilityMap.get(offer.globalOfferId)
    if (offerCompat) {
      for (const treatmentId of offerCompat.keys()) {
        relevantTreatmentIds.add(treatmentId)
      }
    }
  }

  const visibleTreatments = treatments.filter((t) => relevantTreatmentIds.has(t.id))

  if (!visibleTreatments.length) {
    return (
      <div className="space-y-2">
        {offers.map((offer) => (
          <div
            key={offer.globalOfferId}
            className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-4 py-3"
          >
            <div>
              <p className="text-sm font-bold text-white">{getOfferLabel(offer)}</p>
              {offer.material && (
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  {offer.material}
                  {offer.indiceRefracao ? ` • ${offer.indiceRefracao}` : ''}
                </p>
              )}
            </div>
            <p className="text-lg font-black text-white">{formatCurrency(offer.basePrice)}</p>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/8">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/8 bg-black/30">
            <th className="sticky left-0 z-10 bg-slate-900/95 px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 backdrop-blur-sm">
              Oferta
            </th>
            <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
              Base
            </th>
            {visibleTreatments.map((treatment) => (
              <th
                key={treatment.id}
                className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-[0.1em] text-slate-500"
              >
                <span className="block max-w-[100px] truncate" title={treatment.nome}>
                  {treatment.nome}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {offers.map((offer, idx) => {
            const offerCompat = compatibilityMap.get(offer.globalOfferId)
            return (
              <tr
                key={offer.globalOfferId}
                className={`border-b border-white/5 transition-colors hover:bg-white/5 ${
                  idx % 2 === 0 ? 'bg-black/10' : ''
                }`}
              >
                <td className="sticky left-0 z-10 bg-slate-900/95 px-4 py-3 backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-bold text-white">{getOfferLabel(offer)}</p>
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 text-[10px] font-black text-slate-400 transition hover:border-white/25 hover:text-white"
                      title={buildOfferDetailTitle(gridSummaryByOffer.get(offer.globalOfferId) || null)}
                    >
                      ?
                    </button>
                  </div>
                  {(() => {
                    const summary = gridSummaryByOffer.get(offer.globalOfferId)
                    const sph = formatRange(summary?.sphMin ?? null, summary?.sphMax ?? null)
                    const cyl = formatRange(summary?.cylMin ?? null, summary?.cylMax ?? null)
                    const add = formatRange(summary?.addMin ?? null, summary?.addMax ?? null)
                    const diameter = extractDiameter(summary?.metadata || null)
                    const items = [
                      sph ? `Sph ${sph}` : null,
                      cyl ? `Cyl ${cyl}` : null,
                      add ? `Add ${add}` : null,
                      diameter ? `Ø ${diameter}` : null,
                    ].filter(Boolean)
                    return items.length ? (
                      <p className="mt-1 text-[10px] text-slate-500">{items.join(' â€¢ ')}</p>
                    ) : null
                  })()}
                  <p className="text-[10px] text-slate-500">
                    {[offer.material, offer.indiceRefracao].filter(Boolean).join(' • ')}
                  </p>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="font-mono text-xs font-bold text-slate-300">
                    {formatCurrency(offer.basePrice)}
                  </span>
                </td>
                {visibleTreatments.map((treatment) => {
                  const compat = offerCompat?.get(treatment.id) || null
                  const price = compat ? resolvePrice(offer, compat) : null
                  return (
                    <td key={treatment.id} className="px-3 py-3 text-center">
                      {price != null ? (
                        <span className="font-mono text-xs font-bold text-cyan-200">
                          {formatCurrency(price)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AtomicOfferCard({ offer }: { offer: PriceTableOffer }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-5 py-4 transition-all hover:border-white/15 hover:bg-black/30">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-amber-300" />
          <p className="font-bold text-white">{getOfferLabel(offer)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {offer.material && (
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {offer.material}
            </span>
          )}
          {offer.indiceRefracao && (
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Índice {offer.indiceRefracao}
            </span>
          )}
          {offer.alreadyIncludesTreatment && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
              <Sparkles className="h-3 w-3" />
              Tratamento incluso
            </span>
          )}
          {offer.isAtomicOffer && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
              Oferta Fechada
            </span>
          )}
        </div>
      </div>
      <p className="text-xl font-black text-white">{formatCurrency(offer.basePrice)}</p>
    </div>
  )
}

function FamilySection({
  familyName,
  composableOffers,
  atomicOffers,
  treatments,
  compatibilityMap,
  gridSummaryByOffer,
  viewMode,
}: {
  familyName: string
  composableOffers: PriceTableOffer[]
  atomicOffers: PriceTableOffer[]
  treatments: { id: string; nome: string }[]
  compatibilityMap: Map<string, Map<string, { specialPrice: number | null; priceMode: 'final' | 'surcharge' }>>
  gridSummaryByOffer: Map<string, OfferGridSummary>
  viewMode: ViewMode
}) {
  const [isOpen, setIsOpen] = useState(false)

  // Group composable by section
  const sections = useMemo(() => {
    const map = new Map<string, PriceTableOffer[]>()
    for (const offer of composableOffers) {
      const key = offer.sectionName || 'Geral'
      const list = map.get(key) || []
      list.push(offer)
      map.set(key, list)
    }
    return map
  }, [composableOffers])

  const totalOffers = composableOffers.length + atomicOffers.length

  return (
    <div className="rounded-3xl border border-white/8 bg-slate-900/60 backdrop-blur-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-6 py-5 text-left transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
            <Layers3 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-tight text-white">{familyName}</h3>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              {totalOffers} {totalOffers === 1 ? 'oferta' : 'ofertas'}
              {atomicOffers.length > 0 && ` • ${atomicOffers.length} fechada${atomicOffers.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        {isOpen ? (
          <ChevronDown className="h-5 w-5 text-slate-500" />
        ) : (
          <ChevronRight className="h-5 w-5 text-slate-500" />
        )}
      </button>

      {isOpen && (
        <div className="space-y-6 px-6 pb-6">
          {/* Composable: Matrix or List */}
          {composableOffers.length > 0 && (
            <>
              {viewMode === 'matrix' ? (
                Array.from(sections.entries()).map(([sectionName, sectionOffers]) => (
                  <div key={sectionName}>
                    {sections.size > 1 && (
                      <p className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                        {sectionName}
                      </p>
                    )}
                    <MatrixTable
                      offers={sectionOffers}
                      treatments={treatments}
                      compatibilityMap={compatibilityMap}
                      gridSummaryByOffer={gridSummaryByOffer}
                    />
                  </div>
                ))
              ) : (
                <div className="space-y-2">
                  {composableOffers.map((offer) => {
                    const offerCompat = compatibilityMap.get(offer.globalOfferId)
                    const prices = offerCompat
                      ? Array.from(offerCompat.values()).map((c) => resolvePrice(offer, c))
                      : []
                    if (offer.basePrice != null) {
                      prices.unshift(offer.basePrice)
                    }
                    const validPrices = prices.filter((p): p is number => p != null)
                    const minPrice = validPrices.length ? Math.min(...validPrices) : null
                    const maxPrice = validPrices.length ? Math.max(...validPrices) : null

                    return (
                      <div
                        key={offer.globalOfferId}
                        className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-bold text-white">{getOfferLabel(offer)}</p>
                          <p className="text-[10px] text-slate-500">
                            {[
                              offer.material,
                              offer.indiceRefracao ? `Índice ${offer.indiceRefracao}` : null,
                              offer.sectionName,
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </p>
                          {(() => {
                            const summary = gridSummaryByOffer.get(offer.globalOfferId)
                            const sph = formatRange(summary?.sphMin ?? null, summary?.sphMax ?? null)
                            const cyl = formatRange(summary?.cylMin ?? null, summary?.cylMax ?? null)
                            const add = formatRange(summary?.addMin ?? null, summary?.addMax ?? null)
                            const diameter = extractDiameter(summary?.metadata || null)
                            const items = [
                              sph ? `Sph ${sph}` : null,
                              cyl ? `Cyl ${cyl}` : null,
                              add ? `Add ${add}` : null,
                              diameter ? `Ø ${diameter}` : null,
                            ].filter(Boolean)
                            return items.length ? (
                              <p className="mt-1 text-[10px] text-slate-500">{items.join(' â€¢ ')}</p>
                            ) : null
                          })()}
                        </div>
                        <div className="text-right">
                          {minPrice != null && maxPrice != null && minPrice !== maxPrice ? (
                            <>
                              <p className="text-xs text-slate-400">
                                {formatCurrency(minPrice)} – {formatCurrency(maxPrice)}
                              </p>
                            </>
                          ) : (
                            <p className="font-mono text-sm font-bold text-white">
                              {formatCurrency(minPrice)}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* Atomic offers */}
          {atomicOffers.length > 0 && (
            <div className="space-y-2">
              {composableOffers.length > 0 && (
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-400/80">
                  Ofertas Fechadas
                </p>
              )}
              {atomicOffers.map((offer) => (
                <AtomicOfferCard key={offer.globalOfferId} offer={offer} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PriceTableInterface({
  data,
  embedded = false,
  initialFilters,
}: {
  data: PriceTableData
  embedded?: boolean
  initialFilters?: InitialFilters
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('matrix')
  const [search, setSearch] = useState(initialFilters?.search || '')
  const [showFilters, setShowFilters] = useState(false)
  const [clinicalFilter, setClinicalFilter] = useState<string | null>(
    initialFilters?.clinicalFilter || null,
  )
  const [materialFilter, setMaterialFilter] = useState<string | null>(
    initialFilters?.materialFilter || null,
  )
  const [indiceFilter, setIndiceFilter] = useState<number | null>(
    initialFilters?.indiceFilter ?? null,
  )
  const [featureFilter, setFeatureFilter] = useState<string[]>(initialFilters?.featureFilter || [])
  const [sectionFilter, setSectionFilter] = useState<string | null>(
    initialFilters?.sectionFilter || null,
  )

  // Build compatibility lookup: offerId -> treatmentId -> compat
  const compatibilityMap = useMemo(() => {
    const map = new Map<string, Map<string, { specialPrice: number | null; priceMode: 'final' | 'surcharge' }>>()
    for (const c of data.compatibilities) {
      let offerMap = map.get(c.offerId)
      if (!offerMap) {
        offerMap = new Map()
        map.set(c.offerId, offerMap)
      }
      offerMap.set(c.treatmentId, { specialPrice: c.specialPrice, priceMode: c.priceMode })
    }
    return map
  }, [data.compatibilities])

  const gridSummaryByOffer = useMemo(() => {
    const map = new Map<string, OfferGridSummary>()
    for (const grid of data.grids) {
      const current = map.get(grid.offerId)
      if (!current) {
        map.set(grid.offerId, {
          sphMin: grid.sphMin,
          sphMax: grid.sphMax,
          cylMin: grid.cylMin,
          cylMax: grid.cylMax,
          addMin: grid.addMin,
          addMax: grid.addMax,
          metadata: grid.metadata || null,
        })
        continue
      }
      current.sphMin = mergeMin(current.sphMin, grid.sphMin)
      current.sphMax = mergeMax(current.sphMax, grid.sphMax)
      current.cylMin = mergeMin(current.cylMin, grid.cylMin)
      current.cylMax = mergeMax(current.cylMax, grid.cylMax)
      current.addMin = mergeMin(current.addMin, grid.addMin)
      current.addMax = mergeMax(current.addMax, grid.addMax)
      if (!current.metadata && grid.metadata) current.metadata = grid.metadata
    }
    return map
  }, [data.grids])

  const familyMap = useMemo(() => new Map(data.families.map((f) => [f.id, f])), [data.families])
  const treatmentById = useMemo(
    () => new Map(data.treatments.map((t) => [t.id, t])),
    [data.treatments],
  )

  const semanticTagsByOfferId = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const compat of data.compatibilities) {
      const treatment = treatmentById.get(compat.treatmentId)
      if (!treatment) continue
      const tags = extractSemanticTags(treatment.features || null)
      if (!tags.length) continue
      let set = map.get(compat.offerId)
      if (!set) {
        set = new Set()
        map.set(compat.offerId, set)
      }
      for (const tag of tags) set.add(tag)
    }
    return map
  }, [data.compatibilities, treatmentById])

  const offerHasFeature = (offer: PriceTableOffer, feature: string) => {
    const feat = offer.features as Record<string, unknown>
    if (feat?.[feature]) return true
    const semanticTags = semanticTagsByOfferId.get(offer.globalOfferId)
    return Boolean(semanticTags?.has(feature))
  }

  // Extract unique filter values
  const filterOptions = useMemo(() => {
    const clinicals = new Set<string>()
    const materials = new Set<string>()
    const indices = new Set<number>()
    const features = new Set<string>()
    const sections = new Set<string>()

    const term = search.trim().toLowerCase()
    const matchesBase = (
      offer: PriceTableOffer,
      opts: { ignoreMaterial?: boolean; ignoreIndice?: boolean; ignoreFeature?: boolean } = {},
    ) => {
      if (term) {
        const label = getOfferLabel(offer).toLowerCase()
        const familyName = familyMap.get(offer.familyId)?.nome?.toLowerCase() || ''
        if (!label.includes(term) && !familyName.includes(term)) return false
      }
      if (clinicalFilter && offer.clinicalCategory !== clinicalFilter) return false
      if (!opts.ignoreFeature && featureFilter.length > 0) {
        if (!featureFilter.every((key) => offerHasFeature(offer, key))) return false
      }
      if (!opts.ignoreMaterial && materialFilter && offer.material !== materialFilter) return false
      if (!opts.ignoreIndice && indiceFilter && offer.indiceRefracao !== indiceFilter) return false
      if (sectionFilter && offer.sectionName !== sectionFilter) return false
      return true
    }

    for (const offer of data.offers) {
      if (!matchesBase(offer)) continue

      if (offer.clinicalCategory && offer.clinicalCategory !== 'indefinida') {
        clinicals.add(offer.clinicalCategory)
      }
      if (offer.sectionName) sections.add(offer.sectionName)

    }

    for (const offer of data.offers) {
      if (!matchesBase(offer, { ignoreFeature: true })) continue
      const feat = offer.features || {}
      for (const [key, val] of Object.entries(feat)) {
        if (val === true) features.add(key)
      }
      const semanticTags = semanticTagsByOfferId.get(offer.globalOfferId)
      if (semanticTags) {
        for (const tag of semanticTags) {
          features.add(tag)
        }
      }
    }

    for (const offer of data.offers) {
      if (!matchesBase(offer, { ignoreMaterial: true })) continue
      if (offer.material) materials.add(offer.material)
    }

    for (const offer of data.offers) {
      if (!matchesBase(offer, { ignoreIndice: true })) continue
      if (offer.indiceRefracao) indices.add(offer.indiceRefracao)
    }

    return {
      clinicals: Array.from(clinicals).sort(),
      materials: Array.from(materials).sort(),
      indices: Array.from(indices).sort((a, b) => a - b),
      features: Array.from(features).sort(),
      sections: Array.from(sections).sort(),
    }
  }, [
    clinicalFilter,
    data.offers,
    familyMap,
    featureFilter,
    indiceFilter,
    materialFilter,
    search,
    sectionFilter,
  ])

  // Filter offers
  const filteredOffers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return data.offers.filter((offer) => {
      if (term) {
        const label = getOfferLabel(offer).toLowerCase()
        const familyName = familyMap.get(offer.familyId)?.nome?.toLowerCase() || ''
        if (!label.includes(term) && !familyName.includes(term)) return false
      }
      if (clinicalFilter && offer.clinicalCategory !== clinicalFilter) return false
      if (materialFilter && offer.material !== materialFilter) return false
      if (indiceFilter && offer.indiceRefracao !== indiceFilter) return false
      if (featureFilter.length > 0) {
        if (!featureFilter.every((key) => offerHasFeature(offer, key))) return false
      }
      if (sectionFilter && offer.sectionName !== sectionFilter) return false
      return true
    })
  }, [
    data.offers,
    familyMap,
    search,
    clinicalFilter,
    materialFilter,
    indiceFilter,
    featureFilter,
    sectionFilter,
    semanticTagsByOfferId,
  ])

  // Group by family
  const familyGroups = useMemo(() => {
    const groups = new Map<string, { family: { id: string; nome: string }; composable: PriceTableOffer[]; atomic: PriceTableOffer[] }>()

    for (const offer of filteredOffers) {
      const family = familyMap.get(offer.familyId)
      if (!family) continue

      let group = groups.get(family.id)
      if (!group) {
        group = { family, composable: [], atomic: [] }
        groups.set(family.id, group)
      }

      if (offer.isAtomicOffer || !offer.allowsComposition) {
        group.atomic.push(offer)
      } else {
        group.composable.push(offer)
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.family.nome.localeCompare(b.family.nome))
  }, [filteredOffers, data.families])

  const activeFilterCount = [
    clinicalFilter,
    materialFilter,
    indiceFilter,
    sectionFilter,
    featureFilter.length > 0 ? 'feature' : null,
  ]
    .filter(Boolean)
    .length

  const clearFilters = () => {
    setClinicalFilter(null)
    setMaterialFilter(null)
    setIndiceFilter(null)
    setFeatureFilter([])
    setSectionFilter(null)
    setSearch('')
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

  const activeQueryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('scope', 'laboratorio')
    params.set('versionId', data.versionId)
    if (search.trim()) params.set('q', search.trim())
    if (clinicalFilter) params.set('clinical', clinicalFilter)
    if (materialFilter) params.set('material', materialFilter)
    if (indiceFilter != null) params.set('indice', String(indiceFilter))
    if (featureFilter.length > 0) params.set('feature', featureFilter.join(','))
    if (sectionFilter) params.set('section', sectionFilter)
    return params.toString()
  }, [
    clinicalFilter,
    data.versionId,
    featureFilter,
    indiceFilter,
    materialFilter,
    search,
    sectionFilter,
  ])

  return (
    <div className={embedded ? 'text-white' : 'min-h-screen bg-slate-950 text-white'}>
      <div
        className={
          embedded
            ? 'flex w-full flex-col gap-6'
            : 'mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8'
        }
      >
        {data.activeCatalogs.length > 1 && (
          <div className="rounded-2xl border border-white/10 bg-slate-900/45 px-4 py-4 backdrop-blur-md sm:px-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                  Alternar tabela
                </p>
                <p className="hidden text-xs text-slate-500">
                  Escolha qual fornecedor/versão deseja consultar agora. A avaliação e a IA
                  continuam usando o catálogo ativo principal até a próxima etapa.
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-300">
                  Escolha o laboratorio desta consulta
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.activeCatalogs.map((catalog) => {
                  const isSelected = catalog.versionId === data.versionId
                  return (
                    <Link
                      key={catalog.versionId}
                      href={`/dashboard/loja/${data.storeId}/tabela-precos?${(() => {
                        const params = new URLSearchParams(activeQueryString)
                        params.set('versionId', catalog.versionId)
                        return params.toString()
                      })()}`}
                      className={`inline-flex rounded-2xl border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition-all ${
                        isSelected
                          ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-200'
                          : 'border-white/10 bg-black/10 text-slate-400 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      {catalog.laboratorio} • {catalog.versao}
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950/30 p-6 shadow-[0_25px_80px_rgba(2,6,23,0.45)] sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-cyan-300/80">
                Tabela de Preços
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
                {data.laboratorio}
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Versão <span className="font-bold text-slate-200">{data.versao}</span> •{' '}
                {data.offers.length} ofertas • {data.treatments.length} tratamentos
              </p>
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-1 rounded-2xl border border-white/8 bg-black/10 p-1">
              <button
                onClick={() => setViewMode('matrix')}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition-all ${
                  viewMode === 'matrix'
                    ? 'bg-cyan-500/12 text-cyan-200'
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
                Matriz
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition-all ${
                  viewMode === 'list'
                    ? 'bg-cyan-500/12 text-cyan-200'
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                <List className="h-4 w-4" />
                Lista
              </button>
            </div>
          </div>
        </div>

        {/* Search + Filter Bar */}
        <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-md sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por família ou oferta..."
                className="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
                showFilters || activeFilterCount
                  ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
                  : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
              }`}
            >
              {showFilters ? <ChevronUp className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
              Filtros
              {activeFilterCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-black text-slate-950">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 transition hover:text-red-300"
              >
                <X className="h-3 w-3" />
                Limpar
              </button>
            )}
          </div>

          {/* Filter chips */}
          {showFilters && (
            <div className="space-y-3 border-t border-white/8 pt-4">
              {/* Clinical */}
              {filterOptions.clinicals.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Categoria Clínica
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.clinicals.map((cat) => (
                      <FilterPill
                        key={cat}
                        label={getClinicalLabel(cat)}
                        active={clinicalFilter === cat}
                        onClick={() => setClinicalFilter(clinicalFilter === cat ? null : cat)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Material */}
              {filterOptions.materials.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Material
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.materials.map((mat) => (
                      <FilterPill
                        key={mat}
                        label={mat}
                        active={materialFilter === mat}
                        onClick={() => setMaterialFilter(materialFilter === mat ? null : mat)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Índice de Refração */}
              {filterOptions.indices.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Índice de Refração
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.indices.map((idx) => (
                      <FilterPill
                        key={idx}
                        label={String(idx)}
                        active={indiceFilter === idx}
                        onClick={() => setIndiceFilter(indiceFilter === idx ? null : idx)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Features */}
              {filterOptions.features.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Features
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.features.map((feat) => (
                      <FilterPill
                        key={feat}
                        label={formatFeatureLabel(feat)}
                        active={featureFilter.includes(feat)}
                        onClick={() =>
                          setFeatureFilter((current) =>
                            current.includes(feat)
                              ? current.filter((item) => item !== feat)
                              : [...current, feat],
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Section */}
              {filterOptions.sections.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Seção
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.sections.map((sec) => (
                      <FilterPill
                        key={sec}
                        label={sec}
                        active={sectionFilter === sec}
                        onClick={() => setSectionFilter(sectionFilter === sec ? null : sec)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Results count */}
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          {familyGroups.length} {familyGroups.length === 1 ? 'família' : 'famílias'} •{' '}
          {filteredOffers.length} {filteredOffers.length === 1 ? 'oferta' : 'ofertas'}
        </p>

        {/* Family sections */}
        <div className="space-y-6">
          {familyGroups.map((group) => (
            <FamilySection
              key={group.family.id}
              familyName={group.family.nome}
              composableOffers={group.composable}
              atomicOffers={group.atomic}
              treatments={data.treatments}
              compatibilityMap={compatibilityMap}
              gridSummaryByOffer={gridSummaryByOffer}
              viewMode={viewMode}
            />
          ))}

          {!familyGroups.length && (
            <div className="rounded-3xl border border-dashed border-white/10 bg-slate-900/50 px-6 py-16 text-center">
              <Tag className="mx-auto mb-3 h-10 w-10 text-slate-600" />
              <p className="text-lg font-bold text-slate-400">Nenhuma oferta encontrada</p>
              <p className="mt-1 text-sm text-slate-500">
                Ajuste os filtros ou a busca para ver resultados.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
