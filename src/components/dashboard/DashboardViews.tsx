'use client'

import { StoreKPIs, NetworkKPIs } from '@/lib/actions/dashboard.actions'
import { 
  TrendingUp, DollarSign, ShoppingBag, AlertTriangle, 
  Store, Calendar, Users, Package, Award 
} from 'lucide-react'

const formatMoney = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// --- COMPONENTE 1: VISÃO DO GERENTE (LOJA) ---
export function ManagerDashboard({ data }: { data: StoreKPIs }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* 1. Cards de Topo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vendas Hoje</p>
                    <h3 className="text-2xl font-black text-slate-800 mt-1">{formatMoney(data.faturamentoDia)}</h3>
                </div>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <TrendingUp className="h-5 w-5" />
                </div>
            </div>
            <p className="text-xs text-slate-400 mt-2 font-medium">{data.qtdVendasDia} vendas realizadas</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Acumulado Mês</p>
                    <h3 className="text-2xl font-black text-blue-900 mt-1">{formatMoney(data.faturamentoMes)}</h3>
                </div>
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <Calendar className="h-5 w-5" />
                </div>
            </div>
            <p className="text-xs text-slate-400 mt-2 font-medium">Meta: (Não definida)</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ticket Médio</p>
                    <h3 className="text-2xl font-black text-slate-700 mt-1">{formatMoney(data.ticketMedio)}</h3>
                </div>
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                    <Award className="h-5 w-5" />
                </div>
            </div>
            <p className="text-xs text-slate-400 mt-2 font-medium">Performance de Venda</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Estoque Crítico</p>
                    <h3 className="text-2xl font-black text-rose-600 mt-1">{data.estoqueCritico}</h3>
                </div>
                <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                    <AlertTriangle className="h-5 w-5" />
                </div>
            </div>
            <p className="text-xs text-slate-400 mt-2 font-medium">Produtos abaixo do mínimo</p>
        </div>
      </div>

      {/* 2. Área de Conteúdo (Placeholder para Gráficos Futuros) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm min-h-[300px] flex items-center justify-center text-slate-300">
              <div className="text-center">
                  <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-20"/>
                  <p>Gráfico de Desempenho (Em Breve)</p>
              </div>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" /> Aniversariantes
              </h3>
              {data.aniversariantes.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Nenhum aniversariante hoje.</p>
              ) : (
                  <ul className="space-y-2">
{data.aniversariantes.map((cli, i) => (
  <li key={i} className="text-sm text-slate-600 flex justify-between items-center">
    <span>{cli.nome}</span>

    <div className="flex items-center gap-2">

      <a
        href={`https://wa.me/${cli.fone ? '55' + cli.fone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(
          `Parabéns ${cli.nome.split(' ')[0]}! 🎉 A Ótica Pro deseja um feliz aniversário!`
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-green-500 hover:text-green-600"
        title="Enviar felicitações pelo WhatsApp"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5"
          fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.52 3.48A11.8 11.8 0 0 0 12 0C5.37 0 0 5.37 0 12a11.9 11.9 0 0 0 1.64 6L0 24l6.25-1.64A11.9 11.9 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.19-1.24-6.2-3.48-8.52zM12 22a10 10 0 0 1-5.12-1.42l-.37-.22L3 21l.63-3.5-.23-.36A10 10 0 1 1 12 22zm5.13-7.53c-.28-.14-1.68-.83-1.94-.92-.26-.1-.45-.14-.64.14-.19.28-.74.92-.9 1.11-.17.19-.33.21-.62.07-.28-.14-1.17-.43-2.24-1.38-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.33.42-.49.14-.16.19-.28.28-.47.1-.19.05-.36-.02-.5-.07-.14-.64-1.54-.88-2.11-.23-.55-.47-.47-.64-.48h-.55c-.19 0-.5.07-.76.36-.26.28-1 1-1 2.43s1.02 2.82 1.16 3.01c.14.19 2 3.06 4.93 4.29.69.3 1.23.48 1.65.61.69.22 1.31.19 1.81.12.55-.08 1.68-.69 1.92-1.36.24-.66.24-1.23.17-1.36-.07-.14-.26-.21-.54-.35z" />
        </svg>
      </a>

      <span className="text-xs text-slate-400 px-2">
        {cli.fone ?? '—'}
      </span>

    </div>
  </li>
))}


                  </ul>
              )}
          </div>
      </div>
    </div>
  )
}

// --- COMPONENTE 2: VISÃO DO ADMIN (REDE) ---
export function AdminDashboard({ data }: { data: NetworkKPIs }) {
    return (
      <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          
          {/* Resumo da Rede */}
          <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl flex justify-between items-center relative overflow-hidden">
              <div className="relative z-10">
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-sm mb-1">Faturamento Rede (Hoje)</p>
                  <h2 className="text-5xl font-black tracking-tight">{formatMoney(data.totalRedeDia)}</h2>
                  <p className="mt-2 text-slate-400 text-sm">Acumulado Mês: <span className="text-emerald-400 font-bold">{formatMoney(data.totalRedeMes)}</span></p>
              </div>
              <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm relative z-10">
                  <Store className="h-10 w-10 text-emerald-400" />
              </div>
              {/* Decorativo */}
              <div className="absolute -right-10 -bottom-20 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl"></div>
          </div>

          {/* Ranking de Lojas */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50">
                  <h3 className="font-bold text-slate-800 text-lg">Ranking de Filiais (Hoje)</h3>
              </div>
              <div className="divide-y divide-slate-100">
                  {data.lojas.map((loja, idx) => (
                      <div key={loja.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-4">
                              <span className={`
                                  w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm
                                  ${idx === 0 ? 'bg-amber-100 text-amber-700' : 
                                    idx === 1 ? 'bg-slate-200 text-slate-600' : 
                                    idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-400'}
                              `}>
                                  {idx + 1}
                              </span>
                              <span className="font-bold text-slate-700">{loja.nome}</span>
                          </div>
                          <span className="font-mono font-bold text-slate-900">{formatMoney(loja.vendasDia)}</span>
                      </div>
                  ))}
              </div>
          </div>
      </div>
    )
}

// --- COMPONENTE 3: VISÃO DO OPERADOR (SIMPLES) ---
export function OperatorDashboard({ storeName }: { storeName: string }) {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center p-10 animate-in zoom-in duration-300">
            <div className="w-32 h-32 bg-blue-50 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <ShoppingBag className="h-16 w-16 text-blue-500" />
            </div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Bem-vindo à {storeName}</h1>
            <p className="text-slate-500 max-w-md">
                Utilize o menu lateral para iniciar um atendimento, consultar estoque ou verificar ordens de serviço.
            </p>
            <div className="mt-8 flex gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 w-32">
                    <p className="text-xs text-slate-400 uppercase font-bold">Atalhos</p>
                    <p className="text-blue-600 font-bold mt-1">F2: Venda</p>
                </div>
            </div>
        </div>
    )
}