'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ShoppingCart, Zap, DollarSign,
  HeartHandshake, Megaphone, Search,
  ArrowRight, BellRing, AlertCircle, FileText, CheckCircle, Wallet, CheckCircle2
} from 'lucide-react'
import AniversariantesWidget from '@/components/consultas/AniversariantesWidget'
import { WidgetEntregas, WidgetLaboratorio } from '@/components/consultas/PaineisAlertas'
import WidgetVencimentos from '@/components/consultas/WidgetVencimentos' // <--- Import Novo
import { AlertaEntrega, AlertaLaboratorio, Aniversariante, VencimentoProximo } from '@/lib/actions/consultas.actions'
import ParcelaSearchModal from '@/components/modals/ParcelaSearchModal'
import EntregaModal from '@/components/modals/EntregaModal'

interface Props {
  storeId: number
  storeName: string // <--- Recebe o nome da loja
  alerts: {
    entregas: AlertaEntrega[]
    laboratorio: AlertaLaboratorio[]
    vendasEmAberto: number
  }
  birthdays: Aniversariante[]
  vencimentos: VencimentoProximo[] // <--- Recebe os vencimentos
}

export default function ActionMenuDashboard({ storeId, storeName, alerts, birthdays, vencimentos }: Props) {
  const [isParcelaModalOpen, setIsParcelaModalOpen] = useState(false)
  const [isEntregaModalOpen, setIsEntregaModalOpen] = useState(false)

  // LINHA 1: ATENDIMENTO (Frente de Loja)
  const topRow = [
    {
      title: "Venda de Grau",
      desc: "Receituário Completo",
      icon: FileText,
      href: `/dashboard/loja/${storeId}/atendimento`,
      color: "bg-blue-600",
      shadow: "shadow-blue-200"
    },
    {
      title: "Venda Rápida",
      desc: "Solar / Acessórios",
      icon: Zap,
      href: `/dashboard/loja/${storeId}/pdv-express`,
      color: "bg-violet-600",
      shadow: "shadow-violet-200"
    },
    {
      title: "Entrega / Baixa",
      desc: "Finalizar OS",
      icon: CheckCircle2,
      action: () => setIsEntregaModalOpen(true),
      color: "bg-amber-500",
      shadow: "shadow-amber-200"
    },
    {
      title: "Baixa Parcelas",
      desc: "Receber Dinheiro/Pix",
      icon: DollarSign,
      action: () => setIsParcelaModalOpen(true),
      color: "bg-emerald-600",
      shadow: "shadow-emerald-200"
    }
  ]

  // LINHA 2: RETAGUARDA (Loja Vazia)
  const bottomRow = [
    {
      title: "Livro Caixa",
      icon: Wallet,
      href: `/dashboard/loja/${storeId}/financeiro/caixa`,
      color: "bg-white border border-slate-200 text-slate-700 hover:border-slate-300"
    },
    {
      title: "Cobrança",
      icon: Megaphone,
      href: `/dashboard/loja/${storeId}/cobranca`,
      color: "bg-white border border-slate-200 text-slate-700 hover:border-orange-300 hover:text-orange-600"
    },
    {
      title: "Pós-Venda",
      icon: HeartHandshake,
      href: `/dashboard/loja/${storeId}/pos-venda`,
      color: "bg-white border border-slate-200 text-slate-700 hover:border-pink-300 hover:text-pink-600"
    },
    {
      title: "Rastrear Lentes",
      icon: Search,
      href: `/dashboard/loja/${storeId}/consultas`,
      color: "bg-white border border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-600"
    }
  ]

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-slate-50">
      <div className="max-w-7xl mx-auto w-full p-6 space-y-8">

        {/* 0. ALERTAS CRÍTICOS */}
        {alerts.vendasEmAberto > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold text-amber-900 text-sm">Atenção Operacional</p>
                <p className="text-amber-700 text-xs mt-0.5">
                  Você tem <strong className="text-amber-900 underline">{alerts.vendasEmAberto} vendas em aberto</strong>.
                </p>
              </div>
            </div>
            <Link
              href={`/dashboard/loja/${storeId}/vendas`}
              className="whitespace-nowrap px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2"
            >
              LISTAR <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">

          {/* --- COLUNA ESQUERDA: AÇÃO (MESA DE CONTROLE) --- */}
          <div className="flex-1 space-y-6">

            <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Zap className="h-6 w-6 text-blue-600" /> Painel de Controle
            </h1>

            {/* GRADE 1: ATENDIMENTO (Grandes) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {topRow.map((item, idx) => {
                const content = (
                  <div className={`
                                h-32 rounded-2xl p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer flex flex-col justify-between
                                ${item.color} ${item.shadow} text-white shadow-lg
                            `}>
                    <div className="absolute top-0 right-0 p-4 opacity-20 transform scale-150 rotate-12">
                      <item.icon className="w-24 h-24" />
                    </div>
                    <div className="relative z-10">
                      <item.icon className="w-8 h-8 mb-3 opacity-90" />
                      <h3 className="text-xl font-black leading-none">{item.title}</h3>
                    </div>
                    <p className="relative z-10 text-xs font-medium opacity-80 uppercase tracking-wider">{item.desc}</p>
                  </div>
                )

                return item.action ? (
                  <div key={idx} onClick={item.action}>{content}</div>
                ) : (
                  <Link key={idx} href={item.href!}>{content}</Link>
                )
              })}
            </div>

            {/* GRADE 2: RETAGUARDA (Menores) */}
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-6 mb-3 px-1">Loja Vazia & Gestão</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {bottomRow.map((item, idx) => (
                <Link key={idx} href={item.href} className={`
                            flex flex-col items-center justify-center text-center p-4 rounded-xl shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer
                            ${item.color}
                        `}>
                  <item.icon className="h-6 w-6 mb-2 opacity-80" />
                  <span className="text-xs font-bold leading-tight">{item.title}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* --- COLUNA DIREITA: RADAR --- */}
          <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0">
            <div className="flex items-center gap-2 text-slate-400 uppercase text-xs font-bold tracking-widest px-1">
              <BellRing className="h-4 w-4" /> Radar Operacional
            </div>

            {/* Widget Vencimentos (Novo) */}
            <WidgetVencimentos dados={vencimentos} storeName={storeName} />

            {/* Widget Aniversariantes */}
            <AniversariantesWidget clientes={birthdays} />

            {/* Widget Entregas */}
            <WidgetEntregas data={alerts.entregas} storeId={storeId} />

            {/* Widget Laboratório */}
            <WidgetLaboratorio data={alerts.laboratorio} storeId={storeId} />
          </div>

        </div>
      </div>

      <ParcelaSearchModal
        isOpen={isParcelaModalOpen}
        onClose={() => setIsParcelaModalOpen(false)}
        storeId={storeId}
      />

      <EntregaModal
        isOpen={isEntregaModalOpen}
        onClose={() => setIsEntregaModalOpen(false)}
        storeId={storeId}
      />
    </div>
  )
}