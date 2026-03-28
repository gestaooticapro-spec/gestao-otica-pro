'use client'

import { useState, useEffect } from 'react'
import { getLensFamilies, getLensMatrixData, LensMatrixCell } from '@/lib/actions/lens-matrix.actions'
import { getDivergenciasGaveta } from '@/lib/actions/stock.actions'
import { Loader2, PackageSearch, List, Grid3x3 } from 'lucide-react'

const formatDeg = (val: number | null) => {
    if (val === null || val === undefined) return '-'
    if (val === 0) return '0.00'
    return val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)
}

export default function LensAuditCard({ storeId }: { storeId: number }) {
    const [families, setFamilies] = useState<{ id: number; nome: string }[]>([])
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [matrixData, setMatrixData] = useState<LensMatrixCell[]>([])
    const [loadingParams, setLoadingParams] = useState(true)
    const [loadingMatrix, setLoadingMatrix] = useState(false)

    // Lista de sobras (nova frente)
    const [sobras, setSobras] = useState<any[]>([])
    const [loadingSobras, setLoadingSobras] = useState(true)
    const [activeView, setActiveView] = useState<'lista' | 'matriz'>('lista')

    useEffect(() => {
        getLensFamilies(storeId).then(data => {
            setFamilies(data)
            setLoadingParams(false)
        })

        // Carregar lista de sobras
        getDivergenciasGaveta(storeId).then(data => {
            setSobras(data.sobras)
            setLoadingSobras(false)
        })
    }, [storeId])

    useEffect(() => {
        if (!selectedId) {
            setMatrixData([])
            return
        }
        
        setLoadingMatrix(true)
        getLensMatrixData(storeId, selectedId).then(data => {
            setMatrixData(data)
            setLoadingMatrix(false)
        })
    }, [selectedId, storeId])

    if (loadingParams && loadingSobras) {
        return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-fuchsia-500" /></div>
    }

    // Process matrix data into a grid
    const esfValues = Array.from(new Set(matrixData.map(d => d.esferico))).sort((a, b) => b - a)
    const cilValues = Array.from(new Set(matrixData.map(d => d.cilindrico))).sort((a, b) => b - a)
    const findCell = (esf: number, cil: number) => matrixData.find(d => d.esferico === esf && d.cilindrico === cil)

    return (
        <div className="space-y-6">
            {/* View Tabs */}
            <div className="flex gap-1 bg-black/30 p-1 rounded-xl w-fit border border-white/5">
                <button 
                    onClick={() => setActiveView('lista')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                        activeView === 'lista' ? 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30' : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    <List className="w-3.5 h-3.5" /> Lista de Sobras ({sobras.length})
                </button>
                <button 
                    onClick={() => setActiveView('matriz')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                        activeView === 'matriz' ? 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30' : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    <Grid3x3 className="w-3.5 h-3.5" /> Matriz por Família
                </button>
            </div>

            {/* === VIEW: Lista de Sobras === */}
            {activeView === 'lista' && (
                loadingSobras ? (
                    <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-fuchsia-500" /></div>
                ) : sobras.length === 0 ? (
                    <p className="text-slate-500 text-sm py-4">Nenhuma lente de sobra cadastrada no sistema.</p>
                ) : (
                    <div className="overflow-x-auto custom-scrollbar border border-white/5 rounded-2xl bg-black/20">
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
                                {sobras.map((s: any) => (
                                    <tr key={s.id} className="border-b border-white/5 hover:bg-fuchsia-500/5 transition-colors text-xs">
                                        <td className="px-3 py-2 text-fuchsia-400 font-bold whitespace-nowrap">{s.products?.marca || '-'}</td>
                                        <td className="px-3 py-2 text-slate-200 whitespace-nowrap max-w-[180px] truncate">{s.products?.nome || '-'}</td>
                                        <td className="px-3 py-2 text-center text-slate-300">{s.olho && s.olho !== 'AMBOS' ? s.olho : '-'}</td>
                                        <td className="px-3 py-2 text-center text-slate-300 font-mono">{s.diametro || '-'}</td>
                                        <td className="px-3 py-2 text-center text-slate-200 font-mono font-bold">{formatDeg(s.esferico)}</td>
                                        <td className="px-3 py-2 text-center text-slate-200 font-mono font-bold">{formatDeg(s.cilindrico)}</td>
                                        <td className="px-3 py-2 text-center text-slate-300 font-mono">{s.eixo !== null && s.eixo !== undefined ? `${s.eixo}°` : '-'}</td>
                                        <td className="px-3 py-2 text-center text-slate-300 font-mono">{formatDeg(s.adicao)}</td>
                                        <td className="px-3 py-2 text-center">
                                            <span className="bg-fuchsia-500/15 text-fuchsia-400 px-2 py-0.5 rounded-md text-[10px] font-bold border border-fuchsia-500/20">
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

            {/* === VIEW: Matriz por Família === */}
            {activeView === 'matriz' && (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="w-full md:w-1/2 lg:w-1/3">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Selecione a Lente (Família)</label>
                            <div className="relative">
                                <PackageSearch className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                <select
                                    value={selectedId || ''}
                                    onChange={(e) => setSelectedId(Number(e.target.value) || null)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl h-10 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 appearance-none"
                                >
                                    <option value="" className="bg-slate-900">Selecione uma opção...</option>
                                    {families.map(f => (
                                        <option key={f.id} value={f.id} className="bg-slate-900">{f.nome}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {selectedId && !loadingMatrix && matrixData.length > 0 && (
                            <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider bg-black/20 p-3 rounded-xl border border-white/5">
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-sm bg-slate-800 border border-slate-600"></span> Físico
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-sm bg-sky-500/20 border border-sky-500/50"></span> Sobra
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-sm bg-rose-500/20 border border-rose-500/50"></span> Perda
                                </div>
                            </div>
                        )}
                    </div>

                    {loadingMatrix && (
                        <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-4">
                            <Loader2 className="w-8 h-8 animate-spin text-fuchsia-500" />
                            <p className="text-sm font-bold uppercase tracking-widest">Montando matriz da grade...</p>
                        </div>
                    )}

                    {!loadingMatrix && selectedId && matrixData.length === 0 && (
                        <div className="py-10 text-center text-slate-500">
                            Nenhuma variante ou histórico encontrado para esta lente.
                        </div>
                    )}

                    {!loadingMatrix && matrixData.length > 0 && (
                        <div className="overflow-x-auto custom-scrollbar pb-4 border border-white/5 rounded-2xl bg-black/20">
                            <table className="w-full text-left border-collapse min-w-max">
                                <thead>
                                    <tr>
                                        <th className="p-3 sticky left-0 bg-slate-900/90 backdrop-blur border-b border-r border-white/5 text-xs font-bold text-slate-400 uppercase tracking-widest min-w-[80px]">ESF \ CIL</th>
                                        {cilValues.map(cil => (
                                            <th key={cil} className="p-3 border-b border-white/5 text-center text-xs font-bold text-slate-300 min-w-[80px]">
                                                {formatDeg(cil)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {esfValues.map(esf => (
                                        <tr key={esf} className="hover:bg-white/5 transition-colors">
                                            <td className="p-3 sticky left-0 bg-slate-900/90 backdrop-blur border-r border-b border-white/5 text-xs font-bold text-slate-300 whitespace-nowrap">
                                                {formatDeg(esf)}
                                            </td>
                                            {cilValues.map(cil => {
                                                const cell = findCell(esf, cil)
                                                const totalFisico = cell?.estoqueFisico || 0
                                                const classFisico = totalFisico > 0 ? 'text-white font-bold' : 'text-slate-600'
                                                const hasPerda = cell && cell.perdasRecentes > 0
                                                const hasSobra = cell && cell.sobras > 0
                                                
                                                let bgClass = ''
                                                if (hasPerda && hasSobra) bgClass = 'bg-fuchsia-500/10 border-fuchsia-500/30'
                                                else if (hasPerda) bgClass = 'bg-rose-500/10 border-rose-500/30'
                                                else if (hasSobra) bgClass = 'bg-sky-500/10 border-sky-500/30'
                                                
                                                return (
                                                    <td key={cil} className={`p-2 border-b border-white/5 text-center transition-colors ${bgClass ? 'border' : ''}`}>
                                                        <div className={`flex flex-col items-center justify-center p-1.5 rounded-lg ${bgClass}`}>
                                                            <span className={`text-[13px] ${classFisico}`}>{totalFisico}</span>
                                                            {(hasPerda || hasSobra) && (
                                                                <div className="flex gap-1.5 mt-1 text-[10px] font-bold">
                                                                    {hasSobra && <span className="text-sky-400">+{cell.sobras}</span>}
                                                                    {hasPerda && <span className="text-rose-400">-{cell.perdasRecentes}</span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
