'use client'

import { useState } from 'react'
import Link from 'next/link'
import { 
  ShoppingCart, Zap, DollarSign, 
  HeartHandshake, Megaphone, Search, 
  ArrowRight, BellRing, AlertCircle 
} from 'lucide-react'
import AniversariantesWidget from '@/components/consultas/AniversariantesWidget'
import { WidgetEntregas, WidgetLaboratorio } from '@/components/consultas/PaineisAlertas'
import { AlertaEntrega, AlertaLaboratorio, Aniversariante } from '@/lib/actions/consultas.actions'
import ParcelaSearchModal from '@/components/modals/ParcelaSearchModal'

interface Props {
    storeId: number
    alerts: {
        entregas: AlertaEntrega[]
        laboratorio: AlertaLaboratorio[]
        vendasEmAberto: number // Tipo atualizado
    }
    birthdays: Aniversariante[]
}

export default function ActionMenuDashboard({ storeId, alerts, birthdays }: Props) {
  const [isParcelaModalOpen, setIsParcelaModalOpen] = useState(false)

  const menuItems = [
    {
      title: "Novo Atendimento",
      description: "Iniciar venda completa com receita e OS.",
      icon: ShoppingCart,
      href: `/dashboard/loja/${storeId}/atendimento`,
      color: "from-blue-600 to-indigo-600",
      shadow: "shadow-blue-200",
      colSpan: "col-span-1"
    },
    {
      title: "Venda Rápida",
      description: "Venda de balcão, solar e acessórios.",
      icon: Zap,
      href: `/dashboard/loja/${storeId}/pdv-express`,
      color: "from-violet-600 to-purple-600",
      shadow: "shadow-purple-200",
      colSpan: "col-span-1"
    },
    {
      title: "Recebimento de Parcelas",
      description: "Baixar carnê ou consultar débitos.",
      icon: DollarSign,
      action: () => setIsParcelaModalOpen(true),
      color: "from-emerald-500 to-teal-600",
      shadow: "shadow-emerald-200",
      colSpan: "col-span-1"
    },
    {
      title: "Pós-Venda / Sucesso",
      description: "Acompanhamento de adaptação.",
      icon: HeartHandshake,
      href: `/dashboard/loja/${storeId}/pos-venda`,
      color: "from-pink-500 to-rose-500",
      shadow: "shadow-pink-200",
      colSpan: "col-span-1"
    },
    {
      title: "Cobrança",
      description: "Gestão de inadimplência e SPC.",
      icon: Megaphone,
      href: `/dashboard/loja/${storeId}/cobranca`,
      color: "from-orange-500 to-amber-600",
      shadow: "shadow-orange-200",
      colSpan: "col-span-1"
    },
    {
      title: "Consulta Universal (OS)",
      description: "Localizar OS, produtos ou clientes.",
      icon: Search,
      href: `/dashboard/loja/${storeId}/consultas`,
      color: "from-slate-600 to-slate-700",
      shadow: "shadow-slate-300",
      colSpan: "col-span-1"
    }
  ]

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-slate-50">
      <div className="max-w-7xl mx-auto w-full p-6 space-y-8">
        
        {/* 0. ALERTA DE VENDAS EM ABERTO (SÓ APARECE SE TIVER PENDÊNCIA) */}
        {alerts.vendasEmAberto > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in slide-in-from-top-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                        <AlertCircle className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="font-bold text-amber-900 text-sm">Atenção Operacional</p>
                        <p className="text-amber-700 text-xs mt-0.5">
                            Você tem <strong className="text-amber-900 underline">{alerts.vendasEmAberto} vendas em aberto</strong> aguardando fechamento.
                        </p>
                    </div>
                </div>
                <Link 
                    href={`/dashboard/loja/${storeId}/vendas`}
                    className="whitespace-nowrap px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2"
                >
                    RESOLVER AGORA <ArrowRight className="h-3 w-3" />
                </Link>
            </div>
        )}

        {/* 1. MENU DE AÇÃO */}
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                    <Zap className="h-6 w-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Acesso Rápido</h1>
                    <p className="text-slate-500 text-sm">Selecione uma operação para iniciar.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {menuItems.map((item, idx) => {
                const Content = (
                  <>
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                        <item.icon className="w-20 h-20 text-white" />
                    </div>
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-3 text-white">
                            <item.icon className="w-5 h-5" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-0.5 leading-tight">{item.title}</h3>
                        <p className="text-white/80 text-[10px] font-medium max-w-[90%] leading-snug">{item.description}</p>
                    </div>
                    <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-x-4 group-hover:translate-x-0">
                        <div className="bg-white text-slate-800 p-1.5 rounded-full shadow-sm">
                            <ArrowRight className="w-3 h-3" />
                        </div>
                    </div>
                  </>
                )

                const className = `
                    group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl
                    bg-gradient-to-br ${item.color} ${item.shadow} shadow-md
                    ${item.colSpan}
                    min-h-[140px] flex flex-col justify-between border border-white/10 cursor-pointer
                `

                if (item.action) {
                    return (
                        <div key={idx} onClick={item.action} className={className}>
                            {Content}
                        </div>
                    )
                }

                return (
                    <Link key={idx} href={item.href!} className={className}>
                        {Content}
                    </Link>
                )
              })}
            </div>
        </div>

        {/* 2. SEPARADOR VISUAL */}
        <div className="border-t border-slate-200"></div>

        {/* 3. RADAR OPERACIONAL */}
        <div className="space-y-6 pb-10">
             <div className="flex items-center gap-2 text-slate-400 uppercase text-xs font-bold tracking-widest px-1">
                 <BellRing className="h-4 w-4" />
                 Radar Operacional
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="w-full">
                    <AniversariantesWidget clientes={birthdays} />
                </div>
                <div className="w-full">
                    <WidgetLaboratorio data={alerts.laboratorio} storeId={storeId} />
                </div>
                <div className="w-full">
                    <WidgetEntregas data={alerts.entregas} storeId={storeId} />
                </div>
             </div>
        </div>

      </div>

      <ParcelaSearchModal 
        isOpen={isParcelaModalOpen}
        onClose={() => setIsParcelaModalOpen(false)}
        storeId={storeId}
      />
    </div>
  )
}