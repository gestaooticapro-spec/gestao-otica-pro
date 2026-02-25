'use client'

import { useState } from 'react'
import { Gift, ChevronDown, ChevronUp } from 'lucide-react'
import { Aniversariante } from '@/lib/actions/consultas.actions'
import { openWhatsApp } from '@/lib/utils/whatsapp'

export default function AniversariantesWidget({ clientes }: { clientes: Aniversariante[] }) {
    const [isOpen, setIsOpen] = useState(false)

    const handleZap = (fone: string | null, nome: string) => {
        if (!fone) return
        const msg = `Oi ${nome.split(' ')[0]}! Sabemos que esse é um dia especial pra você. Te desejamos toda a felicidade do mundo!`
        openWhatsApp(fone, msg)
    }

    return (
        <div className="bg-black/20 rounded-3xl shadow-xl border border-white/5 overflow-hidden h-fit transition-all duration-300 backdrop-blur-sm ring-1 ring-white/10">

            <div
                className="px-6 py-5 flex justify-between items-center bg-pink-500/10 cursor-pointer hover:bg-pink-500/20 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-pink-500/20 text-pink-400 rounded-2xl shadow-inner border border-pink-500/10">
                        <Gift className="h-5 w-5" />
                    </div>
                    <h3 className="font-bold text-pink-100 text-sm">Aniversariantes do Dia</h3>
                </div>

                <div className="flex items-center gap-3">
                    {clientes.length > 0 && (
                        <span className="bg-pink-500 text-pink-950 text-xs font-black px-2.5 py-1 rounded-full shadow-lg shadow-pink-900/20">
                            {clientes.length}
                        </span>
                    )}
                    {isOpen ? <ChevronUp className="h-4 w-4 text-white/50" /> : <ChevronDown className="h-4 w-4 text-white/50" />}
                </div>
            </div>

            {isOpen && (
                <div className="p-4 space-y-3 animate-in slide-in-from-top-2 duration-200 bg-black/40">
                    {clientes.length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-6 font-medium">
                            Ninguém sopra velinhas hoje. 🎂
                        </p>
                    ) : (
                        clientes.map(c => (
                            <div
                                key={c.id}
                                className="group p-3 rounded-2xl bg-white/5 border border-white/5 
                                hover:border-pink-500/50 hover:bg-white/10 hover:shadow-md transition-all flex justify-between items-center"
                            >
                                <div>
                                    <p className="font-bold text-slate-200 group-hover:text-white text-xs truncate max-w-[150px] transition-colors">
                                        {c.nome}
                                    </p>
                                    <p className="text-[10px] text-slate-400 group-hover:text-slate-300">{c.fone || 'Sem fone'}</p>
                                </div>

                                {/* BOTÃO WHATSAPP */}
                                <button
                                    onClick={() => handleZap(c.fone, c.nome)}
                                    className="flex items-center justify-center w-8 h-8 rounded-full 
                                    bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white transition-all shadow-sm border border-green-500/20"
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
