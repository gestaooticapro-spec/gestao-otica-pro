'use client';

import {
    Zap, FileText, CheckCircle2, Wallet,
    LifeBuoy, Users, Globe, ArrowLeft, FileSearch, ArrowRight
} from 'lucide-react';
import { useModals } from '@/lib/contexts/ModalsContext';

import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';

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
    const { preference } = useBackgroundPreference();

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center p-6 overflow-hidden bg-slate-950 transition-colors duration-500">
            {/* Toggle de Fundo */}
            <div className="absolute top-6 right-6 z-50">
                <BackgroundToggle />
            </div>

            {/* Background Image */}
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/atendimento.jpg')] bg-cover bg-center opacity-60" />
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            </div>

            {/* Conteúdo */}
            <div className="relative z-10 flex flex-col items-center w-full max-w-5xl">
                {/* Header */}
                <div className="mb-8 text-center animate-in slide-in-from-top-5 duration-700">
                    <h1 className="text-4xl font-black text-white drop-shadow-lg tracking-tight mb-2">
                        Atendimento
                    </h1>
                    <p className="text-slate-300 text-sm font-medium uppercase tracking-[0.2em] bg-white/5 px-4 py-1 rounded-full border border-white/5 inline-block">
                        Selecione uma Operação
                    </p>
                </div>

                {/* Seção Superior: Vendas | Retorno */}
                <div className="flex flex-col lg:flex-row items-start justify-center gap-8 lg:gap-0 w-full mb-8">

                    {/* Coluna Vendas (BLUE THEME) */}
                    <div className="flex-1 flex flex-col items-center w-full">
                        <h2 className="text-lg font-black text-blue-300 uppercase tracking-widest mb-6 flex flex-col items-center drop-shadow-md">
                            Vendas
                            <span className="block w-12 h-1 bg-blue-500 rounded-full mt-2 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                        </h2>
                        <div className="flex flex-col gap-4 w-full max-w-sm">
                            {/* Receituário */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/atendimento`)}
                                className="group w-full bg-gradient-to-br from-blue-600/20 via-blue-900/40 to-slate-900/60 rounded-2xl flex items-center gap-5 px-6 py-5 shadow-lg border border-white/10 backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20 hover:border-blue-500/30"
                            >
                                <div className="p-3 rounded-full bg-blue-500/20 ring-1 ring-blue-400/30 group-hover:bg-blue-500/40 transition-colors shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                                    <FileText className="w-8 h-8 text-blue-200 group-hover:text-white transition-colors shrink-0" strokeWidth={1.5} />
                                </div>
                                <div className="text-left flex-1">
                                    <span className="text-white text-xl font-bold block mb-0.5">Receituário</span>
                                    <span className="text-blue-200/70 text-xs font-medium group-hover:text-blue-100 transition-colors">Venda com receita médica</span>
                                </div>
                                {/* Arrow Overlay like Home */}
                                <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                                    <ArrowRight className="w-5 h-5 text-blue-300" />
                                </div>
                            </button>

                            {/* Venda Rápida */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/pdv-express`)}
                                className="group w-full bg-gradient-to-br from-blue-600/20 via-blue-900/40 to-slate-900/60 rounded-2xl flex items-center gap-5 px-6 py-5 shadow-lg border border-white/10 backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20 hover:border-blue-500/30"
                            >
                                <div className="p-3 rounded-full bg-blue-500/20 ring-1 ring-blue-400/30 group-hover:bg-blue-500/40 transition-colors shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                                    <Zap className="w-8 h-8 text-blue-200 group-hover:text-white transition-colors shrink-0" strokeWidth={1.5} />
                                </div>
                                <div className="text-left flex-1">
                                    <span className="text-white text-xl font-bold block mb-0.5">Venda Rápida</span>
                                    <span className="text-blue-200/70 text-xs font-medium group-hover:text-blue-100 transition-colors">Sem receita / Avulso</span>
                                </div>
                                <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                                    <ArrowRight className="w-5 h-5 text-blue-300" />
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Linha Divisória Vertical */}
                    <div className="hidden lg:flex items-center px-10 self-stretch">
                        <div className="w-px h-full min-h-[200px] bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                    </div>

                    {/* Linha Divisória Horizontal (mobile) */}
                    <div className="lg:hidden w-full max-w-md flex items-center justify-center my-6">
                        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </div>

                    {/* Coluna Retorno (AMBER THEME - Matching "Loja Vazia") */}
                    <div className="flex-1 flex flex-col items-center w-full">
                        <h2 className="text-lg font-black text-amber-300 uppercase tracking-widest mb-6 flex flex-col items-center drop-shadow-md">
                            Retorno
                            <span className="block w-12 h-1 bg-amber-500 rounded-full mt-2 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></span>
                        </h2>
                        <div className="flex flex-col gap-4 w-full max-w-sm">
                            {/* Entrega Óculos */}
                            <button
                                onClick={() => openEntregaModal()}
                                className="group w-full bg-gradient-to-br from-amber-600/20 via-orange-900/40 to-slate-900/60 rounded-2xl flex items-center gap-5 px-6 py-4 shadow-lg border border-white/10 backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-amber-500/20 hover:border-amber-500/30"
                            >
                                <div className="p-2.5 rounded-full bg-amber-500/20 ring-1 ring-amber-400/30 group-hover:bg-amber-500/40 transition-colors shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                                    <CheckCircle2 className="w-7 h-7 text-amber-200 group-hover:text-white transition-colors shrink-0" strokeWidth={1.5} />
                                </div>
                                <div className="text-left flex-1">
                                    <span className="text-white text-lg font-bold block">Entrega</span>
                                    <span className="text-amber-200/70 text-[10px] uppercase tracking-wide group-hover:text-amber-100 transition-colors">Buscar óculos</span>
                                </div>
                                <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                                    <ArrowRight className="w-5 h-5 text-amber-300" />
                                </div>
                            </button>

                            {/* Baixa Parcelas */}
                            <button
                                onClick={() => openParcelaModal()}
                                className="group w-full bg-gradient-to-br from-amber-600/20 via-orange-900/40 to-slate-900/60 rounded-2xl flex items-center gap-5 px-6 py-4 shadow-lg border border-white/10 backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-amber-500/20 hover:border-amber-500/30"
                            >
                                <div className="p-2.5 rounded-full bg-amber-500/20 ring-1 ring-amber-400/30 group-hover:bg-amber-500/40 transition-colors shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                                    <Wallet className="w-7 h-7 text-amber-200 group-hover:text-white transition-colors shrink-0" strokeWidth={1.5} />
                                </div>
                                <div className="text-left flex-1">
                                    <span className="text-white text-lg font-bold block">Parcelas</span>
                                    <span className="text-amber-200/70 text-[10px] uppercase tracking-wide group-hover:text-amber-100 transition-colors">Pagamento</span>
                                </div>
                                <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                                    <ArrowRight className="w-5 h-5 text-amber-300" />
                                </div>
                            </button>

                            {/* Assistência */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/assistencia`)}
                                className="group w-full bg-gradient-to-br from-amber-600/20 via-orange-900/40 to-slate-900/60 rounded-2xl flex items-center gap-5 px-6 py-4 shadow-lg border border-white/10 backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-amber-500/20 hover:border-amber-500/30"
                            >
                                <div className="p-2.5 rounded-full bg-amber-500/20 ring-1 ring-amber-400/30 group-hover:bg-amber-500/40 transition-colors shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                                    <LifeBuoy className="w-7 h-7 text-amber-200 group-hover:text-white transition-colors shrink-0" strokeWidth={1.5} />
                                </div>
                                <div className="text-left flex-1">
                                    <span className="text-white text-lg font-bold block">Assistência</span>
                                    <span className="text-amber-200/70 text-[10px] uppercase tracking-wide group-hover:text-amber-100 transition-colors">Conserto/Ajuste</span>
                                </div>
                                <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                                    <ArrowRight className="w-5 h-5 text-amber-300" />
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Linha Divisória Horizontal */}
                <div className="w-full max-w-3xl flex items-center justify-center mb-8 mt-2">
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>

                {/* Seção Apoio (NEUTRAL/SLATE THEME) */}
                <div className="flex flex-col items-center w-full max-w-4xl bg-black/20 backdrop-blur-md rounded-3xl p-6 border border-white/5 mx-4">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-3">
                        <span className="w-8 h-px bg-slate-600"></span>
                        Apoio Operacional
                        <span className="w-8 h-px bg-slate-600"></span>
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                        {/* Clientes */}
                        <button
                            onClick={() => onNavigate(`/dashboard/loja/${storeId}/clientes`)}
                            className="group bg-white/5 hover:bg-slate-700/30 rounded-xl flex items-center gap-4 px-4 py-3 border border-white/5 hover:border-slate-500/30 transition-all duration-300 cursor-pointer"
                        >
                            <div className="p-2 rounded-lg bg-slate-500/20 text-slate-300 group-hover:bg-slate-500 group-hover:text-white transition-colors">
                                <Users className="w-5 h-5" strokeWidth={2} />
                            </div>
                            <div className="text-left">
                                <span className="text-slate-200 text-sm font-bold block group-hover:text-white transition-colors">Clientes</span>
                                <span className="text-slate-500 text-[10px] group-hover:text-slate-300 transition-colors">Cadastro</span>
                            </div>
                        </button>

                        {/* Busca Universal */}
                        <button
                            onClick={() => onNavigate(`/dashboard/loja/${storeId}/consultas`)}
                            className="group bg-white/5 hover:bg-slate-700/30 rounded-xl flex items-center gap-4 px-4 py-3 border border-white/5 hover:border-slate-500/30 transition-all duration-300 cursor-pointer"
                        >
                            <div className="p-2 rounded-lg bg-slate-500/20 text-slate-300 group-hover:bg-slate-500 group-hover:text-white transition-colors">
                                <Globe className="w-5 h-5" strokeWidth={2} />
                            </div>
                            <div className="text-left">
                                <span className="text-slate-200 text-sm font-bold block group-hover:text-white transition-colors">Busca</span>
                                <span className="text-slate-500 text-[10px] group-hover:text-slate-300 transition-colors">Geral</span>
                            </div>
                        </button>

                        {/* Info Clientes */}
                        <button
                            onClick={() => openCustomerHistoryModal()}
                            className="group bg-white/5 hover:bg-slate-700/30 rounded-xl flex items-center gap-4 px-4 py-3 border border-white/5 hover:border-slate-500/30 transition-all duration-300 cursor-pointer"
                        >
                            <div className="p-2 rounded-lg bg-slate-500/20 text-slate-300 group-hover:bg-slate-500 group-hover:text-white transition-colors">
                                <FileSearch className="w-5 h-5" strokeWidth={2} />
                            </div>
                            <div className="text-left">
                                <span className="text-slate-200 text-sm font-bold block group-hover:text-white transition-colors">Info</span>
                                <span className="text-slate-500 text-[10px] group-hover:text-slate-300 transition-colors">Histórico</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {/* Botão Voltar */}
            <button
                onClick={onBack}
                className="absolute bottom-6 left-6 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all duration-300 border border-white/5 hover:border-white/20 backdrop-blur-sm z-20 group"
            >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs font-bold uppercase tracking-wider">Voltar</span>
            </button>
        </div>
    );
}
