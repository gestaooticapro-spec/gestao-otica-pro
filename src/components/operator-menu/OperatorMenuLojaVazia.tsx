'use client';

import { useEffect, useState, useRef } from 'react';
import {
    DollarSign, HeartHandshake, Megaphone, Archive, Search, Globe, Printer,
    ArrowLeftRight, FileInput, Tag, FileSpreadsheet, ArrowLeft, Clock,
    AlertCircle, Gift, Calendar, Package, ChevronRight, ChevronDown, ChevronUp,
    MessageCircle, CalendarClock, CalendarCheck, ArrowRight, Send, Users2, UserMinus, Layers3, Receipt
} from 'lucide-react';
import { getWhatsAppLink } from '@/lib/utils';
import { sendManualWhatsAppFromClient } from '@/lib/whatsapp/manual-client';
import Link from 'next/link';
import { useStoreModules } from '@/lib/contexts/StoreModulesContext';

// Tipos importados (ou definidos localmente se preferir não importar do server action em client component)
// Para evitar erros de build se o arquivo de actions não exportar tipos para client, definimos aqui compatível.
interface AlertaEntrega {
    id: number;
    created_at: string;
    dt_prometido_para: string;
    customer_name: string;
    venda_id: number;
}

interface AlertaLaboratorio {
    id: number;
    created_at: string;
    tempo_decorrido_horas: number;
    customer_name: string;
    venda_id: number;
}

interface Aniversariante {
    id: number;
    nome: string;
    fone: string | null;
    dia: string;
}

interface VencimentoProximo {
    id: number;
    customer_name: string;
    fone_movel: string | null;
    valor_parcela: number;
    data_vencimento: string;
    numero_parcela: number;
}

interface RetornoCobranca {
    id: number;
    customer_id: number;
    customer_name: string;
    fone_movel: string | null;
    tipo_contato: string;
    resumo_conversa: string;
    proxima_acao: string;
}

interface ClienteInativo {
    nome: string;
    telefone: string;
    totalGasto: number;
    ultimaVenda: string;
}

interface WhatsAppPendencia {
    id: number;
    remote_phone: string;
    state: string;
    updated_at: string;
    internal_note?: string;
}

interface OperatorMenuLojaVaziaProps {
    storeId: number;
    storeName?: string;
    onBack: () => void;
    onNavigate: (route: string) => void;
    deliveryDateEnabled?: boolean;
}

interface RadarData {
    vendasEmAberto: number;
    aniversariantes: Aniversariante[];
    entregas: AlertaEntrega[];
    laboratorio: AlertaLaboratorio[];
    vencimentos: VencimentoProximo[];
    retornos: RetornoCobranca[];
    clientesInativos: ClienteInativo[];
    whatsAppPendencias: WhatsAppPendencia[];
    whatsAppHumanOverrides: number;
    isWhatsAppConnected: boolean;
}

const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const formatMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import FullscreenToggleButton from '@/components/FullscreenToggleButton';
import WidgetWhatsAppPendencias from '@/components/consultas/WidgetWhatsAppPendencias';
import WhatsAppOperatorModal from '@/components/modals/WhatsAppOperatorModal';

