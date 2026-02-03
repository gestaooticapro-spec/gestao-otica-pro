
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
        let novoMes = today.getMonth() // 0-11, so current month index matches "last month number" 
        // Ex: Hoje é Fev (1). Mes Passado é Jan (0). Mas queremos numero 1.
        // Se Hoje é Jan (0). Mes Passado é Dez (11).

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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className={`px-5 py-4 flex justify-between items-center bg-gradient-to-r ${type === 'pix' ? 'from-emerald-500 to-teal-600' : 'from-blue-500 to-indigo-600'}`}>
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Printer className="h-5 w-5" />
                        Relatório de {type === 'pix' ? 'PIX' : 'Cartões'}
                    </h3>
                    <button onClick={onClose} className="p-1 rounded hover:bg-white/20 text-white transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">

                    <button
                        onClick={handleMesPassado}
                        className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all active:scale-95 border border-slate-200 group"
                    >
                        <ArrowLeft className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                        Usar Mês Passado
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-200"></div>
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-2 text-slate-400 font-bold">Ou selecione manualmente</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mês</label>
                            <select
                                value={mes}
                                onChange={(e) => setMes(Number(e.target.value))}
                                className="w-full h-11 rounded-lg border-slate-300 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                                className="w-full h-11 rounded-lg border-slate-300 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                            />
                        </div>
                    </div>

                    <button
                        onClick={() => onConfirm(mes, ano)}
                        className={`w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-blue-100 transition-transform active:scale-95 flex items-center justify-center gap-2 ${type === 'pix' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
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
