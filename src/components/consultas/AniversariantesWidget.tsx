'use client'

import { useState } from 'react'
import { Gift, ChevronDown, ChevronUp } from 'lucide-react'
import { Aniversariante } from '@/lib/actions/consultas.actions'

export default function AniversariantesWidget({ clientes }: { clientes: Aniversariante[] }) {
    const [isOpen, setIsOpen] = useState(false)

    const handleZap = (fone: string | null, nome: string) => {
        const numero = fone ? fone.replace(/\D/g, '') : ''
        const msg = `Parabéns ${nome.split(' ')[0]}! 🎉 A Ótica Pro deseja um feliz aniversário!`
        window.open(`https://wa.me/${numero ? '55' + numero : ''}?text=${encodeURIComponent(msg)}`, '_blank')
    }

    return (
        <div className="bg-white rounded-3xl shadow-[0_10px_30px_-10px_rgba(236,72,153,0.15)] border border-pink-100 overflow-hidden h-fit transition-all duration-300">

            <div
                className="px-6 py-5 flex justify-between items-center bg-pink-50/30 cursor-pointer hover:bg-pink-50 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-pink-100 text-pink-600 rounded-2xl shadow-sm">
                        <Gift className="h-5 w-5" />
                    </div>
                    <h3 className="font-bold text-slate-700 text-sm">Aniversariantes do Dia</h3>
                </div>

                <div className="flex items-center gap-3">
                    {clientes.length > 0 && (
                        <span className="bg-pink-100 text-pink-600 text-xs font-black px-2.5 py-1 rounded-full">
                            {clientes.length}
                        </span>
                    )}
                    {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
            </div>

            {isOpen && (
                <div className="p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                    {clientes.length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-6 font-medium">
                            Ninguém sopra velinhas hoje. 🎂
                        </p>
                    ) : (
                        clientes.map(c => (
                            <div
                                key={c.id}
                                className="group p-3 rounded-2xl bg-white border border-slate-100 
                                hover:border-pink-200 hover:shadow-md transition-all flex justify-between items-center"
                            >
                                <div>
                                    <p className="font-bold text-slate-700 text-xs truncate max-w-[150px]">
                                        {c.nome}
                                    </p>
                                    <p className="text-[10px] text-slate-400">{c.fone || 'Sem fone'}</p>
                                </div>

                                {/* BOTÃO WHATSAPP */}
                                <button
                                    onClick={() => handleZap(c.fone, c.nome)}
                                    className="flex items-center justify-center w-8 h-8 rounded-full 
                                    bg-green-50 text-green-600 hover:bg-green-600 hover:text-white transition-all"
                                    title="Enviar pelo WhatsApp"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-4 w-4"
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path d="M20.52 3.48A11.8 11.8 0 0 0 12 0C5.37 0 0 5.37 0 12a11.9 11.9 0 0 0 1.64 6L0 24l6.25-1.64A11.9 11.9 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.19-1.24-6.2-3.48-8.52zM12 22a10 10 0 0 1-5.12-1.42l-.37-.22L3 21l.63-3.5-.23-.36A10 10 0 1 1 12 22zm5.13-7.53c-.28-.14-1.68-.83-1.94-.92-.26-.1-.45-.14-.64.14-.19.28-.74.92-.9 1.11-.17.19-.33.21-.62.07-.28-.14-1.17-.43-2.24-1.38-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.33.42-.49.14-.16.19-.28.28-.47.1-.19.05-.36-.02-.5-.07-.14-.64-1.54-.88-2.11-.23-.55-.47-.47-.64-.48h-.55c-.19 0-.5.07-.76.36-.26.28-1 1-1 2.43s1.02 2.82 1.16 3.01c.14.19 2 3.06 4.93 4.29.69.3 1.23.48 1.65.61.69.22 1.31.19 1.81.12.55-.08 1.68-.69 1.92-1.36.24-.66.24-1.23.17-1.36-.07-.14-.26-.21-.54-.35z" />
                                    </svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
