'use client';

import { useEffect, useState } from 'react';
import {
    DollarSign, HeartHandshake, Megaphone, Archive, Search,
    ArrowLeftRight, FileInput, Tag, FileSpreadsheet, ArrowLeft, Clock,
    AlertCircle, Gift, Calendar, Package, ChevronRight
} from 'lucide-react';
import { useModals } from '@/lib/contexts/ModalsContext';

interface OperatorMenuLojaVaziaProps {
    storeId: number;
    storeName?: string;
    onBack: () => void;
    onNavigate: (route: string) => void;
}

// Tipos simplificados para os dados do radar
interface RadarData {
    vendasEmAberto: number;
    aniversariantes: number;
    entregarHoje: number;
    lentesParadas: number;
}

export default function OperatorMenuLojaVazia({
    storeId,
    storeName = 'Ótica',
    onBack,
    onNavigate
}: OperatorMenuLojaVaziaProps) {
    const { openLabModal } = useModals();

    // Estados para dados do radar
    const [radar, setRadar] = useState<RadarData>({
        vendasEmAberto: 0,
        aniversariantes: 0,
        entregarHoje: 0,
        lentesParadas: 0
    });
    const [loading, setLoading] = useState(true);

    // Buscar dados ao montar o componente
    useEffect(() => {
        async function fetchData() {
            try {
                const response = await fetch(`/api/alertas-operacionais?storeId=${storeId}`);
                if (response.ok) {
                    const data = await response.json();
                    setRadar({
                        vendasEmAberto: data.vendasEmAberto || 0,
                        aniversariantes: data.aniversariantes?.length || 0,
                        entregarHoje: data.entregas?.length || 0,
                        lentesParadas: data.laboratorio?.length || 0
                    });
                }
            } catch (error) {
                console.error('Erro ao buscar alertas:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [storeId]);

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-start p-6 overflow-auto">
            {/* Fundo gradiente suave */}
            <div className="fixed inset-0 bg-gradient-to-br from-amber-50 via-slate-50 to-orange-50 -z-10" />

            {/* Círculos decorativos */}
            <div className="fixed top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-amber-200/40 to-orange-300/30 blur-3xl -z-10" />
            <div className="fixed bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-orange-200/40 to-amber-300/30 blur-3xl -z-10" />

            {/* Conteúdo */}
            <div className="relative z-10 flex flex-col items-center w-full max-w-6xl">
                {/* Header */}
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-bold text-amber-700">Loja Vazia</h1>
                </div>

                {/* Layout Principal */}
                <div className="flex flex-row gap-6 w-full">

                    {/* Coluna Esquerda - Menu de Ações */}
                    <div className="w-1/3 flex flex-col shrink-0">
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 text-center">Ações</h2>
                        <div className="grid grid-cols-2 gap-2">
                            {/* Livro Caixa */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/financeiro/caixa`)}
                                className="group bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(245,158,11,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(245,158,11,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <DollarSign className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Caixa</span>
                            </button>

                            {/* Pós-Venda */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/pos-venda`)}
                                className="group bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(236,72,153,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(236,72,153,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <HeartHandshake className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Pós-Venda</span>
                            </button>

                            {/* Cobrança */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/cobranca`)}
                                className="group bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(239,68,68,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(239,68,68,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <Megaphone className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Cobrança</span>
                            </button>

                            {/* Gaveta */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/gaveta`)}
                                className="group bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(20,184,166,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(20,184,166,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <Archive className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Gaveta</span>
                            </button>

                            {/* Rastrear Lentes */}
                            <button
                                onClick={() => openLabModal()}
                                className="group bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(99,102,241,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(99,102,241,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <Search className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Lentes</span>
                            </button>

                            {/* Movimentações */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/estoque/movimentacoes`)}
                                className="group bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(6,182,212,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(6,182,212,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <ArrowLeftRight className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Estoque</span>
                            </button>

                            {/* Importar XML */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/importacao`)}
                                className="group bg-gradient-to-br from-slate-500 to-slate-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(100,116,139,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(100,116,139,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <FileInput className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">XML</span>
                            </button>

                            {/* Produtos */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/cadastros`)}
                                className="group bg-gradient-to-br from-violet-500 to-violet-600 rounded-xl flex flex-col items-center justify-center gap-1 p-3 shadow-[0_8px_30px_-8px_rgba(139,92,246,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(139,92,246,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <Tag className="w-6 h-6 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-xs font-bold">Produtos</span>
                            </button>

                            {/* Histórico - ocupando 2 colunas */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/vendas?mode=historico`)}
                                className="group col-span-2 bg-gradient-to-br from-stone-500 to-stone-600 rounded-xl flex items-center justify-center gap-2 p-3 shadow-[0_8px_30px_-8px_rgba(120,113,108,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(120,113,108,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <FileSpreadsheet className="w-5 h-5 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <span className="text-white text-sm font-bold">Histórico Vendas</span>
                            </button>
                        </div>
                    </div>

                    {/* Linha Divisória Vertical */}
                    <div className="flex items-center">
                        <div className="w-px h-full bg-gradient-to-b from-transparent via-slate-300 to-transparent" />
                    </div>

                    {/* Coluna Direita - Radar Operacional */}
                    <div className="flex-1 flex flex-col gap-4">
                        {/* ALERTA PRINCIPAL - Vendas em Aberto (ESTILO ORIGINAL) */}
                        {radar.vendasEmAberto > 0 && (
                            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                                        <AlertCircle className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <span className="text-amber-800 font-bold text-sm">Atenção Operacional</span>
                                        <p className="text-amber-700 text-xs">Você tem <span className="font-bold text-amber-600">{radar.vendasEmAberto} vendas em aberto</span></p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onNavigate(`/dashboard/loja/${storeId}/vendas?mode=pendencias`)}
                                    className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1 transition-colors"
                                >
                                    LISTAR <ChevronRight className="w-3 h-3" />
                                </button>
                            </div>
                        )}

                        {/* RADAR OPERACIONAL (ESTILO ORIGINAL) */}
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Clock className="w-4 h-4" /> Radar Operacional
                        </h2>

                        {loading ? (
                            <div className="flex items-center justify-center py-10">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {/* Vencimentos */}
                                <div
                                    onClick={() => onNavigate(`/dashboard/loja/${storeId}/pos-venda?tab=vencimentos`)}
                                    className="bg-white/80 backdrop-blur rounded-xl p-3 flex items-center justify-between shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer group"
                                >
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
                                <div
                                    onClick={() => onNavigate(`/dashboard/loja/${storeId}/pos-venda?tab=aniversarios`)}
                                    className="bg-white/80 backdrop-blur rounded-xl p-3 flex items-center justify-between shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-pink-100 flex items-center justify-center">
                                            <Gift className="w-5 h-5 text-pink-600" />
                                        </div>
                                        <span className="text-slate-700 font-bold text-sm">Aniversariantes do Dia</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {radar.aniversariantes > 0 && (
                                            <span className="bg-pink-100 text-pink-600 text-xs font-bold px-2 py-0.5 rounded-full">{radar.aniversariantes}</span>
                                        )}
                                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                                    </div>
                                </div>

                                {/* Entregar Hoje */}
                                <div
                                    onClick={() => onNavigate(`/dashboard/loja/${storeId}/gaveta`)}
                                    className="bg-white/80 backdrop-blur rounded-xl p-3 flex items-center justify-between shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                                            <Package className="w-5 h-5 text-emerald-600" />
                                        </div>
                                        <span className="text-slate-700 font-bold text-sm">Entregar Hoje</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {radar.entregarHoje > 0 && (
                                            <span className="bg-emerald-100 text-emerald-600 text-xs font-bold px-2 py-0.5 rounded-full">{radar.entregarHoje}</span>
                                        )}
                                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                                    </div>
                                </div>

                                {/* Lentes Paradas */}
                                <div
                                    onClick={() => openLabModal()}
                                    className="bg-white/80 backdrop-blur rounded-xl p-3 flex items-center justify-between shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center">
                                            <AlertCircle className="w-5 h-5 text-rose-600" />
                                        </div>
                                        <span className="text-slate-700 font-bold text-sm">Lentes Paradas</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {radar.lentesParadas > 0 && (
                                            <span className="bg-rose-100 text-rose-600 text-xs font-bold px-2 py-0.5 rounded-full">{radar.lentesParadas}</span>
                                        )}
                                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Botão Voltar - MAIS DESTACADO */}
            <button
                onClick={onBack}
                className="fixed bottom-6 left-6 flex items-center gap-2 bg-white hover:bg-amber-50 text-amber-600 hover:text-amber-700 border border-amber-200 hover:border-amber-300 transition-all duration-200 text-sm font-bold z-10 px-5 py-3 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
                <ArrowLeft className="w-5 h-5" />
                Voltar ao Menu
            </button>
        </div>
    );
}
