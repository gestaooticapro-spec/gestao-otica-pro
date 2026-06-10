'use client';

import {
    Zap, FileText, CheckCircle2, Wallet,
    LifeBuoy, Users, Globe, ArrowLeft, FileSearch, ArrowRight,
    Search, Loader2, X, User, MessageCircle, Sparkles, Tag
} from 'lucide-react';
import { useModals } from '@/lib/contexts/ModalsContext';
import { useState, useEffect, useRef } from 'react';
import { searchCustomersQuick, CustomerSearchResult } from '@/lib/actions/customer-history.actions';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { useStoreModules } from '@/lib/contexts/StoreModulesContext';
import FullscreenToggleButton from '@/components/FullscreenToggleButton';

interface OperatorMenuAtendimentoProps {
    storeId: number;
    onBack: () => void;
    onNavigate: (route: string) => void;
    preSaleAnalysisEnabled?: boolean;
}

// --- SUB-COMPONENTE: MODAL DE BUSCA PARA HISTÓRICO ---
function SearchRedirectModal({
    isOpen,
    onClose,
    storeId,
    onNavigate
}: {
    isOpen: boolean;
    onClose: () => void;
    storeId: number;
    onNavigate: (route: string) => void;
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<CustomerSearchResult[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchTerm.length >= 2) {
                setLoading(true);
                const res = await searchCustomersQuick(searchTerm, storeId);
                setResults(res);
                setLoading(false);
            } else {
                setResults([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, storeId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[600px]">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <FileSearch className="w-5 h-5 text-indigo-400" />
                        Buscar Cliente para Histórico
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                        <input
                            autoFocus
                            placeholder="Nome, CPF ou Telefone..."
                            className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400 animate-spin" />}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
                    {results.length > 0 ? (
                        results.map(c => (
                            <button
                                key={c.id}
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/cliente/${c.id}/historico`)}
                                className="w-full text-left p-3 hover:bg-white/5 rounded-xl flex items-center gap-3 transition-colors group border border-transparent hover:border-white/5"
                            >
                                <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 border border-indigo-500/20 group-hover:bg-indigo-500/30 group-hover:text-indigo-200 transition-colors">
                                    <User className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-bold text-slate-200 group-hover:text-white transition-colors">{c.nome}</p>
                                    <p className="text-xs text-slate-500">{c.cpf || 'Sem CPF'} • {c.fone || 'Sem Tel'}</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-600 ml-auto group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
                            </button>
                        ))
                    ) : searchTerm.length >= 2 && !loading ? (
                        <div className="text-center py-8 text-slate-500">
                            <p>Nenhum cliente encontrado.</p>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500 flex flex-col items-center">
                            <Search className="w-12 h-12 mb-2 opacity-20" />
                            <p className="text-sm">Digite para pesquisar...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function OperatorMenuAtendimento({
    storeId,
    onBack,
    onNavigate,
    preSaleAnalysisEnabled = false
}: OperatorMenuAtendimentoProps) {
    const { openParcelaModal, openCustomerHistoryModal } = useModals();
    const { preference } = useBackgroundPreference();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const modules = useStoreModules();

    const [tooltip, setTooltip] = useState<{ visible: boolean, x: number, y: number, text: string }>({ visible: false, x: 0, y: 0, text: '' });
    const hoverTimeout = useRef<NodeJS.Timeout | null>(null);

    const handleHover = (e: React.MouseEvent, text: string) => {
        const x = e.clientX;
        const y = e.clientY;
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        hoverTimeout.current = setTimeout(() => {
            setTooltip({ visible: true, x, y, text });
        }, 1200);
    };
    const handleMove = (e: React.MouseEvent) => {
        if (tooltip.visible) {
            setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
        }
    };
    const handleLeave = () => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        setTooltip(prev => ({ ...prev, visible: false }));
    };

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center p-6 overflow-hidden bg-slate-950 transition-colors duration-500">

            <SearchRedirectModal
                key={isSearchOpen ? 'search-open' : 'search-closed'}
                isOpen={isSearchOpen}
                onClose={() => setIsSearchOpen(false)}
                storeId={storeId}
                onNavigate={onNavigate}
            />

            {/* Toggle de Fundo */}
            <div className="absolute top-6 right-6 z-50 flex items-center gap-3">
                <FullscreenToggleButton className="right-20 top-6" />
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
                <div className="flex flex-col lg:flex-row items-start justify-center gap-6 lg:gap-0 w-full mb-4">

                    {/* Coluna Esquerda: Pré-Venda e Vendas */}
                    <div className="flex-1 flex flex-col items-center w-full gap-4">

                        {/* Bloco Pré-Venda */}
                        <div className="flex flex-col items-center w-full">
                            <h2 className="text-lg font-black text-indigo-300 uppercase tracking-widest mb-6 flex flex-col items-center drop-shadow-md">
                                Pré-Venda
                                <span className="block w-12 h-1 bg-indigo-500 rounded-full mt-2 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></span>
                            </h2>
                            <div className="flex flex-col gap-4 w-full max-w-sm">
                                {/* Botão Dossiê */}
                                <button
                                    onClick={() => setIsSearchOpen(true)}
                                    onMouseEnter={(e) => handleHover(e, "Inicie um atendimento completo baseado no histórico do cliente. Veja compras anteriores, dados de visão (receita/DNP), preferências e ofereça uma consultoria super personalizada.")}
                                    onMouseMove={handleMove}
                                    onMouseLeave={handleLeave}
                                    className="group w-full bg-gradient-to-br from-indigo-600/20 via-indigo-900/40 to-slate-900/60 rounded-2xl flex items-center gap-5 px-6 py-3 shadow-lg border border-white/10 backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-500/20 hover:border-indigo-500/30"
                                >
                                    <div className="p-2.5 rounded-full bg-indigo-500/20 ring-1 ring-indigo-400/30 group-hover:bg-indigo-500/40 transition-colors shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                                        <FileSearch className="w-7 h-7 text-indigo-200 group-hover:text-white transition-colors shrink-0" strokeWidth={1.5} />
                                    </div>
                                    <div className="text-left flex-1">
                                        <span className="text-white text-lg font-bold block mb-0.5">Dossiê</span>
                                        <span className="text-indigo-200/70 text-[10px] uppercase tracking-wide group-hover:text-indigo-100 transition-colors">Raio-X Completo</span>
                                    </div>
                                    <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                                        <ArrowRight className="w-5 h-5 text-indigo-300" />
                                    </div>
                                </button>

                                {preSaleAnalysisEnabled && modules.evaluation && (
                                    <button
                                        onClick={() => onNavigate(`/dashboard/loja/${storeId}/avaliacao`)}
                                        onMouseEnter={(e) => handleHover(e, "Abra a tela de Avaliação para registrar análises pré-venda, importar o PDF do iVision e manter histórico individual por titular ou dependente.")}
                                        onMouseMove={handleMove}
                                        onMouseLeave={handleLeave}
                                        className="group w-full bg-gradient-to-br from-indigo-600/20 via-indigo-900/30 to-slate-900/60 rounded-2xl flex items-center gap-5 px-6 py-3 shadow-lg border border-white/10 backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-500/20 hover:border-indigo-500/30"
                                    >
                                        <div className="p-2.5 rounded-full bg-indigo-500/20 ring-1 ring-indigo-400/30 group-hover:bg-indigo-500/40 transition-colors shadow-[0_0_15px_rgba(99,102,241,0.25)]">
                                            <Sparkles className="w-7 h-7 text-indigo-200 group-hover:text-white transition-colors shrink-0" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left flex-1">
                                            <span className="text-white text-lg font-bold block mb-0.5">Avaliação</span>
                                            <span className="text-indigo-200/70 text-[10px] uppercase tracking-wide group-hover:text-indigo-100 transition-colors">Análise pré-venda</span>
                                        </div>
                                        <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                                            <ArrowRight className="w-5 h-5 text-indigo-300" />
                                        </div>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Bloco Vendas */}
                        <div className="flex flex-col items-center w-full">
                            <h2 className="text-lg font-black text-blue-300 uppercase tracking-widest mb-6 flex flex-col items-center drop-shadow-md">
                                Vendas
                                <span className="block w-12 h-1 bg-blue-500 rounded-full mt-2 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                            </h2>
                            <div className="flex flex-col gap-4 w-full max-w-sm">
                                {/* Receituário */}
                                <button
                                    onClick={() => onNavigate(`/dashboard/loja/${storeId}/atendimento`)}
                                    onMouseEnter={(e) => handleHover(e, "Fluxo tradicional para clientes que trouxeram prescrição do oftalmologista. Venda de armação, lentes oftálmicas, tratamentos e serviços laboratoriais.")}
                                    onMouseMove={handleMove}
                                    onMouseLeave={handleLeave}
                                    className="group w-full bg-gradient-to-br from-blue-600/20 via-blue-900/40 to-slate-900/60 rounded-2xl flex items-center gap-5 px-6 py-3 shadow-lg border border-white/10 backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20 hover:border-blue-500/30"
                                >
                                    <div className="p-2.5 rounded-full bg-blue-500/20 ring-1 ring-blue-400/30 group-hover:bg-blue-500/40 transition-colors shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                                        <FileText className="w-7 h-7 text-blue-200 group-hover:text-white transition-colors shrink-0" strokeWidth={1.5} />
                                    </div>
                                    <div className="text-left flex-1">
                                        <span className="text-white text-lg font-bold block mb-0.5">Receituário</span>
                                        <span className="text-blue-200/70 text-[10px] uppercase tracking-wide group-hover:text-blue-100 transition-colors">Venda com receita médica</span>
                                    </div>
                                    {/* Arrow Overlay like Home */}
                                    <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                                        <ArrowRight className="w-5 h-5 text-blue-300" />
                                    </div>
                                </button>

                                {/* Venda Rápida */}
                                {modules.quickSale && <button
                                    onClick={() => onNavigate(`/dashboard/loja/${storeId}/pdv-express`)}
                                    onMouseEnter={(e) => handleHover(e, "Venda expressa avulsa. Ideal para óculos de sol, caixa de lentes de contato, líquidos e acessórios diversos de prateleira.")}
                                    onMouseMove={handleMove}
                                    onMouseLeave={handleLeave}
                                    className="group w-full bg-gradient-to-br from-blue-600/20 via-blue-900/40 to-slate-900/60 rounded-2xl flex items-center gap-5 px-6 py-3 shadow-lg border border-white/10 backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20 hover:border-blue-500/30"
                                >
                                    <div className="p-2.5 rounded-full bg-blue-500/20 ring-1 ring-blue-400/30 group-hover:bg-blue-500/40 transition-colors shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                                        <Zap className="w-7 h-7 text-blue-200 group-hover:text-white transition-colors shrink-0" strokeWidth={1.5} />
                                    </div>
                                    <div className="text-left flex-1">
                                        <span className="text-white text-lg font-bold block mb-0.5">Venda Rápida</span>
                                        <span className="text-blue-200/70 text-[10px] uppercase tracking-wide group-hover:text-blue-100 transition-colors">Sem receita / Avulso</span>
                                    </div>
                                    <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                                        <ArrowRight className="w-5 h-5 text-blue-300" />
                                    </div>
                                </button>}
                            </div>
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
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/entrega`)}
                                onMouseEnter={(e) => handleHover(e, "Use este botão quando o cliente vier buscar o óculos pronto.")}
                                onMouseMove={handleMove}
                                onMouseLeave={handleLeave}
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
                            {modules.installments && <button
                                onClick={() => openParcelaModal()}
                                onMouseEnter={(e) => handleHover(e, "Use este botão quando o cliente vier pagar uma parcela.")}
                                onMouseMove={handleMove}
                                onMouseLeave={handleLeave}
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
                            </button>}

                            {/* Assistência */}
                            <button
                                onClick={() => onNavigate(`/dashboard/loja/${storeId}/assistencia`)}
                                onMouseEnter={(e) => handleHover(e, "Use este botão quando o cliente vier pedir uma assistência ou fazer um conserto.")}
                                onMouseMove={handleMove}
                                onMouseLeave={handleLeave}
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
                <div className="w-full max-w-3xl flex items-center justify-center mb-2 mt-0">
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>

                {/* Seção Apoio (NEUTRAL/SLATE THEME) */}
                <div className="flex flex-col items-center w-full max-w-4xl bg-black/20 backdrop-blur-md rounded-3xl py-4 px-6 border border-white/5 mx-4">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-3">
                        <span className="w-8 h-px bg-slate-600"></span>
                        Apoio Operacional
                        <span className="w-8 h-px bg-slate-600"></span>
                    </h2>
                    <div
                        className={`grid grid-cols-1 sm:grid-cols-2 gap-4 w-full ${
                            modules.globalTables
                                ? 'lg:grid-cols-4'
                                : 'lg:grid-cols-3 max-w-4xl mx-auto'
                        }`}
                    >
                        {/* Clientes */}
                        <button
                            onClick={() => onNavigate(`/dashboard/loja/${storeId}/clientes`)}
                            onMouseEnter={(e) => handleHover(e, "Criação de nova ficha de paciente, atualização direta de número de celular/endereço e consulta minuciosa à documentação de receitas.")}
                            onMouseMove={handleMove}
                            onMouseLeave={handleLeave}
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
                            onMouseEnter={(e) => handleHover(e, "O olho de Thundera. Pesquisa central para localizar instantaneamente qualquer cliente por Nome, CPF, Telefone ou número de OS.")}
                            onMouseMove={handleMove}
                            onMouseLeave={handleLeave}
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

                        {/* Info Clientes (Link para Modal Antigo) */}
                        <button
                            onClick={() => openCustomerHistoryModal()}
                            onMouseEnter={(e) => handleHover(e, "Envie ao cliente via WhatsApp o último grau registrado ou detalhes financeiros de parcelas em aberto.")}
                            onMouseMove={handleMove}
                            onMouseLeave={handleLeave}
                            className="group bg-white/5 hover:bg-slate-700/30 rounded-xl flex items-center gap-4 px-4 py-3 border border-white/5 hover:border-slate-500/30 transition-all duration-300 cursor-pointer"
                        >
                            <div className="p-2 rounded-lg bg-slate-500/20 text-slate-300 group-hover:bg-slate-500 group-hover:text-white transition-colors">
                                <MessageCircle className="w-5 h-5" strokeWidth={2} />
                            </div>
                            <div className="text-left">
                                <span className="text-slate-200 text-sm font-bold block group-hover:text-white transition-colors">Enviar Informação</span>
                                <span className="text-slate-500 text-[10px] group-hover:text-slate-300 transition-colors">WhatsApp</span>
                            </div>
                        </button>

                        {/* Tabela de Preços */}
                        {modules.globalTables && <button
                            onClick={() => onNavigate(`/dashboard/loja/${storeId}/tabela-precos`)}
                            onMouseEnter={(e) => handleHover(e, "Consulte a tabela de preços do laboratório ativo. Compare ofertas, tratamentos e valores lado a lado.")}
                            onMouseMove={handleMove}
                            onMouseLeave={handleLeave}
                            className="group bg-white/5 hover:bg-slate-700/30 rounded-xl flex items-center gap-4 px-4 py-3 border border-white/5 hover:border-slate-500/30 transition-all duration-300 cursor-pointer"
                        >
                            <div className="p-2 rounded-lg bg-slate-500/20 text-slate-300 group-hover:bg-slate-500 group-hover:text-white transition-colors">
                                <Tag className="w-5 h-5" strokeWidth={2} />
                            </div>
                            <div className="text-left">
                                <span className="text-slate-200 text-sm font-bold block group-hover:text-white transition-colors">Tabela de Preços</span>
                                <span className="text-slate-500 text-[10px] group-hover:text-slate-300 transition-colors">Laboratório</span>
                            </div>
                        </button>}
                    </div>
                </div>
            </div>

            {/* Botão Voltar */}
            <button
                onClick={onBack}
                className="fixed flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all duration-300 border border-white/5 hover:border-white/20 backdrop-blur-sm z-20 group"
                style={{ left: 'max(1rem, env(safe-area-inset-left))', bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs font-bold uppercase tracking-wider">Voltar</span>
            </button>
            {/* Tooltip personalizado */}
            {tooltip.visible && (
                <div
                    className="fixed z-[100] bg-slate-900 text-slate-200 text-xs leading-relaxed px-4 py-3 rounded-xl shadow-[0_0_30px_rgba(0,0,0,1)] border border-slate-700 pointer-events-none max-w-[280px] transition-opacity duration-150 backdrop-blur-md font-medium"
                    style={{ left: tooltip.x + 15, top: tooltip.y + 15 }}
                >
                    {tooltip.text}
                </div>
            )}
        </div >
    );
}


