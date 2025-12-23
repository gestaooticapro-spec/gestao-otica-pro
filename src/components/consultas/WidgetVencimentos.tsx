'use client'

import { useState } from 'react'
import { CalendarClock, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { VencimentoProximo } from '@/lib/actions/consultas.actions'

const formatMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function WidgetVencimentos({
    dados,
    storeName
}: {
    dados: VencimentoProximo[],
    storeName: string
}) {
    const [isOpen, setIsOpen] = useState(false)

    const handleZap = (item: VencimentoProximo) => {
        if (!item.fone_movel) return alert("Cliente sem celular cadastrado.")

        const num = item.fone_movel.replace(/\D/g, '')
        const primeiroNome = item.customer_name.split(' ')[0]
        const hoje = new Date().toISOString().split('T')[0]
        const venceHoje = item.data_vencimento === hoje
        const textoDia = venceHoje ? "hoje" : "amanhã"

        // MENSAGEM PERSONALIZADA COM NOME DA LOJA
        const msg = `Olá ${primeiroNome}, tudo bem? Aqui é da ${storeName}. Passando apenas para lembrar que sua parcela (${item.numero_parcela}ª) vence ${textoDia}. Se precisar da chave Pix, é só pedir!`

        window.open(`https://wa.me/55${num}?text=${encodeURIComponent(msg)}`, '_blank')
    }

    return (
        <div className="bg-white rounded-3xl shadow-[0_10px_30px_-10px_rgba(245,158,11,0.15)] border border-amber-100 overflow-hidden h-fit transition-all duration-300">

            <div
                className="px-6 py-5 flex justify-between items-center bg-amber-50/30 cursor-pointer hover:bg-amber-50 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-100 text-amber-600 rounded-2xl shadow-sm">
                        <CalendarClock className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-700 text-sm">Vencimentos (Hoje/Amanhã)</h3>
                        <p className="text-[10px] text-slate-400 font-medium">Lembrete preventivo</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {dados.length > 0 && (
                        <span className="bg-amber-100 text-amber-700 text-xs font-black px-2.5 py-1 rounded-full">
                            {dados.length}
                        </span>
                    )}
                    {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
            </div>

            {isOpen && (
                <div className="p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                    {dados.length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-6 font-medium">
                            Nenhuma parcela vencendo agora. ☀️
                        </p>
                    ) : (
                        dados.map(item => (
                            <div key={item.id} className="group p-3 rounded-2xl bg-white border border-slate-100 hover:border-amber-200 hover:shadow-md transition-all flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-slate-700 text-xs truncate max-w-[140px]">
                                        {item.customer_name}
                                    </p>
                                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                        {formatMoney(item.valor_parcela)} • {new Date(item.data_vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                    </p>
                                </div>

                                <button
                                    onClick={() => handleZap(item)}
                                    className="flex items-center justify-center w-8 h-8 rounded-full bg-green-50 text-green-600 hover:bg-green-600 hover:text-white transition-all shadow-sm"
                                    title="Enviar Lembrete WhatsApp"
                                >
                                    <MessageCircle className="h-4 w-4" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}