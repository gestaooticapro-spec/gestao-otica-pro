'use client'

import { useState, useEffect } from 'react'
import {
    X, Search, PackageOpen, AlertTriangle, Loader2
} from 'lucide-react'
import { getDivergenciasGaveta } from '@/lib/actions/stock.actions'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Props {
    storeId: number
    isOpen: boolean
    onClose: () => void
}

const formatDeg = (val: number | null) => {
    if (val === null || val === undefined) return '-'
    if (val === 0) return '0.00'
    return val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)
}

export default function LensDivergenceDrawer({ storeId, isOpen, onClose }: Props) {
    const [isLoading, setIsLoading] = useState(false)
    const [perdas, setPerdas] = useState<any[]>([])
    const [sobras, setSobras] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [activeTab, setActiveTab] = useState<'sobras' | 'perdas'>('sobras')

    useEffect(() => {
        if (isOpen) {
            fetchData()
        }
    }, [isOpen])

    const fetchData = async () => {
        setIsLoading(true)
        try {
            const data = await getDivergenciasGaveta(storeId)
            setPerdas(data.perdas)
            setSobras(data.sobras)
        } catch (error) {
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const filteredPerdas = perdas.filter(p => {
        if (!searchTerm) return true
        const search = searchTerm.toLowerCase()
        const prodMatch = p.products?.nome?.toLowerCase().includes(search)
        const marcaMatch = p.products?.marca?.toLowerCase().includes(search)
        const descMatch = p.motivo?.toLowerCase().includes(search)
        const varMatch = p.product_variants ? (
            p.product_variants.esferico?.toString().includes(search) ||
            p.product_variants.cilindrico?.toString().includes(search) ||
            p.product_variants.nome_variante?.toLowerCase().includes(search)
        ) : false
        return prodMatch || marcaMatch || descMatch || varMatch
    })

    const filteredSobras = sobras.filter(s => {
        if (!searchTerm) return true
        const search = searchTerm.toLowerCase()
        const prodMatch = s.products?.nome?.toLowerCase().includes(search)
        const marcaMatch = s.products?.marca?.toLowerCase().includes(search)
        const varMatch = (
            s.esferico?.toString().includes(search) ||
            s.cilindrico?.toString().includes(search) ||
            s.nome_variante?.toLowerCase().includes(search)
        )
        return prodMatch || marcaMatch || varMatch
    })

    if (!isOpen) return null

    return (
        <>
            {/* Overlay */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed top-0 right-0 h-full w-[820px] max-w-[95vw] bg-slate-900 shadow-2xl z-50 transform transition-transform border-l border-white/10 flex flex-col">
                
                {/* Header */}
                <div className="bg-gradient-to-br from-amber-500/10 to-orange-600/10 p-5 border-b border-white/10 flex-shrink-0">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-lg font-black text-amber-400 flex items-center gap-2">
                            <PackageOpen className="h-5 w-5" /> Auditar Gaveta de Lentes
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por grau (-2.00), marca, nome..."
                            className="w-full bg-black/30 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                        />
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 bg-slate-900 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('sobras')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors border-b-2 ${
                            activeTab === 'sobras'
                                ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                                : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
                        }`}
                    >
                        <PackageOpen className="h-4 w-4" />
                        Sobras ({filteredSobras.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('perdas')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors border-b-2 ${
                            activeTab === 'perdas'
                                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                                : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
                        }`}
                    >
                        <AlertTriangle className="h-4 w-4" />
                        Perdas ({filteredPerdas.length})
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-950/50">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                            <p className="text-xs font-bold uppercase tracking-widest">Carregando dados da gaveta...</p>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'sobras' && (
                                filteredSobras.length === 0 ? (
                                    <div className="text-center py-10 text-slate-500">
                                        <PackageOpen className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                        <p className="text-sm">Nenhuma sobra encontrada.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left min-w-max">
                                            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10">
                                                <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5">
                                                    <th className="px-3 py-2.5">Marca</th>
                                                    <th className="px-3 py-2.5">Modelo</th>
                                                    <th className="px-3 py-2.5 text-center">Olho</th>
                                                    <th className="px-3 py-2.5 text-center">Diam</th>
                                                    <th className="px-3 py-2.5 text-center">Esf</th>
                                                    <th className="px-3 py-2.5 text-center">Cil</th>
                                                    <th className="px-3 py-2.5 text-center">Eixo</th>
                                                    <th className="px-3 py-2.5 text-center">Ad</th>
                                                    <th className="px-3 py-2.5 text-center">Qtd</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredSobras.map((s) => (
                                                    <tr key={s.id} className="border-b border-white/5 hover:bg-sky-500/5 transition-colors text-xs">
                                                        <td className="px-3 py-2 text-sky-400 font-bold whitespace-nowrap">{s.products?.marca || '-'}</td>
                                                        <td className="px-3 py-2 text-slate-200 whitespace-nowrap max-w-[140px] truncate">{s.products?.nome || '-'}</td>
                                                        <td className="px-3 py-2 text-center text-slate-300">{s.olho && s.olho !== 'AMBOS' ? s.olho : '-'}</td>
                                                        <td className="px-3 py-2 text-center text-slate-300 font-mono">{s.diametro || '-'}</td>
                                                        <td className="px-3 py-2 text-center text-slate-200 font-mono font-bold">{formatDeg(s.esferico)}</td>
                                                        <td className="px-3 py-2 text-center text-slate-200 font-mono font-bold">{formatDeg(s.cilindrico)}</td>
                                                        <td className="px-3 py-2 text-center text-slate-300 font-mono">{s.eixo !== null && s.eixo !== undefined ? `${s.eixo}°` : '-'}</td>
                                                        <td className="px-3 py-2 text-center text-slate-300 font-mono">{formatDeg(s.adicao)}</td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className="bg-sky-500/15 text-sky-400 px-2 py-0.5 rounded-md text-[10px] font-bold border border-sky-500/20">
                                                                {s.estoque_atual}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            )}

                            {activeTab === 'perdas' && (
                                filteredPerdas.length === 0 ? (
                                    <div className="text-center py-10 text-slate-500">
                                        <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                        <p className="text-sm">Nenhuma perda encontrada.</p>
                                    </div>
                                ) : (
                                    filteredPerdas.map((p) => {
                                        const v = p.product_variants
                                        return (
                                            <div key={p.id} className="bg-slate-900 border-b border-white/5 p-3 hover:bg-amber-500/5 transition-colors group">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="text-xs font-bold text-amber-400 group-hover:text-amber-300 transition-colors">
                                                        {p.products?.marca ? `${p.products.marca} — ` : ''}{p.products?.nome || 'Produto Desconhecido'}
                                                    </h4>
                                                    <span className="text-[9px] text-slate-500">
                                                        {format(new Date(p.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                                                    </span>
                                                </div>
                                                
                                                {v && (
                                                   <div className="flex gap-2 flex-wrap mb-2 text-[10px]">
                                                        <span className="px-1.5 py-0.5 rounded bg-black/40 text-slate-300 font-mono">
                                                            Esf: {formatDeg(v.esferico)}
                                                        </span>
                                                        <span className="px-1.5 py-0.5 rounded bg-black/40 text-slate-300 font-mono">
                                                            Cil: {formatDeg(v.cilindrico)}
                                                        </span>
                                                        {v.eixo !== null && v.eixo !== undefined && (
                                                            <span className="px-1.5 py-0.5 rounded bg-black/40 text-slate-300 font-mono">
                                                                Eixo: {v.eixo}°
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="text-[10px] text-slate-400 bg-white/5 p-2 rounded-lg border border-white/5">
                                                    <span className="text-amber-500/70 font-bold">Motivo:</span> {p.motivo}
                                                </div>
                                            </div>
                                        )
                                    })
                                )
                            )}
                        </>
                    )}
                </div>
            </div>
        </>
    )
}
