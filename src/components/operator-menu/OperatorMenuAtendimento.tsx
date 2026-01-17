'use client';

import {
    Zap, FileText, CheckCircle2, Wallet,
    LifeBuoy, Users, Globe, ArrowLeft, FileSearch
} from 'lucide-react';
import { useModals } from '@/lib/contexts/ModalsContext';

interface OperatorMenuAtendimentoProps {
    storeId: number;
    onBack: () => void;
    onNavigate: (route: string) => void;
}

export default function OperatorMenuAtendimento({
    storeId,
    onBack,
    onNavigate
}: OperatorMenuAtendimentoProps) {
    const { openParcelaModal, openEntregaModal, openCustomerHistoryModal } = useModals();

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center p-6 overflow-hidden">
            {/* Fundo gradiente suave - tema azul para atendimento */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50" />

            {/* Círculos decorativos desfocados */}
            <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-blue-200/40 to-blue-300/30 blur-3xl" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-indigo-200/40 to-blue-300/30 blur-3xl" />

            {/* Conteúdo */}
            <div className="relative z-10 flex flex-col items-center w-full max-w-4xl">
                {/* Header */}
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-bold text-blue-700">Atendimento</h1>
                </div>

                {/* Seção Superior: Vendas | Retorno */}
                <div className="flex flex-col lg:flex-row items-start justify-center gap-6 lg:gap-0 w-full">

                    {/* Coluna Vendas */}
                    <div className="flex-1 flex flex-col items-center">
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Vendas</h2>
                        <div className="flex flex-col gap-3 w-full max-w-xs">
                            {/* Receituário */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/atendimento`)}
                                className="group w-full bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center gap-4 px-5 py-4 shadow-[0_12px_40px_-10px_rgba(59,130,246,0.5)] hover:shadow-[0_16px_50px_-10px_rgba(59,130,246,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <FileText className="w-9 h-9 text-white/80 group-hover:scale-110 transition-transform duration-300 shrink-0" strokeWidth={1.5} />
                                <div className="text-left">
                                    <span className="text-white text-xl font-bold block">Receituário</span>
                                    <span className="text-white/50 text-[11px]">Venda com receita médica</span>
                                </div>
                            </button>

                            {/* Venda Rápida */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/pdv-express`)}
                                className="group w-full bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center gap-4 px-5 py-4 shadow-[0_12px_40px_-10px_rgba(59,130,246,0.5)] hover:shadow-[0_16px_50px_-10px_rgba(59,130,246,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <Zap className="w-9 h-9 text-white/80 group-hover:scale-110 transition-transform duration-300 shrink-0" strokeWidth={1.5} />
                                <div className="text-left">
                                    <span className="text-white text-xl font-bold block">Venda Rápida</span>
                                    <span className="text-white/50 text-[11px]">Sem receita ou produtos avulsos</span>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Linha Divisória Vertical */}
                    <div className="hidden lg:flex items-center px-6">
                        <div className="w-px h-44 bg-gradient-to-b from-transparent via-slate-300 to-transparent" />
                    </div>

                    {/* Linha Divisória Horizontal (mobile) */}
                    <div className="lg:hidden w-full max-w-md flex items-center justify-center">
                        <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
                    </div>

                    {/* Coluna Retorno */}
                    <div className="flex-1 flex flex-col items-center">
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Retorno</h2>
                        <div className="flex flex-col gap-3 w-full max-w-xs">
                            {/* Entrega Óculos */}
                            <button
                                onClick={() => openEntregaModal()}
                                className="group w-full bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center gap-4 px-5 py-3 shadow-[0_10px_35px_-8px_rgba(16,185,129,0.5)] hover:shadow-[0_14px_45px_-8px_rgba(16,185,129,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <CheckCircle2 className="w-7 h-7 text-white/80 group-hover:scale-110 transition-transform duration-300 shrink-0" strokeWidth={1.5} />
                                <div className="text-left">
                                    <span className="text-white text-lg font-bold block">Entrega</span>
                                    <span className="text-white/50 text-[10px]">Cliente veio buscar seu óculos</span>
                                </div>
                            </button>

                            {/* Baixa Parcelas */}
                            <button
                                onClick={() => openParcelaModal()}
                                className="group w-full bg-gradient-to-br from-violet-500 to-violet-600 rounded-xl flex items-center gap-4 px-5 py-3 shadow-[0_10px_35px_-8px_rgba(139,92,246,0.5)] hover:shadow-[0_14px_45px_-8px_rgba(139,92,246,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <Wallet className="w-7 h-7 text-white/80 group-hover:scale-110 transition-transform duration-300 shrink-0" strokeWidth={1.5} />
                                <div className="text-left">
                                    <span className="text-white text-lg font-bold block">Parcelas</span>
                                    <span className="text-white/50 text-[10px]">Cliente veio pagar parcela</span>
                                </div>
                            </button>

                            {/* Assistência */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/assistencia`)}
                                className="group w-full bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl flex items-center gap-4 px-5 py-3 shadow-[0_10px_35px_-8px_rgba(244,63,94,0.5)] hover:shadow-[0_14px_45px_-8px_rgba(244,63,94,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                            >
                                <LifeBuoy className="w-7 h-7 text-white/80 group-hover:scale-110 transition-transform duration-300 shrink-0" strokeWidth={1.5} />
                                <div className="text-left">
                                    <span className="text-white text-lg font-bold block">Assistência</span>
                                    <span className="text-white/50 text-[10px]">Conserto ou ajuste de óculos</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Linha Divisória Horizontal */}
                <div className="w-full max-w-2xl flex items-center justify-center my-5">
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
                </div>

                {/* Seção Apoio */}
                <div className="flex flex-col items-center w-full max-w-2xl">
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Apoio</h2>
                    <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                        {/* Clientes */}
                        <button
                            onClick={() => onNavigate(`/dashboard/loja/${storeId}/clientes`)}
                            className="group flex-1 max-w-xs bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex items-center gap-4 px-5 py-3 shadow-[0_10px_35px_-8px_rgba(6,182,212,0.5)] hover:shadow-[0_14px_45px_-8px_rgba(6,182,212,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                        >
                            <Users className="w-8 h-8 text-white/80 group-hover:scale-110 transition-transform duration-300 shrink-0" strokeWidth={1.5} />
                            <div className="text-left">
                                <span className="text-white text-lg font-bold block">Clientes</span>
                                <span className="text-white/50 text-[10px]">Consultar ou cadastrar</span>
                            </div>
                        </button>

                        {/* Busca Universal */}
                        <button
                            onClick={() => onNavigate(`/dashboard/loja/${storeId}/consultas`)}
                            className="group flex-1 max-w-xs bg-gradient-to-br from-slate-500 to-slate-600 rounded-xl flex items-center gap-4 px-5 py-3 shadow-[0_10px_35px_-8px_rgba(100,116,139,0.5)] hover:shadow-[0_14px_45px_-8px_rgba(100,116,139,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                        >
                            <Globe className="w-8 h-8 text-white/80 group-hover:scale-110 transition-transform duration-300 shrink-0" strokeWidth={1.5} />
                            <div className="text-left">
                                <span className="text-white text-lg font-bold block">Busca</span>
                                <span className="text-white/50 text-[10px]">Pesquisar vendas, OS, etc.</span>
                            </div>
                        </button>

                        {/* Info Clientes */}
                        <button
                            onClick={() => openCustomerHistoryModal()}
                            className="group flex-1 max-w-xs bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center gap-4 px-5 py-3 shadow-[0_10px_35px_-8px_rgba(168,85,247,0.5)] hover:shadow-[0_14px_45px_-8px_rgba(168,85,247,0.6)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                        >
                            <FileSearch className="w-8 h-8 text-white/80 group-hover:scale-110 transition-transform duration-300 shrink-0" strokeWidth={1.5} />
                            <div className="text-left">
                                <span className="text-white text-lg font-bold block">Info Clientes</span>
                                <span className="text-white/50 text-[10px]">Parcelas e graus do cliente</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {/* Botão Voltar (canto inferior esquerdo) */}
            <button
                onClick={onBack}
                className="absolute bottom-4 left-6 flex items-center gap-2 text-slate-400 hover:text-blue-600 transition-colors duration-200 text-sm font-medium z-10"
            >
                <ArrowLeft className="w-4 h-4" />
                Voltar
            </button>
        </div>
    );
}
