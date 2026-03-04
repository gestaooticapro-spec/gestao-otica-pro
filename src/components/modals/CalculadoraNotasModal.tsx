'use client'

import { useState, useMemo } from 'react'
import { Copy, X, Calculator, Check } from 'lucide-react'

interface CalculadoraNotasModalProps {
    isOpen: boolean
    onClose: () => void
}

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const inputStyle = "block w-full rounded-lg border border-white/10 bg-black/20 shadow-inner text-slate-200 h-9 text-sm px-3 text-right focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 font-bold placeholder:font-normal placeholder:text-slate-500 transition-all outline-none backdrop-blur-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"

export default function CalculadoraNotasModal({ isOpen, onClose }: CalculadoraNotasModalProps) {
    const [notas, setNotas] = useState<{ [key: string]: number }>({})
    const [copied, setCopied] = useState(false)

    const valoresNotas = [200, 100, 50, 20, 10, 5, 2]
    const valoresMoedas = [1, 0.50, 0.25, 0.10, 0.05]

    const handleInput = (val: number, qty: string) => {
        const parsed = parseInt(qty, 10)
        setNotas(prev => ({
            ...prev,
            [val.toString()]: isNaN(parsed) ? 0 : parsed
        }))
    }

    const total = useMemo(() => {
        let t = 0;
        Object.entries(notas).forEach(([val, qty]) => {
            t += parseFloat(val) * qty
        })
        return t;
    }, [notas])

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(total.toFixed(2))
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy text: ', err)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
            <div className="w-full max-w-2xl bg-slate-900/95 backdrop-blur-xl rounded-xl shadow-2xl shadow-black/50 overflow-hidden border border-emerald-500/20" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-white/10 bg-slate-800/60 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Calculator className="h-4 w-4 text-emerald-400" />
                        Calculadora de Notas e Moedas
                    </h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-red-400 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 flex gap-6">
                    {/* Notas */}
                    <div className="flex-1 space-y-3">
                        <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 border-b border-white/10 pb-1">Notas</h4>
                        {valoresNotas.map(val => (
                            <div key={`nota-${val}`} className="flex items-center gap-3">
                                <div className="w-16 text-right text-xs font-bold text-slate-300">
                                    {formatCurrency(val)}
                                </div>
                                <div className="text-slate-500 text-xs text-center w-4">x</div>
                                <div className="w-20">
                                    <input
                                        type="number"
                                        min="0"
                                        className={inputStyle}
                                        value={notas[val.toString()] || ''}
                                        onChange={(e) => handleInput(val, e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="flex-1 text-right text-xs font-black text-emerald-300 border-b border-white/5 pb-1">
                                    {formatCurrency(val * (notas[val.toString()] || 0))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="w-px bg-white/10 hidden sm:block"></div>

                    {/* Moedas */}
                    <div className="flex-1 space-y-3">
                        <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-2 border-b border-white/10 pb-1">Moedas</h4>
                        {valoresMoedas.map(val => (
                            <div key={`moeda-${val}`} className="flex items-center gap-3">
                                <div className="w-16 text-right text-xs font-bold text-slate-300">
                                    {formatCurrency(val)}
                                </div>
                                <div className="text-slate-500 text-xs text-center w-4">x</div>
                                <div className="w-20">
                                    <input
                                        type="number"
                                        min="0"
                                        className={inputStyle}
                                        value={notas[val.toString()] || ''}
                                        onChange={(e) => handleInput(val, e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="flex-1 text-right text-xs font-bold text-sky-300 border-b border-white/5 pb-1">
                                    {formatCurrency(val * (notas[val.toString()] || 0))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-800/80 p-5 border-t border-white/10 flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Calculado</div>
                        <div className="text-2xl font-black text-emerald-400">
                            {formatCurrency(total)}
                        </div>
                    </div>

                    <button
                        onClick={handleCopy}
                        className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all shadow-lg ${copied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-white/10'}`}
                    >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'Copiado!' : 'Copiar Valor'}
                    </button>
                </div>
            </div>
        </div>
    )
}