export default function OperatorMenuLojaVazia({
    storeId,
    storeName = 'Ótica',
    onBack,
    onNavigate,
    deliveryDateEnabled = true
}: OperatorMenuLojaVaziaProps) {
    const { preference } = useBackgroundPreference();
    const modules = useStoreModules();

    const [tooltip, setTooltip] = useState<{ visible: boolean, x: number, y: number, text: string }>({ visible: false, x: 0, y: 0, text: '' });
    const [sendingWhatsAppKey, setSendingWhatsAppKey] = useState<string | null>(null);
    const hoverTimeout = useRef<NodeJS.Timeout | null>(null);

    const handleHover = (e: React.MouseEvent, text: string) => {
        // Posição inicial do hover
        const x = e.clientX;
        const y = e.clientY;
        
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        
        hoverTimeout.current = setTimeout(() => {
            setTooltip({ visible: true, x, y, text });
        }, 1200); // 1.2 segundos de delay
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

    const [radar, setRadar] = useState<RadarData>({
        vendasEmAberto: 0,
        aniversariantes: [],
        entregas: [],
        laboratorio: [],
        vencimentos: [],
        retornos: [],
        clientesInativos: [],
        whatsAppPendencias: [],
        whatsAppHumanOverrides: 0,
        isWhatsAppConnected: false
    });
    const [loading, setLoading] = useState(true);
    const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
    const [whatsAppInitialPhone, setWhatsAppInitialPhone] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const response = await fetch(`/api/alertas-operacionais?storeId=${storeId}`);
                if (response.ok) {
                    const data = await response.json();
                    setRadar({
                        vendasEmAberto: data.vendasEmAberto || 0,
                        aniversariantes: data.aniversariantes || [],
                        entregas: data.entregas || [],
                        laboratorio: data.laboratorio || [],
                        vencimentos: data.vencimentos || [],
                        retornos: data.retornos || [],
                        clientesInativos: data.clientesInativos || [],
                        whatsAppPendencias: data.whatsAppPendencias || [],
                        whatsAppHumanOverrides: data.whatsAppHumanOverrides || 0,
                        isWhatsAppConnected: data.isWhatsAppConnected === true
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

    const handleZapAniversario = async (fone: string | null, nome: string) => {
        if (sendingWhatsAppKey) return;
        if (!fone) return alert(`${nome.split(' ')[0]} não tem celular cadastrado.`);
        const msg = `Oi ${nome.split(' ')[0]}! Sabemos que esse é um dia especial pra você. Te desejamos toda a felicidade do mundo!`;
        const key = `birthday:${fone}`;
        setSendingWhatsAppKey(key);
        try {
            await sendManualWhatsAppFromClient({
                storeId,
                remotePhone: fone,
                messageText: msg,
                messageType: 'relationship',
                source: 'operator_empty_store.birthday_button',
                metadata: { customerName: nome },
            });
        } finally {
            setSendingWhatsAppKey(null);
        }
    };

    const handleZapVencimento = async (item: VencimentoProximo) => {
        if (sendingWhatsAppKey) return;
        if (!item.fone_movel) return alert("Cliente sem celular cadastrado.");
        const primeiroNome = item.customer_name.split(' ')[0];
        const hoje = new Date().toISOString().split('T')[0];
        // Lógica simples: se for hoje "hoje", senão "em breve" ou a data específica
        const venceHoje = item.data_vencimento === hoje;
        const dataFormatada = new Date(item.data_vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const textoDia = venceHoje ? "hoje" : `dia ${dataFormatada}`;
        const msg = `Olá ${primeiroNome}, tudo bem? Aqui é da ${storeName}. Passando apenas para lembrar que sua parcela (${item.numero_parcela}ª) vence ${textoDia}. Se precisar da chave Pix, é só pedir!`;
        const key = `installment:${item.id}`;
        setSendingWhatsAppKey(key);
        try {
            await sendManualWhatsAppFromClient({
                storeId,
                remotePhone: item.fone_movel,
                messageText: msg,
                messageType: 'billing_reminder',
                source: 'operator_empty_store.due_installment_button',
                metadata: {
                    installmentId: item.id,
                    customerName: item.customer_name,
                    dueDate: item.data_vencimento,
                    installmentNumber: item.numero_parcela,
                    amount: item.valor_parcela,
                },
            });
        } finally {
            setSendingWhatsAppKey(null);
        }
    };

    const handleZapClienteInativo = async (cliente: ClienteInativo) => {
        if (sendingWhatsAppKey) return;
        if (!cliente.telefone) return alert(`${cliente.nome.split(' ')[0]} não tem celular cadastrado.`);
        const primeiroNome = cliente.nome.split(' ')[0];
        const msg = `Olá ${primeiroNome}, tudo bem? Aqui é da ${storeName}! Faz um tempinho que não te vemos por aqui. Que tal dar uma passadinha na loja? Temos novidades esperando por você! 😊`;
        const key = `inactive:${cliente.telefone}`;
        setSendingWhatsAppKey(key);
        try {
            await sendManualWhatsAppFromClient({
                storeId,
                remotePhone: cliente.telefone,
                messageText: msg,
                messageType: 'relationship',
                source: 'operator_empty_store.inactive_customer_button',
                metadata: {
                    customerName: cliente.nome,
                    totalGasto: cliente.totalGasto,
                    ultimaVenda: cliente.ultimaVenda,
                },
            });
        } finally {
            setSendingWhatsAppKey(null);
        }
    };

    // --- IDÊNTICO AO COMPONENTE INTERNO REUTILIZÁVEL ---
    const handleOpenRetornoWhatsApp = (phone: string | null) => {
        if (!phone) return;

        if (radar.isWhatsAppConnected) {
            setWhatsAppInitialPhone(phone);
            setIsWhatsAppModalOpen(true);
            return;
        }

        window.open(getWhatsAppLink(phone), '_blank');
    };

    const RadarWidget = ({
        title,
        subtitle,
        icon: Icon,
        colorClass, // ex: 'amber', 'rose', 'indigo', 'emerald'
        count,
        children,
        isOpen,
        setIsOpen
    }: any) => {
        // Mapeamento de Cores para Tailwind (evita classes dinâmicas quebradas)
        const colors: any = {
            amber: { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'hover:border-amber-500/30' },
            rose: { bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'hover:border-rose-500/30' },
            indigo: { bg: 'bg-indigo-500/20', text: 'text-indigo-300', border: 'hover:border-indigo-500/30' },
            emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'hover:border-emerald-500/30' },
            pink: { bg: 'bg-pink-500/20', text: 'text-pink-300', border: 'hover:border-pink-500/30' },
            orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'hover:border-orange-500/30' },
        };
        const c = colors[colorClass] || colors.amber;

        return (
            <div className={`group bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 ${c.border} transition-all duration-300 overflow-hidden`}>
                <div
                    onClick={() => setIsOpen(!isOpen)}
                    className="p-4 flex items-center justify-between cursor-pointer"
                >
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg ${c.bg} ${c.text} flex items-center justify-center transition-colors shadow-lg`}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <div>
                            <span className="text-slate-200 font-bold text-sm block group-hover:text-white transition-colors">{title}</span>
                            <span className="text-slate-500 text-[10px] uppercase font-bold">{subtitle}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {count > 0 && <span className={`px-2 py-1 rounded-md text-xs font-bold ${c.bg} ${c.text} shadow-lg`}>{count}</span>}
                        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                </div>

                {isOpen && (
                    <div className="bg-black/20 p-4 border-t border-white/5 space-y-3 animate-in slide-in-from-top-2">
                        {children}
                    </div>
                )}
            </div>
        );
    };

    // States para cada widget
    const [openVencimentos, setOpenVencimentos] = useState(false);
    const [openAniversarios, setOpenAniversarios] = useState(false);
    const [openEntregas, setOpenEntregas] = useState(false);
    const [openRetornos, setOpenRetornos] = useState(false);
    const [openLaboratorio, setOpenLaboratorio] = useState(false);

    return (
        <div className="min-h-screen relative flex flex-col items-center p-6 overflow-hidden bg-slate-950 font-sans transition-colors duration-500">
            {/* Toggle de Fundo */}
            <div className="absolute top-6 right-6 z-50 flex items-center gap-3">
                <FullscreenToggleButton className="right-20 top-6" />
                <BackgroundToggle />
            </div>

            {/* Background Image */}
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/lojavazia.png')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            </div>

            {/* Conteúdo */}
            <div className="relative z-10 w-full max-w-7xl flex flex-col h-full">
                {/* Header */}
                <div className="mb-8 text-center animate-in slide-in-from-top-5 duration-700">
                    <h1 className="text-4xl font-black text-white drop-shadow-lg tracking-tight mb-2">
                        Gestão & Interno
                    </h1>
                    <p className="text-slate-400 text-sm font-medium uppercase tracking-[0.2em] bg-white/5 px-4 py-1 rounded-full border border-white/5 inline-block">
                        Loja Vazia
                    </p>
                </div>

                <div className="flex flex-col xl:flex-row gap-8 w-full items-start">

                    {/* ESQUERDA: AÇÕES (3 Colunas Grid) */}
                    <div className="flex-1 w-full flex flex-col gap-6">
                        <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                            {/* GRUPO 1: FINANCEIRO + PONTOS DE ATENÇÃO */}
                            <div className="flex flex-col gap-6">
                                {/* FINANCEIRO */}
                                <div className="bg-black/20 border border-white/5 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4 shadow-xl">
                                    <h2 className="text-sm font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2 mb-2 px-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]"></span>
                                        Financeiro
                                    </h2>
                                    <div className="flex flex-col gap-3">
                                        {/* Caixa */}
                                        <button 
                                            onClick={() => onNavigate(`/dashboard/loja/${storeId}/financeiro/caixa`)} 
                                            onMouseEnter={(e) => handleHover(e, "Controle de abertura e fechamento de turno diário. Registre suprimentos, sangrias, confira o valor esperado em dinheiro na gaveta e audite todo o extrato de movimentações e pagamentos digitais do dia.")}
                                            onMouseMove={handleMove}
                                            onMouseLeave={handleLeave}
                                            className="group bg-gradient-to-br from-amber-600/12 via-orange-900/25 to-slate-900/60 hover:from-amber-500/22 hover:via-orange-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-amber-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(245,158,11,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
                                        >
                                            <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-300 group-hover:bg-amber-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                                                <DollarSign className="w-6 h-6" strokeWidth={1.5} />
                                            </div>
                                            <div className="text-left">
                                                <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Caixa</span>
                                                <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-amber-200/70 transition-colors">Movimento Diário</span>
                                            </div>
                                        </button>
                                        {/* Cobrança */}
                                        {modules.installments && <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/cobranca`)} onMouseEnter={(e) => handleHover(e, "Acompanhe clientes com parcelas em atraso na loja. Filtre por período, envie mensagens via WhatsApp com um clique e registre promessas de pagamento para acompanhamento futuro.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-amber-600/12 via-orange-900/25 to-slate-900/60 hover:from-amber-500/22 hover:via-orange-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-amber-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(245,158,11,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40">
                                            <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-300 group-hover:bg-amber-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                                                <Megaphone className="w-6 h-6" strokeWidth={1.5} />
                                            </div>
                                            <div className="text-left">
                                                <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Cobrança</span>
                                                <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-amber-200/70 transition-colors">Inadimplência</span>
                                            </div>
                                        </button>}
                                        {/* Nota Fiscal */}
                                        {modules.fiscal && <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/fiscal`)} onMouseEnter={(e) => handleHover(e, "Consulte e gerencie as notas fiscais emitidas pela loja, incluindo NF-e e NFC-e. Visualize autorizadas, canceladas e erros, e exporte o pacote mensal para o contador.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-amber-600/12 via-orange-900/25 to-slate-900/60 hover:from-amber-500/22 hover:via-orange-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-amber-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(245,158,11,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40">
                                            <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-300 group-hover:bg-amber-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                                                <Receipt className="w-6 h-6" strokeWidth={1.5} />
                                            </div>
                                            <div className="text-left">
                                                <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Nota Fiscal</span>
                                                <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-amber-200/70 transition-colors">NF-e e NFC-e</span>
                                            </div>
                                        </button>}
                                    </div>
                                </div>

                                {/* PONTOS DE ATENÇÃO */}
                                <div className="bg-black/20 border border-white/5 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4 shadow-xl">
                                    <h2 className="text-sm font-bold text-orange-400 uppercase tracking-widest flex items-center gap-2 mb-2 px-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)]"></span>
                                        Pontos de Atenção
                                    </h2>
                                    <div className="flex flex-col gap-3">
                                        {/* Vendas Paradas */}
                                        <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/vendas?mode=pendencias`)} onMouseEnter={(e) => handleHover(e, "Listagem rápida das vendas que aguardam entrega ou retorno há mais de 21 dias. Útil para limpar o funil e identificar clientes que abandonaram óculos prontos na loja.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-orange-600/12 via-orange-900/25 to-slate-900/60 hover:from-orange-500/22 hover:via-orange-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-orange-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(249,115,22,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40">
                                            <div className="p-2.5 rounded-lg bg-orange-500/20 text-orange-300 group-hover:bg-orange-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                                                <AlertCircle className="w-6 h-6" strokeWidth={1.5} />
                                            </div>
                                            <div className="text-left flex-1">
                                                <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Vendas Paradas</span>
                                                <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-orange-200/70 transition-colors">Há +21 Dias</span>
                                            </div>
                                            {radar.vendasEmAberto > 0 && (
                                                <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-orange-500/25 text-orange-300 shadow-lg">{radar.vendasEmAberto}</span>
                                            )}
                                        </button>
                                        {/* Clientes Sumidos */}
                                        <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/clientes-inativos`)} onMouseEnter={(e) => handleHover(e, "Encontre clientes que não compram nada há mais de 1 ano. Ótima ferramenta para campanhas de reativação, envio de promoções especiais e resgate de faturamento.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-rose-600/12 via-rose-900/25 to-slate-900/60 hover:from-rose-500/22 hover:via-rose-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-rose-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(244,63,94,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40">
                                            <div className="p-2.5 rounded-lg bg-rose-500/20 text-rose-300 group-hover:bg-rose-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                                                <UserMinus className="w-6 h-6" strokeWidth={1.5} />
                                            </div>
                                            <div className="text-left flex-1">
                                                <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Clientes Sumidos</span>
                                                <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-rose-200/70 transition-colors">+1 Ano Sem Comprar</span>
                                            </div>
                                            {radar.clientesInativos.length > 0 && (
                                                <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-rose-500/25 text-rose-300 shadow-lg">{radar.clientesInativos.length}</span>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* GRUPO 2: ESTOQUE */}
                            <div className="bg-black/20 border border-white/5 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4 shadow-xl">
                                <h2 className="text-sm font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2 mb-2 px-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></span>
                                    Estoque & Produtos
                                </h2>
                                <div className="flex flex-col gap-3">
                                    {/* Estoque */}
                                    <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/estoque/movimentacoes`)} onMouseEnter={(e) => handleHover(e, "Registro total de entradas e saídas do estoque de armações, lentes e acessórios. Veja quem deu baixa, registre perdas/avarias e acompanhe o fluxo de mercadorias.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-blue-600/12 via-blue-900/25 to-slate-900/60 hover:from-blue-500/22 hover:via-blue-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-blue-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(59,130,246,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40">
                                        <div className="p-2.5 rounded-lg bg-blue-500/20 text-blue-300 group-hover:bg-blue-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                                            <ArrowLeftRight className="w-6 h-6" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left">
                                            <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Movimentação</span>
                                            <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-blue-200/70 transition-colors">Estoque</span>
                                        </div>
                                    </button>
                                    {/* Produtos */}
                                    <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/cadastros`)} onMouseEnter={(e) => handleHover(e, "Acesso completo ao catálogo de produtos. Adicione ou edite detalhes de armações, lentes de contato e itens de balcão (preço, marca, grade de graus e referências).")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-blue-600/12 via-blue-900/25 to-slate-900/60 hover:from-blue-500/22 hover:via-blue-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-blue-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(59,130,246,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40">
                                        <div className="p-2.5 rounded-lg bg-blue-500/20 text-blue-300 group-hover:bg-blue-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                                            <Tag className="w-6 h-6" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left">
                                            <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Cadastros</span>
                                            <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-blue-200/70 transition-colors">Catálogo</span>
                                        </div>
                                    </button>
                                    {/* Tabelas Globais */}
                                    {modules.globalTables && <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/catalogo-global`)} onMouseEnter={(e) => handleHover(e, "Ative uma tabela global de laboratório para esta loja. Aqui você escolhe a versão vigente, sincroniza ofertas e tratamentos e prepara a base para recomendação por IA e consulta visual em tabela.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-cyan-600/12 via-cyan-900/25 to-slate-900/60 hover:from-cyan-500/22 hover:via-cyan-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-cyan-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(34,211,238,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40">
                                        <div className="p-2.5 rounded-lg bg-cyan-500/20 text-cyan-300 group-hover:bg-cyan-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                                            <Layers3 className="w-6 h-6" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left">
                                            <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Tabelas Globais</span>
                                            <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-cyan-200/70 transition-colors">Laboratórios</span>
                                        </div>
                                    </button>}
                                    {/* Lentes */}
                                    <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/laboratorio`)} onMouseEnter={(e) => handleHover(e, "Acompanhamento passo a passo das ordens de serviço. Veja quais óculos estão aguardando bloco, quais já estão na surfaçagem, na montagem ou prontos para entrega.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-blue-600/12 via-blue-900/25 to-slate-900/60 hover:from-blue-500/22 hover:via-blue-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-blue-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(59,130,246,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40">
                                        <div className="p-2.5 rounded-lg bg-blue-500/20 text-blue-300 group-hover:bg-blue-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                                            <Search className="w-6 h-6" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left">
                                            <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Laboratório</span>
                                            <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-blue-200/70 transition-colors">Passo a passo</span>
                                        </div>
                                    </button>
                                    {/* XML */}
                                    <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/importacao`)} onMouseEnter={(e) => handleHover(e, "Ganhe tempo importando notas fiscais de fornecedores pelo XML. O sistema cadastra os produtos novos e dá entrada na contagem do estoque automaticamente.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-blue-600/12 via-blue-900/25 to-slate-900/60 hover:from-blue-500/22 hover:via-blue-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-blue-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(59,130,246,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40">
                                        <div className="p-2.5 rounded-lg bg-blue-500/20 text-blue-300 group-hover:bg-blue-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                                            <FileInput className="w-6 h-6" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left">
                                            <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">XML</span>
                                            <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-blue-200/70 transition-colors">Importação NFe</span>
                                        </div>
                                    </button>
                                    {/* Etiquetas */}
                                    {modules.labels && <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/estoque/etiquetas`)} onMouseEnter={(e) => handleHover(e, "Impressão em massa de etiquetas de código de barras para as armações. Facilita muito a vida na hora do inventário e na agilidade de passar vendas no balcão.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-blue-600/12 via-blue-900/25 to-slate-900/60 hover:from-blue-500/22 hover:via-blue-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-blue-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(59,130,246,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40">
                                        <div className="p-2.5 rounded-lg bg-blue-500/20 text-blue-300 group-hover:bg-blue-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                                            <Printer className="w-6 h-6" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left">
                                            <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Etiquetas</span>
                                            <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-blue-200/70 transition-colors">Código de Barras</span>
                                        </div>
                                    </button>}
                                </div>
                            </div>

                            {/* GRUPO 3: GESTÃO & CRM */}
                            <div className="bg-black/20 border border-white/5 rounded-3xl p-6 backdrop-blur-md flex flex-col gap-4 shadow-xl">
                                <h2 className="text-sm font-bold text-rose-400 uppercase tracking-widest flex items-center gap-2 mb-2 px-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]"></span>
                                    Gestão & CRM
                                </h2>
                                <div className="flex flex-col gap-3">
                                    {/* Pós-Venda */}
                                    {modules.postSales && <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/pos-venda`)} onMouseEnter={(e) => handleHover(e, "O pós-vendas verifica quem retirou óculos recentemente. Envie mensagens de WhatsApp para acompanhar a adaptação e classifique o atendimento com base no que o cliente disser.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-rose-600/12 via-rose-900/25 to-slate-900/60 hover:from-rose-500/22 hover:via-rose-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-rose-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(244,63,94,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40">
                                        <div className="p-2.5 rounded-lg bg-rose-500/20 text-rose-300 group-hover:bg-rose-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                                            <HeartHandshake className="w-6 h-6" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left">
                                            <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Pós-Venda</span>
                                            <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-rose-200/70 transition-colors">RELACIONAMENTO</span>
                                        </div>
                                    </button>}
                                    {/* Histórico */}
                                    <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/vendas?mode=historico`)} onMouseEnter={(e) => handleHover(e, "Acesse rapidamente todas as vendas já realizadas e faturadas. Re-imprima recibos, consulte antigas receitas, pacotes vendidos e datas de garantia passadas.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-rose-600/12 via-rose-900/25 to-slate-900/60 hover:from-rose-500/22 hover:via-rose-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-rose-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(244,63,94,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40">
                                        <div className="p-2.5 rounded-lg bg-rose-500/20 text-rose-300 group-hover:bg-rose-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                                            <FileSpreadsheet className="w-6 h-6" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left">
                                            <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Histórico</span>
                                            <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-rose-200/70 transition-colors">Vendas Anteriores</span>
                                        </div>
                                    </button>
                                    {/* Gaveta (Moved from Financeiro) */}
                                    <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/gaveta`)} onMouseEnter={(e) => handleHover(e, "Organize e confira fisicamente os óculos prontos que estão na gaveta aguardando o cliente retirar. Previna desaparecimentos e desorganização da entrega.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-rose-600/12 via-rose-900/25 to-slate-900/60 hover:from-rose-500/22 hover:via-rose-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-rose-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(244,63,94,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40">
                                        <div className="p-2.5 rounded-lg bg-rose-500/20 text-rose-300 group-hover:bg-rose-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                                            <Archive className="w-6 h-6" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left">
                                            <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Gaveta</span>
                                            <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-rose-200/70 transition-colors">Conferência</span>
                                        </div>
                                    </button>
                                    {/* Busca Universal */}
                                    <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/consultas`)} onMouseEnter={(e) => handleHover(e, "O oráculo da ótica. Busque por qualquer coisa (nome, CPF, OS, telefone ou código do produto) e encontre todo o histórico daquele termo em dois segundos.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-rose-600/12 via-rose-900/25 to-slate-900/60 hover:from-rose-500/22 hover:via-rose-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-rose-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(244,63,94,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40">
                                        <div className="p-2.5 rounded-lg bg-rose-500/20 text-rose-300 group-hover:bg-rose-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                                            <Globe className="w-6 h-6" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left">
                                            <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Busca</span>
                                            <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-rose-200/70 transition-colors">Geral</span>
                                        </div>
                                    </button>
                                    {/* Clientes */}
                                    <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/clientes`)} onMouseEnter={(e) => handleHover(e, "Gerenciamento do arquivo de clientes. Adicione ou edite contatos, ficha financeira e acesse o receituário completo com as medidas de cada pessoa cadastrada.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-rose-600/12 via-rose-900/25 to-slate-900/60 hover:from-rose-500/22 hover:via-rose-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-rose-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(244,63,94,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40">
                                        <div className="p-2.5 rounded-lg bg-rose-500/20 text-rose-300 group-hover:bg-rose-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                                            <Users2 className="w-6 h-6" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left">
                                            <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Clientes</span>
                                            <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-rose-200/70 transition-colors">Gerenciar</span>
                                        </div>
                                    </button>
                                    {/* Parcelamentos */}
                                    {modules.installments && <button onClick={() => onNavigate(`/dashboard/loja/${storeId}/financeiro/parcelas`)} onMouseEnter={(e) => handleHover(e, "Acompanhe e pesquise todas as parcelas e carnês gerados pela loja.")} onMouseMove={handleMove} onMouseLeave={handleLeave} className="group bg-gradient-to-br from-rose-600/12 via-rose-900/25 to-slate-900/60 hover:from-rose-500/22 hover:via-rose-800/35 hover:to-slate-900/70 rounded-xl flex items-center gap-4 px-4 py-4 border border-white/10 hover:border-rose-400/35 transition-all duration-300 cursor-pointer backdrop-blur-md hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(244,63,94,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40">
                                        <div className="p-2.5 rounded-lg bg-rose-500/20 text-rose-300 group-hover:bg-rose-500 group-hover:text-white transition-colors shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                                            <CalendarCheck className="w-6 h-6" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left">
                                            <span className="text-slate-200 text-base font-bold block group-hover:text-white transition-colors">Parcelamentos</span>
                                            <span className="text-slate-500 text-[10px] uppercase font-bold group-hover:text-rose-200/70 transition-colors">Visualizar</span>
                                        </div>
                                    </button>}
                                </div>
                            </div>
                        </div>


                    </div>

                    {/* DIREITA: RADAR OPERACIONAL */}
                    <div className="w-full xl:w-[400px] shrink-0 flex flex-col">

                        {/* Radar Lista */}
                        <div className="bg-black/20 border border-white/5 rounded-3xl p-6 backdrop-blur-md flex flex-col shadow-xl">
                            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-3 mb-6">
                                <Clock className="w-4 h-4 text-slate-500" />
                                Radar Operacional
                            </h2>

                            <div className="space-y-4">
                                {/* WHATSAPP PENDÊNCIAS */}
                                {radar.isWhatsAppConnected && (
                                    <WidgetWhatsAppPendencias
                                        pendencias={radar.whatsAppPendencias}
                                        humanOverrides={radar.whatsAppHumanOverrides}
                                        onOpen={() => {
                                            setWhatsAppInitialPhone(null);
                                            setIsWhatsAppModalOpen(true);
                                        }}
                                    />
                                )}
                                
                                {/* VENCIMENTOS */}
                                {modules.installments && <RadarWidget
                                    title="Vencimentos"
                                    subtitle="Próximos 3 Dias"
                                    icon={CalendarClock}
                                    colorClass="indigo"
                                    count={radar.vencimentos.length}
                                    isOpen={openVencimentos}
                                    setIsOpen={setOpenVencimentos}
                                >
                                    {radar.vencimentos.length === 0 ? (
                                        <p className="text-center text-xs text-slate-400 py-4 font-medium">Nenhum vencimento próximo.</p>
                                    ) : (
                                        radar.vencimentos.map(item => (
                                            <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/20 transition-all">
                                                <div>
                                                    <p className="text-xs font-bold text-slate-200 truncate max-w-[150px]">{item.customer_name}</p>
                                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                        {formatMoney(item.valor_parcela)} • {new Date(item.data_vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleZapVencimento(item)}
                                                    disabled={sendingWhatsAppKey === `installment:${item.id}`}
                                                    className="w-8 h-8 rounded-full bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white flex items-center justify-center transition-all disabled:opacity-50"
                                                >
                                                    <MessageCircle className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </RadarWidget>}

                                {/* ANIVERSARIANTES */}
                                <RadarWidget
                                    title="Aniversariantes"
                                    subtitle="Do Dia"
                                    icon={Gift}
                                    colorClass="pink"
                                    count={radar.aniversariantes.length}
                                    isOpen={openAniversarios}
                                    setIsOpen={setOpenAniversarios}
                                >
                                    {radar.aniversariantes.length === 0 ? (
                                        <p className="text-center text-xs text-slate-400 py-4 font-medium">Ninguém sopra velinhas hoje. 🎂</p>
                                    ) : (
                                        radar.aniversariantes.map(c => (
                                            <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/20 transition-all">
                                                <div>
                                                    <p className="text-xs font-bold text-slate-200 truncate max-w-[150px]">{c.nome}</p>
                                                    <p className="text-[10px] text-slate-400">{c.fone || 'Sem fone'}</p>
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleZapAniversario(c.fone, c.nome); }}
                                                    disabled={sendingWhatsAppKey === `birthday:${c.fone}`}
                                                    className="w-8 h-8 rounded-full bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white flex items-center justify-center transition-all disabled:opacity-50"
                                                >
                                                    <MessageCircle className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </RadarWidget>


                                {/* RETORNOS DE COBRANÇA */}
                                {modules.installments && <RadarWidget
                                    title="Retornos Cobrança"
                                    subtitle="Agendados Hoje"
                                    icon={MessageCircle}
                                    colorClass="orange"
                                    count={radar.retornos.length}
                                    isOpen={openRetornos}
                                    setIsOpen={setOpenRetornos}
                                >
                                    {radar.retornos.length === 0 ? (
                                        <p className="text-center text-xs text-slate-400 py-4 font-medium">Sem contatos agendados.</p>
                                    ) : (
                                        radar.retornos.map(item => (
                                            <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/20 transition-all">
                                                <div className="flex-1 overflow-hidden pr-2">
                                                    <p className="text-xs font-bold text-slate-200 truncate">{item.customer_name}</p>
                                                    <p className="text-[10px] text-orange-400 font-medium truncate mt-0.5">
                                                        {item.tipo_contato}: {item.resumo_conversa}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleOpenRetornoWhatsApp(item.fone_movel)}
                                                    className="w-8 h-8 shrink-0 rounded-full bg-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-white flex items-center justify-center transition-all"
                                                >
                                                    <Send className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </RadarWidget>}



                                {/* ENTREGAS */}
                                {deliveryDateEnabled && <RadarWidget
                                    title="Entregas Próximas"
                                    subtitle="Gaveta"
                                    icon={Package}
                                    colorClass="emerald"
                                    count={radar.entregas.length}
                                    isOpen={openEntregas}
                                    setIsOpen={setOpenEntregas}
                                >
                                    {radar.entregas.length === 0 ? (
                                        <p className="text-center text-xs text-slate-400 py-4 font-medium">Sem entregas urgentes.</p>
                                    ) : (
                                        radar.entregas.map(item => {
                                            const isAtrasado = new Date(item.dt_prometido_para) < new Date(new Date().setHours(0, 0, 0, 0));
                                            return (
                                                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/20 transition-all">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-xs font-bold text-slate-200 truncate max-w-[150px]">{item.customer_name}</span>
                                                            {isAtrasado && <span className="text-[9px] font-black text-white bg-rose-500 px-1.5 py-0.5 rounded">ATRASADO</span>}
                                                        </div>
                                                        <p className="text-[10px] text-slate-400 font-mono">
                                                            OS #{item.id} • {formatDate(item.dt_prometido_para)}
                                                        </p>
                                                    </div>
                                                    <Link href={`/dashboard/loja/${storeId}/vendas/${item.venda_id}/os?os_id=${item.id}`}>
                                                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white flex items-center justify-center transition-all cursor-pointer">
                                                            <ArrowRight className="w-4 h-4" />
                                                        </div>
                                                    </Link>
                                                </div>
                                            );
                                        })
                                    )}
                                </RadarWidget>}

                                {/* LENTES PARADAS */}
                                <RadarWidget
                                    title="Lentes Não Pedidas"
                                    subtitle="No Laboratório"
                                    icon={AlertCircle}
                                    colorClass="rose"
                                    count={radar.laboratorio.length}
                                    isOpen={openLaboratorio}
                                    setIsOpen={setOpenLaboratorio}
                                >
                                    {radar.laboratorio.length === 0 ? (
                                        <p className="text-center text-xs text-slate-400 py-4 font-medium">Laboratório em dia.</p>
                                    ) : (
                                        radar.laboratorio.map(item => (
                                            <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/20 transition-all">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-bold text-slate-200 truncate max-w-[150px]">{item.customer_name}</span>
                                                        <span className="text-[9px] bg-white/10 px-1 rounded text-slate-400">#{item.id}</span>
                                                    </div>
                                                    <p className="text-[10px] text-rose-400 font-bold flex items-center gap-1">
                                                        <Clock className="w-3 h-3" /> {item.tempo_decorrido_horas}h parado
                                                    </p>
                                                </div>
                                                <Link href={`/dashboard/loja/${storeId}/vendas/${item.venda_id}/os?os_id=${item.id}`}>
                                                    <div className="w-8 h-8 rounded-full bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-all cursor-pointer">
                                                        <ArrowRight className="w-4 h-4" />
                                                    </div>
                                                </Link>
                                            </div>
                                        ))
                                    )}
                                </RadarWidget>

                            </div>
                        </div>
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
            {radar.isWhatsAppConnected && (
                <WhatsAppOperatorModal
                    isOpen={isWhatsAppModalOpen}
                    onClose={() => {
                        setIsWhatsAppModalOpen(false);
                        setWhatsAppInitialPhone(null);
                    }}
                    storeId={storeId}
                    initialPhone={whatsAppInitialPhone}
                />
            )}
        </div >
    );
}



