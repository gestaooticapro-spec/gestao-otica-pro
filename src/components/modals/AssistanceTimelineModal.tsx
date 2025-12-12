'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { X, Send, Loader2, MessageSquare, Phone, Globe, User, Bell, Mail } from 'lucide-react'
import { getAssistanceTimeline, saveAssistanceInteraction } from '@/lib/actions/assistance.actions'

type TimelineItem = {
    id: number
    tipo: string // 'Comentario', 'MudancaStatus', 'Alerta', 'WhatsApp', 'Sistema', 'Site', 'Email'
    mensagem: string
    created_at: string
}

const formatDate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function AssistanceTimelineModal({ isOpen, onClose, ticket }: { isOpen: boolean, onClose: () => void, ticket: any }) {
    const [history, setHistory] = useState<TimelineItem[]>([])
    const [loading, setLoading] = useState(true)
    const [tipo, setTipo] = useState('WhatsApp')
    const [mensagem, setMensagem] = useState('')
    const [isSaving, startTransition] = useTransition()
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (isOpen && ticket) {
            setLoading(true)
            getAssistanceTimeline(ticket.id).then(data => {
                setHistory(data)
                setLoading(false)
            })
        }
    }, [isOpen, ticket])

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault()
        if (!mensagem.trim()) return

        const formData = new FormData()
        formData.append('ticket_id', ticket.id.toString())
        formData.append('tipo', tipo)
        formData.append('mensagem', mensagem)

        startTransition(async () => {
            const res = await saveAssistanceInteraction(formData)
            if (res.success) {
                setMensagem('')
                // Recarrega lista
                const newData = await getAssistanceTimeline(ticket.id)
                setHistory(newData)
            } else {
                alert(res.message)
            }
        })
    }

    if (!isOpen) return null

    // Ícones por tipo
    const getIcon = (t: string) => {
        if (t === 'WhatsApp') return <MessageSquare className="h-4 w-4 text-green-600" />
        if (t === 'Ligação') return <Phone className="h-4 w-4 text-blue-600" />
        if (t === 'Site') return <Globe className="h-4 w-4 text-cyan-600" /> // <--- Ícone para Site
        if (t === 'Email') return <Mail className="h-4 w-4 text-indigo-500" />
        if (t === 'Sistema') return <Globe className="h-4 w-4 text-gray-400 opacity-50" />
        if (t === 'Alerta') return <Bell className="h-4 w-4 text-amber-600" />
        return <User className="h-4 w-4 text-slate-500" />
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                
                {/* Header */}
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg">Histórico de Interações</h3>
                        <p className="text-xs text-slate-500">Ticket #{ticket.id} • {ticket.customers?.full_name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600"><X className="h-5 w-5"/></button>
                </div>

                {/* Área de Mensagens (Scroll) */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-4" ref={scrollRef}>
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-slate-300"/></div>
                    ) : history.length === 0 ? (
                        <p className="text-center text-slate-400 text-sm italic">Nenhum registro ainda.</p>
                    ) : (
                        history.map((item) => (
                            <div key={item.id} className={`flex gap-3 ${item.tipo === 'Sistema' ? 'opacity-70' : ''}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border shrink-0 bg-white shadow-sm border-slate-200`}>
                                    {getIcon(item.tipo)}
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-slate-700">{item.tipo}</span>
                                        <span className="text-[10px] text-slate-400">{formatDate(item.created_at)}</span>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg rounded-tl-none border border-slate-200 text-sm text-slate-600 shadow-sm">
                                        {item.mensagem}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Input Fixo */}
                <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-200">
                    <div className="flex gap-2 mb-2 flex-wrap">
                         {/* Lista de Opções Atualizada */}
                         {['WhatsApp', 'Ligação', 'Site', 'Email', 'Presencial', 'Interno'].map(t => (
                             <button 
                                key={t} 
                                type="button"
                                onClick={() => setTipo(t)}
                                className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-colors ${tipo === t ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                             >
                                {t}
                             </button>
                         ))}
                    </div>
                    <div className="flex gap-2">
                        <input 
                            value={mensagem} 
                            onChange={e => setMensagem(e.target.value)} 
                            placeholder="Descreva a interação ou observação..." 
                            className="flex-1 h-10 px-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm"
                            autoFocus
                        />
                        <button 
                            type="submit" 
                            disabled={isSaving || !mensagem.trim()} 
                            className="h-10 w-12 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? <Loader2 className="h-5 w-5 animate-spin"/> : <Send className="h-5 w-5"/>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}