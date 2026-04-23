'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Grid3X3, Loader2, X } from 'lucide-react'
import {
    LensProductSimple,
    LensVariantGrade,
    getLensGradeVariants,
    getLensProductsWithGrade
} from '@/lib/actions/lab.actions'

type Props = {
    isOpen: boolean
    onClose: () => void
    storeId: number
}

function formatEsf(value: number): string {
    const sign = value > 0 ? '+' : value < 0 ? '' : ''
    return `${sign}${value.toFixed(2)}`
}

export default function LensGradeMonitorModal({ isOpen, onClose, storeId }: Props) {
    const [mounted, setMounted] = useState(false)
    const [products, setProducts] = useState<LensProductSimple[]>([])
    const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
    const [variants, setVariants] = useState<LensVariantGrade[]>([])
    const [loadingProducts, setLoadingProducts] = useState(false)
    const [loadingGrid, setLoadingGrid] = useState(false)
    const [activeTab, setActiveTab] = useState<'negativo' | 'positivo'>('negativo')

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!isOpen) return
        setLoadingProducts(true)
        getLensProductsWithGrade(storeId).then((data) => {
            setProducts(data)
            setLoadingProducts(false)
        })
    }, [isOpen, storeId])

    useEffect(() => {
        if (!selectedProductId) {
            setVariants([])
            return
        }
        setLoadingGrid(true)
        getLensGradeVariants(selectedProductId, storeId).then((data) => {
            setVariants(data)
            setLoadingGrid(false)
        })
    }, [selectedProductId, storeId])

    const { negativos, positivos, cylinders } = useMemo(() => {
        if (!variants.length) return { negativos: [], positivos: [], cylinders: [] }

        const cylSet = new Set<number>()
        variants.forEach((v) => cylSet.add(v.cilindrico))
        const cylinders = Array.from(cylSet).sort((a, b) => b - a)

        const variantMap: Record<string, LensVariantGrade> = {}
        variants.forEach((v) => { variantMap[`${v.esferico}_${v.cilindrico}`] = v })

        const esfSet = new Set<number>()
        variants.forEach((v) => esfSet.add(v.esferico))

        const allEsfs = Array.from(esfSet)
        // negativos: 0.00 primeiro, depois -0.25, -0.50 ... (descendente do zero)
        const negativos = allEsfs.filter((e) => e <= 0).sort((a, b) => b - a)
        // positivos: +0.25, +0.50 ... (ascendente)
        const positivos = allEsfs.filter((e) => e > 0).sort((a, b) => a - b)

        return { negativos, positivos, cylinders }
    }, [variants])

    const variantMap = useMemo(() => {
        const map: Record<string, LensVariantGrade> = {}
        variants.forEach((v) => { map[`${v.esferico}_${v.cilindrico}`] = v })
        return map
    }, [variants])

    const currentRows = activeTab === 'negativo' ? negativos : positivos

    if (!mounted || !isOpen) return null

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full max-w-5xl max-h-[90vh] flex flex-col bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between gap-4 p-5 border-b border-white/10 bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                            <Grid3X3 className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Acompanhamento de Grade</h2>
                            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
                                Estoque atual por esférico e cilíndrico
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Product Select */}
                <div className="p-5 border-b border-white/10 bg-slate-900/50">
                    {loadingProducts ? (
                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Carregando lentes...
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 shrink-0">
                                Selecionar lente:
                            </label>
                            <select
                                value={selectedProductId ?? ''}
                                onChange={(e) => {
                                    const val = e.target.value
                                    setSelectedProductId(val ? Number(val) : null)
                                    setActiveTab('negativo')
                                }}
                                className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/30"
                            >
                                <option value="">-- Escolha uma lente --</option>
                                {products.map((p) => (
                                    <option key={p.id} value={p.id}>{p.nome}</option>
                                ))}
                            </select>
                            {products.length === 0 && (
                                <span className="text-xs text-slate-500 italic">Nenhuma lente com grade cadastrada.</span>
                            )}
                        </div>
                    )}
                </div>

                {/* Grade content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {!selectedProductId ? (
                        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm font-medium p-8">
                            Selecione uma lente para ver o estoque da grade.
                        </div>
                    ) : loadingGrid ? (
                        <div className="flex-1 flex items-center justify-center gap-2 text-slate-400">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-sm">Carregando grade...</span>
                        </div>
                    ) : variants.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm font-medium p-8">
                            Nenhuma variante com grade encontrada para este produto.
                        </div>
                    ) : (
                        <>
                            {/* Tabs */}
                            <div className="flex border-b border-white/10 px-5 gap-2 bg-slate-900/30 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('negativo')}
                                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'negativo' ? 'border-sky-400 text-sky-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                                >
                                    Esférico Negativo ({negativos.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('positivo')}
                                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'positivo' ? 'border-amber-400 text-amber-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                                >
                                    Esférico Positivo ({positivos.length})
                                </button>
                            </div>

                            {/* Grid table */}
                            <div className="flex-1 overflow-auto p-4">
                                {currentRows.length === 0 ? (
                                    <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
                                        Nenhuma lente {activeTab === 'negativo' ? 'negativa' : 'positiva'} nesta grade.
                                    </div>
                                ) : (
                                    <table className="w-full border-collapse text-xs">
                                        <thead>
                                            <tr>
                                                <th className="sticky left-0 z-10 bg-slate-800 px-3 py-2 text-left font-bold text-slate-300 border border-white/10 min-w-[70px]">
                                                    ESF \ CIL
                                                </th>
                                                {cylinders.map((cyl) => (
                                                    <th
                                                        key={cyl}
                                                        className="px-2 py-2 font-bold text-slate-300 border border-white/10 text-center bg-slate-800 min-w-[52px]"
                                                    >
                                                        {formatEsf(cyl)}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {currentRows.map((esf) => (
                                                <tr key={esf}>
                                                    <td className="sticky left-0 z-10 bg-slate-800/90 px-3 py-2 font-bold text-slate-200 border border-white/10 text-right">
                                                        {formatEsf(esf)}
                                                    </td>
                                                    {cylinders.map((cyl) => {
                                                        const variant = variantMap[`${esf}_${cyl}`]
                                                        const stock = variant?.estoque_atual ?? null
                                                        const isEmpty = stock === null
                                                        const isZero = stock === 0
                                                        return (
                                                            <td
                                                                key={cyl}
                                                                className={`px-2 py-2 text-center border border-white/10 font-bold transition-colors ${isEmpty ? 'bg-slate-900/50 text-slate-700' : isZero ? 'bg-rose-950/40 text-rose-400' : stock <= 2 ? 'bg-amber-950/40 text-amber-300' : 'bg-emerald-950/40 text-emerald-300'}`}
                                                            >
                                                                {isEmpty ? '–' : stock}
                                                            </td>
                                                        )
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Legend */}
                            <div className="shrink-0 px-5 py-3 border-t border-white/10 flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded bg-emerald-950/70 border border-emerald-500/30 inline-block" />
                                    Com estoque
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded bg-amber-950/70 border border-amber-500/30 inline-block" />
                                    Estoque baixo (≤2)
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded bg-rose-950/70 border border-rose-500/30 inline-block" />
                                    Zerado
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded bg-slate-900/70 border border-white/10 inline-block" />
                                    Não cadastrado
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    )
}
