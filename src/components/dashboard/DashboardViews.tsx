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
        <div className="space-y-6 animate-in fade-in duration-500 font-sans">

            {/* 1. Cards de Topo */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-black/20 p-5 rounded-2xl shadow-lg border border-white/5 backdrop-blur-sm flex flex-col justify-between hover:bg-black/30 transition-colors group">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-white/80 transition-colors">Vendas Hoje</p>
                            <h3 className="text-2xl font-black text-white mt-1 drop-shadow-md">{formatMoney(data.faturamentoDia)}</h3>
                        </div>
                        <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg shadow-lg shadow-emerald-500/10">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 font-medium">{data.qtdVendasDia} vendas realizadas</p>
                </div>

                <div className="bg-black/20 p-5 rounded-2xl shadow-lg border border-white/5 backdrop-blur-sm flex flex-col justify-between hover:bg-black/30 transition-colors group">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-white/80 transition-colors">Acumulado Mês</p>
                            <h3 className="text-2xl font-black text-blue-300 mt-1 drop-shadow-md">{formatMoney(data.faturamentoMes)}</h3>
                        </div>
                        <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg shadow-lg shadow-blue-500/10">
                            <Calendar className="h-5 w-5" />
                        </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 font-medium">Meta: (Não definida)</p>
                </div>

                <div className="bg-black/20 p-5 rounded-2xl shadow-lg border border-white/5 backdrop-blur-sm flex flex-col justify-between hover:bg-black/30 transition-colors group">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-white/80 transition-colors">Ticket Médio</p>
                            <h3 className="text-2xl font-black text-white mt-1 drop-shadow-md">{formatMoney(data.ticketMedio)}</h3>
                        </div>
                        <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg shadow-lg shadow-amber-500/10">
                            <Award className="h-5 w-5" />
                        </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 font-medium">Performance de Venda</p>
                </div>

                <div className="bg-black/20 p-5 rounded-2xl shadow-lg border border-white/5 backdrop-blur-sm flex flex-col justify-between hover:bg-black/30 transition-colors group">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-white/80 transition-colors">Estoque Crítico</p>
                            <h3 className="text-2xl font-black text-rose-400 mt-1 drop-shadow-md">{data.estoqueCritico}</h3>
                        </div>
                        <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg shadow-lg shadow-rose-500/10">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 font-medium">Produtos abaixo do mínimo</p>
                </div>
            </div>

            {/* 2. Área de Conteúdo (Placeholder para Gráficos Futuros) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-black/20 rounded-2xl p-6 border border-white/5 shadow-lg backdrop-blur-sm min-h-[300px] flex items-center justify-center text-slate-500 group hover:border-white/10 transition-all">
                    <div className="text-center group-hover:scale-105 transition-transform duration-500">
                        <TrendingUp className="h-16 w-16 mx-auto mb-4 opacity-20 text-white" />
                        <button className="px-6 py-2 rounded-full bg-white/5 border border-white/10 text-white/50 text-sm font-bold hover:bg-white/10 hover:text-white transition-all">
                            Gráfico de Desempenho (Em Breve)
                        </button>
                    </div>
                </div>
                <div className="bg-black/20 rounded-2xl p-6 border border-white/5 shadow-lg backdrop-blur-sm hover:border-white/10 transition-all">
                    <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                        <Users className="h-5 w-5 text-blue-400" /> Aniversariantes
                    </h3>
                    {data.aniversariantes.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">Nenhum aniversariante hoje.</p>
                    ) : (
                        <ul className="space-y-3">
                            {data.aniversariantes.map((cli, i) => (
                                <li key={i} className="text-sm text-slate-300 flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                                    <span className="font-medium text-white">{cli.nome}</span>

                                    <div className="flex items-center gap-3">

                                        <a
                                            href={`https://wa.me/${cli.fone ? '55' + cli.fone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(
                                                `Parabéns ${cli.nome.split(' ')[0]}! 🎉 A Ótica Pro deseja um feliz aniversário!`
                                            )}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1.5 bg-emerald-500/20 rounded-lg text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all shadow-lg shadow-emerald-500/20"
                                            title="Enviar felicitações pelo WhatsApp"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4"
                                                fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M20.52 3.48A11.8 11.8 0 0 0 12 0C5.37 0 0 5.37 0 12a11.9 11.9 0 0 0 1.64 6L0 24l6.25-1.64A11.9 11.9 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.19-1.24-6.2-3.48-8.52zM12 22a10 10 0 0 1-5.12-1.42l-.37-.22L3 21l.63-3.5-.23-.36A10 10 0 1 1 12 22zm5.13-7.53c-.28-.14-1.68-.83-1.94-.92-.26-.1-.45-.14-.64.14-.19.28-.74.92-.9 1.11-.17.19-.33.21-.62.07-.28-.14-1.17-.43-2.24-1.38-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.33.42-.49.14-.16.19-.28.28-.47.1-.19.05-.36-.02-.5-.07-.14-.64-1.54-.88-2.11-.23-.55-.47-.47-.64-.48h-.55c-.19 0-.5.07-.76.36-.26.28-1 1-1 2.43s1.02 2.82 1.16 3.01c.14.19 2 3.06 4.93 4.29.69.3 1.23.48 1.65.61.69.22 1.31.19 1.81.12.55-.08 1.68-.69 1.92-1.36.24-.66.24-1.23.17-1.36-.07-.14-.26-.21-.54-.35z" />
                                            </svg>
                                        </a>

                                        <span className="text-xs text-slate-500 font-mono">
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
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 font-sans">

            {/* Resumo da Rede */}
            <div className="bg-black/60 text-white p-8 rounded-3xl shadow-2xl flex justify-between items-center relative overflow-hidden ring-1 ring-white/10 backdrop-blur-xl">
                <div className="relative z-10">
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-sm mb-1">Faturamento Rede (Hoje)</p>
                    <h2 className="text-5xl font-black tracking-tight drop-shadow-lg">{formatMoney(data.totalRedeDia)}</h2>
                    <p className="mt-2 text-slate-400 text-sm">Acumulado Mês: <span className="text-emerald-400 font-bold uppercase tracking-wide">{formatMoney(data.totalRedeMes)}</span></p>
                </div>
                <div className="p-4 bg-emerald-500/10 rounded-2xl backdrop-blur-md relative z-10 ring-1 ring-emerald-500/20 shadow-lg shadow-emerald-900/50">
                    <Store className="h-10 w-10 text-emerald-400" />
                </div>
                {/* Decorativo */}
                <div className="absolute -right-20 -bottom-40 w-96 h-96 bg-emerald-500/20 rounded-full blur-[100px] opacity-50"></div>
                <div className="absolute -left-20 -top-40 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] opacity-30"></div>
            </div>

            {/* Ranking de Lojas */}
            <div className="bg-black/20 rounded-2xl border border-white/5 shadow-lg overflow-hidden backdrop-blur-sm">
                <div className="p-6 border-b border-white/5 bg-white/5">
                    <h3 className="font-bold text-white text-lg flex items-center gap-2">
                        <Award className="h-5 w-5 text-amber-400" /> Ranking de Filiais (Hoje)
                    </h3>
                </div>
                <div className="divide-y divide-white/5">
                    {data.lojas.map((loja, idx) => (
                        <div key={loja.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors group">
                            <div className="flex items-center gap-4">
                                <span className={`
                                  w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm shadow-lg
                                  ${idx === 0 ? 'bg-amber-500 text-white shadow-amber-500/50' :
                                        idx === 1 ? 'bg-slate-400 text-slate-900 shadow-slate-400/50' :
                                            idx === 2 ? 'bg-orange-700 text-orange-200 shadow-orange-700/50' : 'bg-white/10 text-slate-400'}
                              `}>
                                    {idx + 1}
                                </span>
                                <span className="font-bold text-slate-200 group-hover:text-white transition-colors">{loja.nome}</span>
                            </div>
                            <span className="font-mono font-bold text-emerald-400 drop-shadow-sm">{formatMoney(loja.vendasDia)}</span>
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