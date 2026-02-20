'use client';

import {
    DollarSign, HeartHandshake, Megaphone, Archive, Search,
    ArrowLeftRight, FileInput, Tag, FileSpreadsheet, ArrowLeft,
    AlertCircle, Gift, Calendar, Package, Clock, ChevronRight
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function DemoLojaVaziaPage() {
    const router = useRouter();

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center p-6 overflow-hidden">
            {/* Fundo gradiente suave - tema laranja/âmbar para Loja Vazia */}
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-slate-50 to-orange-50" />

            {/* Círculos decorativos desfocados */}
            <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-amber-200/40 to-orange-300/30 blur-3xl" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-orange-200/40 to-amber-300/30 blur-3xl" />

            {/* Conteúdo */}
            <div className="relative z-10 flex flex-col items-center w-full max-w-6xl">
                {/* Header */}
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-bold text-amber-700">Loja Vazia</h1>
                </div>

                {/* Layout Principal */}
                <div className="flex flex-col lg:flex-row gap-6 w-full">

                    {/* Coluna Esquerda - Menu de Ações */}
                    <div className="lg:w-1/3 flex flex-col">
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 text-center">Ações</h2>
                        <div className="grid grid-cols-2 gap-2">
                            {/* Livro Caixa */}
                            <button className="group bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(245,158,11,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(245,158,11,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                                <DollarSign className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Caixa</span>
                            </button>

                            {/* Pós-Venda */}
                            <button className="group bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(236,72,153,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(236,72,153,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                                <HeartHandshake className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Pós-Venda</span>
                            </button>

                            {/* Cobrança */}
                            <button className="group bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(239,68,68,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(239,68,68,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                                <Megaphone className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Cobrança</span>
                            </button>

                            {/* Gaveta */}
                            <button className="group bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(20,184,166,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(20,184,166,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                                <Archive className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Gaveta</span>
                            </button>

                            {/* Rastrear Lentes */}
                            <button className="group bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(99,102,241,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(99,102,241,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                                <Search className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Lentes</span>
                            </button>

                            {/* Movimentações */}
                            <button className="group bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(6,182,212,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(6,182,212,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                                <ArrowLeftRight className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Estoque</span>
                            </button>

                            {/* Importar XML */}
                            <button className="group bg-gradient-to-br from-slate-500 to-slate-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(100,116,139,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(100,116,139,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                                <FileInput className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">XML</span>
                            </button>

                            {/* Produtos */}
                            <button className="group bg-gradient-to-br from-violet-500 to-violet-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(139,92,246,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(139,92,246,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                                <Tag className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Produtos</span>
                            </button>

                            {/* Histórico - ocupando 2 colunas */}
                            <button className="group col-span-2 bg-gradient-to-br from-stone-500 to-stone-600 rounded-xl flex items-center justify-center gap-2 p-3 shadow-[0_8px_30px_-8px_rgba(120,113,108,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(120,113,108,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                                <FileSpreadsheet className="w-5 h-5 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-sm font-bold">Histórico Vendas</span>
                            </button>
                        </div>
                    </div>

                    {/* Linha Divisória Vertical */}
                    <div className="hidden lg:flex items-center">
                        <div className="w-px h-full bg-gradient-to-b from-transparent via-slate-300 to-transparent" />
                    </div>

                    {/* Coluna Direita - Radar Operacional */}
                    <div className="lg:flex-1 flex flex-col">
                        {/* Alerta Principal - Vendas em Aberto */}
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                                    <AlertCircle className="w-5 h-5 text-amber-600" />
                                </div>
                                <div>
                                    <span className="text-amber-800 font-bold text-sm">Atenção Operacional</span>
                                    <p className="text-amber-700 text-xs">Você tem <span className="font-bold text-amber-600">19 vendas em aberto</span></p>
                                </div>
                            </div>
                            <button className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1 transition-colors">
                                LISTAR <ChevronRight className="w-3 h-3" />
                            </button>
                        </div>

                        {/* Radar Operacional */}
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Clock className="w-4 h-4" /> Radar Operacional
                        </h2>

                        <div className="space-y-2">
                            {/* Vencimentos */}
                            <div className="bg-white/80 backdrop-blur rounded-xl p-3 flex items-center justify-between shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer group">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                                        <Calendar className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <span className="text-slate-700 font-bold text-sm">Vencimentos (Hoje/Amanhã)</span>
                                        <p className="text-slate-400 text-[10px]">Lembrete preventivo</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                            </div>

                            {/* Aniversariantes */}
                            <div className="bg-white/80 backdrop-blur rounded-xl p-3 flex items-center justify-between shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer group">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-pink-100 flex items-center justify-center">
                                        <Gift className="w-5 h-5 text-pink-600" />
                                    </div>
                                    <span className="text-slate-700 font-bold text-sm">Aniversariantes do Dia</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="bg-pink-100 text-pink-600 text-xs font-bold px-2 py-0.5 rounded-full">4</span>
                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                                </div>
                            </div>

                            {/* Entregar Hoje */}
                            <div className="bg-white/80 backdrop-blur rounded-xl p-3 flex items-center justify-between shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer group">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                                        <Package className="w-5 h-5 text-emerald-600" />
                                    </div>
                                    <span className="text-slate-700 font-bold text-sm">Entregar Hoje</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="bg-emerald-100 text-emerald-600 text-xs font-bold px-2 py-0.5 rounded-full">22</span>
                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                                </div>
                            </div>

                            {/* Lentes Paradas */}
                            <div className="bg-white/80 backdrop-blur rounded-xl p-3 flex items-center justify-between shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer group">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center">
                                        <AlertCircle className="w-5 h-5 text-rose-600" />
                                    </div>
                                    <span className="text-slate-700 font-bold text-sm">Lentes Não Pedidas</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="bg-rose-100 text-rose-600 text-xs font-bold px-2 py-0.5 rounded-full">6</span>
                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Botão Voltar (canto inferior esquerdo) */}
            <button
                onClick={() => router.push('/demo/menu')}
                className="absolute bottom-4 left-6 flex items-center gap-2 text-slate-400 hover:text-amber-600 transition-colors duration-200 text-sm font-medium z-10"
            >
                <ArrowLeft className="w-4 h-4" />
                Voltar
            </button>
        </div>
    );
}
