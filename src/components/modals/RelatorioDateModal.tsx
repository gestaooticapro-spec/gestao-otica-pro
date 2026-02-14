
'use client'

import { useState } from 'react'
import { Calendar, X, Printer, ArrowLeft } from 'lucide-react'

type RelatorioDateModalProps = {
    isOpen: boolean
    onClose: () => void
    onConfirm: (mes: number, ano: number) => void
    type: 'pix' | 'cartoes'
}

export default function RelatorioDateModal({ isOpen, onClose, onConfirm, type }: RelatorioDateModalProps) {
    if (!isOpen) return null

    const today = new Date()
    const [mes, setMes] = useState(today.getMonth() + 1)
    const [ano, setAno] = useState(today.getFullYear())

    const handleMesPassado = () => {
        let novoMes = today.getMonth()
        let novoAno = today.getFullYear()

        if (novoMes === 0) {
            novoMes = 12
            novoAno = novoAno - 1
        }

        setMes(novoMes)
        setAno(novoAno)
    }

    const meses = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ]

    const accentColor = type === 'pix' ? 'emerald' : 'sky'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/50 w-full max-w-sm overflow-hidden border border-white/10" onClick={e => e.stopPropagation()}>
                <div className={`px-5 py-4 flex justify-between items-center border-b border-white/10 ${type === 'pix' ? 'bg-emerald-500/10' : 'bg-sky-500/10'}`}>
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Printer className={`h-5 w-5 ${type === 'pix' ? 'text-emerald-400' : 'text-sky-400'}`} />
                        Relatório de {type === 'pix' ? 'PIX' : 'Cartões'}
                    </h3>
                    <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-red-400 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">

                    <button
                        onClick={handleMesPassado}
                        className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-3 rounded-xl transition-all active:scale-95 border border-white/10 group"
                    >
                        <ArrowLeft className="h-4 w-4 text-slate-500 group-hover:text-white transition-colors" />
                        Usar Mês Passado
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/10"></div>
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-slate-900 px-2 text-slate-500 font-bold">Ou selecione manualmente</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mês</label>
                            <select
                                value={mes}
                                onChange={(e) => setMes(Number(e.target.value))}
                                className="w-full h-11 rounded-lg border border-white/10 bg-black/20 font-bold text-slate-200 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none backdrop-blur-sm px-3"
                            >
                                {meses.map((m, i) => (
                                    <option key={i} value={i + 1}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ano</label>
                            <input
                                type="number"
                                value={ano}
                                onChange={(e) => setAno(Number(e.target.value))}
                                className="w-full h-11 rounded-lg border border-white/10 bg-black/20 font-bold text-slate-200 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none backdrop-blur-sm text-center px-3"
                            />
                        </div>
                    </div>

                    <button
                        onClick={() => onConfirm(mes, ano)}
                        className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 border border-white/10 ${type === 'pix'
                            ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
                            : 'bg-sky-600 hover:bg-sky-500 shadow-sky-500/20'
                            }`}
                    >
                        <Printer className="h-5 w-5" />
                        GERAR RELATÓRIO
                    </button>

                </div>
            </div>
        </div>
    )
}
