'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { X, Loader2, AlertTriangle, RefreshCw, Grid3X3 } from 'lucide-react'
import { getLensGrid, generateLensGrid, updateLensGridStock } from '@/lib/actions/catalog.actions'

type LensGridEditorProps = {
    isOpen: boolean
    onClose: () => void
    productId: number
    storeId: number
    productName: string
}

type Variant = {
    id: number
    esferico: number
    cilindrico: number
    estoque_atual: number
}

export default function LensGridEditor({ isOpen, onClose, productId, storeId, productName }: LensGridEditorProps) {
    const [loading, setLoading] = useState(false)
    const [variants, setVariants] = useState<Variant[]>([])
    const [generating, setGenerating] = useState(false)

    // Estados para Geração
    const [genParams, setGenParams] = useState({
        minEsf: -4.00, maxEsf: 4.00,
        minCyl: -2.00, maxCyl: 0.00
    })

    const loadGrid = useCallback(async () => {
        setLoading(true)
        const data = await getLensGrid(productId, storeId)
        setVariants((data as Variant[]) || [])
        setLoading(false)
    }, [productId, storeId])

    useEffect(() => {
        if (isOpen && productId) {
            loadGrid()
        }
    }, [isOpen, productId, loadGrid])

    const handleGenerate = async () => {
        setGenerating(true)
        const res = await generateLensGrid({
            productId, storeId, ...genParams
        })

        if (res.success) {
            await loadGrid()
        } else {
            alert(res.message)
        }
        setGenerating(false)
    }

    // --- LÓGICA DA MATRIZ ---
    // 1. Extrair Eixos Únicos
    const { sphericals, cylinders, matrix } = useMemo(() => {
        if (!variants.length) return { sphericals: [], cylinders: [], matrix: {} }

        const esfs = new Set<number>()
        const cyls = new Set<number>()
        const map: Record<string, Variant> = {}

        variants.forEach(v => {
            esfs.add(v.esferico)
            cyls.add(v.cilindrico)
            map[`${v.esferico}_${v.cilindrico}`] = v
        })

        return {
            sphericals: Array.from(esfs).sort((a, b) => a - b),
            cylinders: Array.from(cyls).sort((a, b) => b - a),
            matrix: map
        }
    }, [variants])

    // --- UPDATE CÉLULA ---
    const handleStockChange = async (variantId: number, newStock: number) => {
        // Otimista: Atualiza local primeiro
        setVariants(prev => prev.map(v => v.id === variantId ? { ...v, estoque_atual: newStock } : v))

        // Envia pro servidor (debounce idealmente, mas aqui vai direto por enquanto)
        const res = await updateLensGridStock(variantId, newStock, "Ajuste Manual na Grade")
        if (!res.success) {
            alert("Erro ao salvar estoque: " + res.message)
            loadGrid() // Reverte
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

                {/* HEADER */}
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                            <Grid3X3 className="h-5 w-5 text-blue-600" /> Grade de Lentes
                        </h3>
                        <p className="text-sm text-slate-500 font-medium">{productName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="h-6 w-6 text-slate-400" />
                    </button>
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-hidden flex flex-col relative">
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                        </div>
                    ) : variants.length === 0 ? (
                        // --- TELA DE GERAÇÃO ---
                        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8">
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-lg w-full text-center">
                                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                                    <RefreshCw className="h-8 w-8" />
                                </div>
                                <h4 className="text-xl font-bold text-slate-800 mb-2">Gerar Grade Inicial</h4>
                                <p className="text-slate-500 mb-6 text-sm">Este produto ainda não possui variações. Defina os intervalos para criar a grade.</p>

                                <div className="grid grid-cols-2 gap-4 text-left mb-6">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">Esférico (Min / Max)</label>
                                        <div className="flex gap-2 mt-1">
                                            <input type="number" step="0.25" value={genParams.minEsf} onChange={e => setGenParams({ ...genParams, minEsf: Number(e.target.value) })} className="w-full border-slate-300 rounded-lg font-bold text-sm" />
                                            <input type="number" step="0.25" value={genParams.maxEsf} onChange={e => setGenParams({ ...genParams, maxEsf: Number(e.target.value) })} className="w-full border-slate-300 rounded-lg font-bold text-sm" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">Cilíndrico (Min / Max)</label>
                                        <div className="flex gap-2 mt-1">
                                            <input type="number" step="0.25" value={genParams.minCyl} onChange={e => setGenParams({ ...genParams, minCyl: Number(e.target.value) })} className="w-full border-slate-300 rounded-lg font-bold text-sm" />
                                            <input type="number" step="0.25" value={genParams.maxCyl} onChange={e => setGenParams({ ...genParams, maxCyl: Number(e.target.value) })} className="w-full border-slate-300 rounded-lg font-bold text-sm" />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleGenerate}
                                    disabled={generating}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
                                >
                                    {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Gerar Grade Agora'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        // --- MATRIZ DE ESTOQUE ---
                        <div className="flex-1 overflow-auto custom-scrollbar p-4 bg-slate-100">
                            <div className="inline-block min-w-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <table className="w-full text-center border-collapse">
                                    <thead>
                                        <tr>
                                            <th className="p-3 bg-slate-50 border-b border-r border-slate-200 text-xs font-bold text-slate-500 uppercase sticky left-0 top-0 z-20">
                                                Esf \ Cyl
                                            </th>
                                            {cylinders.map(cyl => (
                                                <th key={cyl} className="p-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 min-w-[60px] sticky top-0 z-10">
                                                    {cyl.toFixed(2)}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sphericals.map(esf => (
                                            <tr key={esf} className="hover:bg-blue-50/50 transition-colors">
                                                <td className="p-2 bg-slate-50 border-r border-slate-200 text-xs font-bold text-slate-700 sticky left-0 z-10">
                                                    {esf.toFixed(2)}
                                                </td>
                                                {cylinders.map(cyl => {
                                                    const variant = matrix[`${esf}_${cyl}`]
                                                    return (
                                                        <td key={`${esf}_${cyl}`} className="p-1 border border-slate-100">
                                                            {variant ? (
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    className={`w-full text-center text-xs font-bold bg-transparent border-none focus:ring-0 p-1 rounded
                                                                        ${variant.estoque_atual > 0 ? 'text-blue-700' : 'text-slate-300'}
                                                                    `}
                                                                    value={variant.estoque_atual}
                                                                    onChange={(e) => handleStockChange(variant.id, parseInt(e.target.value) || 0)}
                                                                />
                                                            ) : (
                                                                <span className="text-slate-200 text-[10px]">-</span>
                                                            )}
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* FOOTER */}
                <div className="bg-white border-t border-slate-200 p-4 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <span>Alterações são salvas automaticamente.</span>
                    </div>
                    <button onClick={onClose} className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    )
}
