'use client'

import { getGavetaItems } from '@/lib/actions/gaveta.actions'
import Link from 'next/link'
import { Archive, User, DollarSign, MessageCircle, Clock, AlertTriangle, ArrowLeft } from 'lucide-react'
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle'
import { useEffect, useState } from 'react'
import { getWhatsAppLink } from '@/lib/utils'

export default function GavetaPage({
  params
}: {
  params: { storeId: string }
}) {
  const storeId = parseInt(params.storeId)
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { preference } = useBackgroundPreference()

  useEffect(() => {
    getGavetaItems(storeId).then(res => {
      if (res.success) setItens(res.data || [])
      setLoading(false)
    })
  }, [storeId])


  // Calcula dias na gaveta
  const getDaysWaiting = (dateString: string) => {
    const readyDate = new Date(dateString)
    const today = new Date()
    const diffTime = Math.abs(today.getTime() - readyDate.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  return (
    <div className="relative min-h-[calc(100vh-64px)] flex flex-col bg-slate-950 overflow-hidden font-sans">

      {/* BACKGROUND PREMIUM */}
      <div className={`absolute inset-0 z-0 transition-opacity duration-1000 pointer-events-none ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
        <img src="/gaveta.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 fixed" />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/80 via-slate-950/80 to-slate-950" />
      </div>

      <div className="relative z-10 p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400 flex items-center gap-3 tracking-tight">
              <Link
                href={`/dashboard/loja/${storeId}`}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                title="Voltar para o Painel"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <Archive className="h-8 w-8 text-amber-500" />
              Gaveta de Prontos
            </h1>
            <p className="text-slate-400 font-medium mt-1">
              Óculos prontos aguardando retirada pelo cliente.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <BackgroundToggle />
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
              <span className="text-2xl">{itens?.length || 0}</span>
              <span className="text-xs uppercase opacity-70">Aguardando</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <p className="animate-pulse">Carregando gaveta...</p>
          </div>
        ) : !itens || itens.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-white/10 rounded-3xl m-4 bg-white/5 backdrop-blur-sm">
            <Archive className="h-16 w-16 mb-4 opacity-20" />
            <p className="text-lg font-bold text-slate-400">A gaveta está vazia!</p>
            <p className="text-sm mt-1">Todos os óculos prontos já foram entregues.</p>
            <p className="text-xs text-amber-400/80 mt-4 bg-amber-500/10 px-4 py-2 rounded-lg border border-amber-500/20 max-w-sm text-center">
              💡 Se houver óculos físicos na gaveta, verifique se foram marcados como <strong>"Montado"</strong> na Ordem de Serviço.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {itens.map((item: any) => {
              const diasEspera = getDaysWaiting(item.dt_montado_em)
              const isAtrasado = diasEspera > 7 // Mais de uma semana esperando

              // LÓGICA DE IDENTIFICAÇÃO (CRUCIAL):
              // Prioriza o nome do Dependente (quem usa o óculos). Se não houver, usa o Cliente.
              const nomePaciente = item.dependente?.nome_completo || item.customers?.full_name || 'Consumidor';
              const nomeCliente = item.customers?.full_name || 'Cliente'; // Para o WhatsApp

              // CORREÇÃO DO BUG DO TELEFONE:
              // Tenta 'fone_movel' primeiro, depois 'mobile_phone' (fallback)
              const telefoneRaw = item.customers?.fone_movel || item.customers?.phone || '';

              // Mensagem Personalizada
              const whatsappMessage = `Olá ${nomeCliente.split(' ')[0]}! Tudo bem? Aqui é da Ótica. Os óculos de *${nomePaciente}* ficaram prontos! Quando puder, passe aqui para retirar e ajustar. 😎`
              const whatsappLink = getWhatsAppLink(telefoneRaw, whatsappMessage)

              return (
                <div key={item.id} className={`bg-white/5 backdrop-blur-md rounded-2xl shadow-lg border overflow-hidden hover:shadow-xl hover:bg-white/10 transition-all group ${isAtrasado ? 'border-red-500/30' : 'border-white/10'}`}>

                  {/* Faixa de Status */}
                  <div className={`px-4 py-2 text-xs font-black uppercase tracking-widest flex justify-between items-center ${isAtrasado ? 'bg-red-500/20 text-red-400 border-b border-red-500/20' : 'bg-emerald-500/20 text-emerald-400 border-b border-emerald-500/20'}`}>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Pronto há {diasEspera} dia{diasEspera !== 1 && 's'}
                    </span>
                    <span className="opacity-70">OS #{item.id}</span>
                  </div>

                  <div className="p-5">
                    {/* Identificação do Paciente (Dono do Óculos) */}
                    <div className="mb-6">
                      <h3 className="font-bold text-slate-100 text-lg truncate flex items-center gap-2" title={nomePaciente}>
                        <User className="h-5 w-5 text-slate-500 shrink-0" />
                        {nomePaciente}
                      </h3>
                      {/* Se for dependente, mostra quem é o responsável logo abaixo */}
                      {item.dependente && (
                        <p className="text-xs text-slate-400 pl-7 truncate">
                          Resp: {nomeCliente}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 pl-7 mt-1">
                        Montado em: {new Date(item.dt_montado_em).toLocaleDateString('pt-BR')}
                      </p>
                    </div>

                    {/* Ações */}
                    <div className="grid grid-cols-2 gap-3">
                      <Link
                        href={`/dashboard/loja/${storeId}/vendas/${item.venda_id || ''}/experimental`}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-white/5 text-slate-300 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all"
                      >
                        <DollarSign className="h-4 w-4" />
                        Ver Venda
                      </Link>

                      {telefoneRaw ? (
                        <a
                          href={whatsappLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-emerald-600/80 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 transition-transform active:scale-95 border border-emerald-500/50"
                        >
                          <MessageCircle className="h-4 w-4" />
                          Avisar
                        </a>
                      ) : (
                        <button disabled className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed opacity-50">
                          <AlertTriangle className="h-4 w-4" />
                          Sem Whats
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}