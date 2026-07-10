'use client'

import { useState } from 'react'
import { CalendarClock, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { VencimentoProximo } from '@/lib/actions/consultas.actions'
import { sendManualWhatsAppFromClient } from '@/lib/whatsapp/manual-client'

const formatMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function WidgetVencimentos({
    dados,
    storeName,
    storeId
}: {
    dados: VencimentoProximo[],
    storeName: string,
    storeId: number
}) {
    const [isOpen, setIsOpen] = useState(false)
    const [sendingWhatsAppId, setSendingWhatsAppId] = useState<number | null>(null)

    const handleZap = async (item: VencimentoProximo) => {
        if (sendingWhatsAppId) return
        if (!item.fone_movel) return alert("Cliente sem celular cadastrado.")

        const primeiroNome = item.customer_name.split(' ')[0]
        const hoje = new Date().toISOString().split('T')[0]
        const venceHoje = item.data_vencimento === hoje
        const textoDia = venceHoje ? "hoje" : "amanhã"

        // MENSAGEM PERSONALIZADA COM NOME DA LOJA
        const msg = `Olá ${primeiroNome}, tudo bem? Aqui é da ${storeName}. Passando apenas para lembrar que sua parcela (${item.numero_parcela}ª) vence ${textoDia}. Se precisar da chave Pix, é só pedir!`

        setSendingWhatsAppId(item.id)
        try {
            await sendManualWhatsAppFromClient({
                storeId,
                remotePhone: item.fone_movel,
                messageText: msg,
                messageType: 'billing_reminder',
                source: 'due_installments_widget.reminder_button',
                metadata: {
                    installmentId: item.id,
                    customerName: item.customer_name,
                    dueDate: item.data_vencimento,
                    installmentNumber: item.numero_parcela,
                    amount: item.valor_parcela,
                },
            })
        } finally {
            setSendingWhatsAppId(null)
        }
    }

    return (
        <div className="bg-black/20 rounded-3xl shadow-xl border border-white/5 overflow-hidden h-fit transition-all duration-300 backdrop-blur-sm ring-1 ring-white/10">

            <div
                className="px-6 py-5 flex justify-between items-center bg-amber-500/10 cursor-pointer hover:bg-amber-500/20 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl shadow-inner border border-amber-500/10">
                        <CalendarClock className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-amber-100 text-sm">Vencimentos (Hoje/Amanhã)</h3>
                        <p className="text-[10px] text-amber-200/60 font-medium">Lembrete preventivo</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {dados.length > 0 && (
                        <span className="bg-amber-500 text-amber-950 text-xs font-black px-2.5 py-1 rounded-full shadow-lg shadow-amber-900/20">
                            {dados.length}
                        </span>
                    )}
                    {isOpen ? <ChevronUp className="h-4 w-4 text-white/50" /> : <ChevronDown className="h-4 w-4 text-white/50" />}
                </div>
            </div>

            {isOpen && (
                <div className="p-4 space-y-3 animate-in slide-in-from-top-2 duration-200 bg-black/40">
                    {dados.length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-6 font-medium">
                            Nenhuma parcela vencendo agora. ☀️
                        </p>
                    ) : (
                        dados.map(item => (
                            <div key={item.id} className="group p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-amber-500/50 hover:bg-white/10 transition-all flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-slate-200 text-xs truncate max-w-[140px] group-hover:text-white transition-colors">
                                        {item.customer_name}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5 group-hover:text-slate-300">
                                        {formatMoney(item.valor_parcela)} • {new Date(item.data_vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                    </p>
                                </div>

                                <button
                                    onClick={() => handleZap(item)}
                                    disabled={sendingWhatsAppId === item.id}
                                    className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all shadow-sm border border-emerald-500/20 disabled:opacity-50"
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
