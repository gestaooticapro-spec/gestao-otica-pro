// ARQUIVO: src/components/SideNav.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    // Ícones
    ShoppingCart, Users, DollarSign, Archive,
    Settings, BarChart3, Megaphone, Wallet, Zap, Search,
    LogOut, HeartHandshake, FileText, Bot,
    FileInput, ArrowLeftRight, FileSpreadsheet, CalendarRange, Percent, Home, LifeBuoy,
    CheckCircle2, Tag, ChevronRight, ChevronLeft, PanelLeftClose, PanelLeftOpen, X, Globe, Printer
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useModals } from '@/lib/contexts/ModalsContext';

type Role = 'admin' | 'manager' | 'store_operator' | 'vendedor' | 'tecnico';

// --- DEFINIÇÃO DE TIPOS ---
interface SubItem {
    label: string;
    icon: React.ElementType;
    route: string;
    allowedRoles: Role[];
    action?: string;
    withSeparator?: boolean;
}

interface MenuGroup {
    id: string;
    label: string;
    icon: React.ElementType;
    allowedRoles: Role[];
    subItems?: SubItem[];
    route?: string;
}

interface SideNavProps {
    userRole: Role;
    storeId: number;
    storeName: string;
    logoUrl?: string | null;
}

// --- CONFIGURAÇÃO DA ESTRUTURA DO MENU ---
const MENU_STRUCTURE: MenuGroup[] = [
    {
        id: 'inicio',
        label: 'Início',
        icon: Home,
        route: '/dashboard/loja/[id]',
        allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico']
    },
    {
        id: 'atendimento',
        label: 'Atendimento',
        icon: ShoppingCart,
        allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'],
        subItems: [
            { label: 'Venda Rápida', icon: Zap, route: '/dashboard/loja/[id]/pdv-express', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },
            { label: 'Venda Óculos', icon: FileText, route: '/dashboard/loja/[id]/atendimento', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },

            // Separador após Entrega
            {
                label: 'Entrega Óculos',
                icon: CheckCircle2,
                route: '/dashboard/loja/[id]/entrega',
                allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'],
                withSeparator: true
            },

            {
                label: 'Baixa Parcelas',
                icon: Wallet,
                route: '#',
                action: 'openParcelaModal',
                allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor']
            },

            {
                label: 'Consulta Cliente',
                icon: Search,
                route: '#',
                action: 'openCustomerHistoryModal',
                allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor'],
                withSeparator: true
            },

            // Separador após Nova Assistência
            {
                label: 'Assistência',
                icon: LifeBuoy,
                route: '/dashboard/loja/[id]/assistencia',
                allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'],
                withSeparator: true
            },

            { label: 'Clientes', icon: Users, route: '/dashboard/loja/[id]/clientes', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },

            // --- CORREÇÃO AQUI: ROTA AJUSTADA PARA /consultas ---
            { label: 'Busca Universal', icon: Globe, route: '/dashboard/loja/[id]/consultas', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },
        ]
    },
    {
        id: 'loja_vazia',
        label: 'Loja Vazia',
        icon: Archive,
        allowedRoles: ['admin', 'manager', 'store_operator'],
        subItems: [
            // Separador após Livro Caixa
            { label: 'Livro Caixa', icon: DollarSign, route: '/dashboard/loja/[id]/financeiro/caixa', allowedRoles: ['admin', 'manager', 'store_operator'], withSeparator: true },

            { label: 'Pós-Venda', icon: HeartHandshake, route: '/dashboard/loja/[id]/pos-venda', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor'] },

            // Separador após Cobrança
            { label: 'Cobrança', icon: Megaphone, route: '/dashboard/loja/[id]/cobranca', allowedRoles: ['admin', 'manager', 'store_operator'], withSeparator: true },

            { label: 'Gaveta (Prontos)', icon: Archive, route: '/dashboard/loja/[id]/gaveta', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },

            {
                label: 'Rastrear Lentes',
                icon: Search,
                route: '/dashboard/loja/[id]/laboratorio',
                allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico']
            },

            { label: 'Movimentações', icon: ArrowLeftRight, route: '/dashboard/loja/[id]/estoque/movimentacoes', allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico'] },
            { label: 'Etiquetas', icon: Printer, route: '/dashboard/loja/[id]/estoque/etiquetas', allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico'] },

            // Separador após Importar XML
            { label: 'Importar XML', icon: FileInput, route: '/dashboard/loja/[id]/importacao', allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico'], withSeparator: true },

            { label: 'Produtos & Preços', icon: Tag, route: '/dashboard/loja/[id]/cadastros', allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico'] },
            { label: 'Histórico Vendas', icon: FileSpreadsheet, route: '/dashboard/loja/[id]/vendas?mode=historico', allowedRoles: ['admin', 'manager', 'store_operator'] },
        ]
    },
    {
        id: 'gerencia',
        label: 'Gerência',
        icon: Settings,
        allowedRoles: ['admin', 'manager'],
        subItems: [
            { label: 'Contas a Pagar', icon: CalendarRange, route: '/dashboard/loja/[id]/financeiro/contas', allowedRoles: ['admin', 'manager'] },
            { label: 'Comissões', icon: Percent, route: '/dashboard/loja/[id]/financeiro/comissoes', allowedRoles: ['admin', 'manager'] },

            // Separador após Relatórios
            { label: 'Central de Relatórios', icon: BarChart3, route: '/dashboard/loja/[id]/reports', allowedRoles: ['admin', 'manager'], withSeparator: true },

            { label: 'Configuração', icon: Settings, route: '/dashboard/loja/[id]/config', allowedRoles: ['admin', 'manager'] },
            { label: 'Fiscal (NFC-e)', icon: FileText, route: '/dashboard/loja/[id]/fiscal', allowedRoles: ['admin', 'manager'] },
        ]
    }
];

export default function SideNav({ userRole, storeId, storeName, logoUrl }: SideNavProps) {
    const router = useRouter();
    const pathname = usePathname();
    const supabase = createClient();

    // --- ESTADOS ---
    const [isMainCollapsed, setIsMainCollapsed] = useState(true);
    const [activePanel, setActivePanel] = useState<string | null>(null);
    const [isSubCollapsed, setIsSubCollapsed] = useState(false);

    // Modais (agora via contexto global)
    const { openParcelaModal, openCustomerHistoryModal } = useModals();

    useEffect(() => {
        // Opcional: Fecha o painel ao navegar
        // setActivePanel(null); 
    }, [pathname]);

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) alert('Erro ao sair');
        window.location.href = '/login';
    };

    const handleMainClick = (group: MenuGroup) => {
        if (group.route) {
            setActivePanel(null);
            router.push(group.route.replace('[id]', storeId.toString()), { scroll: false });
            return;
        }

        if (activePanel === group.id) {
            setActivePanel(null);
        } else {
            setActivePanel(group.id);
            setIsSubCollapsed(false);
        }
    };

    const getActiveColor = (id: string) => {
        if (id === 'atendimento') return 'bg-blue-600 text-white shadow-blue-200';
        if (id === 'loja_vazia') return 'bg-amber-600 text-white shadow-amber-200';
        if (id === 'gerencia') return 'bg-purple-600 text-white shadow-purple-200';
        if (id === 'inicio') return 'bg-slate-800 text-white shadow-slate-300';
        return 'bg-slate-100 text-slate-600';
    };

    const renderSubPanel = () => {
        const group = MENU_STRUCTURE.find(g => g.id === activePanel);
        if (!group || !group.subItems) return null;

        return (
            <div className={`bg-black/60 backdrop-blur-xl border-r border-white/5 h-full flex flex-col transition-all duration-300 ease-in-out shadow-2xl z-20 relative ${isSubCollapsed ? 'w-20' : 'w-64'}`}>
                <div className="h-20 border-b border-white/5 flex items-center justify-between px-4 bg-transparent shrink-0">
                    {!isSubCollapsed && (
                        <h3 className="font-black text-slate-300 uppercase tracking-widest text-xs truncate animate-in fade-in drop-shadow-sm">
                            {group.label}
                        </h3>
                    )}
                    <div className="flex gap-1 ml-auto">
                        {!isSubCollapsed && (
                            <button onClick={() => setActivePanel(null)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-slate-500 hover:text-red-400 transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                    {group.subItems.filter(sub => sub.allowedRoles.includes(userRole)).map(sub => {
                        let activeClass = 'bg-white/10 text-white font-bold border border-white/10 shadow-lg';
                        let iconActiveColor = 'text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]';

                        if (group.id === 'atendimento') { activeClass = 'bg-blue-500/20 text-blue-200 font-bold border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]'; iconActiveColor = 'text-blue-300'; }
                        if (group.id === 'loja_vazia') { activeClass = 'bg-amber-500/20 text-amber-200 font-bold border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]'; iconActiveColor = 'text-amber-300'; }
                        if (group.id === 'gerencia') { activeClass = 'bg-purple-500/20 text-purple-200 font-bold border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.1)]'; iconActiveColor = 'text-purple-300'; }

                        const baseClass = `flex items-center rounded-lg transition-all duration-200 group/item relative border border-transparent ${isSubCollapsed ? 'justify-center p-3 aspect-square' : 'gap-3 p-3 w-full text-left'}`;

                        // LÓGICA DE AÇÃO
                        const isAction = !!sub.action;
                        const finalRoute = isAction ? '#' : sub.route.replace('[id]', storeId.toString());
                        const isActive = !isAction && pathname === finalRoute;

                        const content = (
                            <>
                                <sub.icon className={`flex-shrink-0 transition-transform duration-200 ${isSubCollapsed ? 'h-6 w-6' : 'h-4 w-4'} ${isActive ? iconActiveColor : 'opacity-60 group-hover/item:opacity-100 group-hover/item:scale-110 text-slate-400 group-hover/item:text-white'}`} />
                                {!isSubCollapsed && <span className="text-sm truncate">{sub.label}</span>}
                                {!isSubCollapsed && isActive && <ChevronRight className="h-3 w-3 ml-auto opacity-50" />}
                            </>
                        );

                        // Decide se renderiza Link ou Button
                        const itemElement = isAction ? (
                            <button
                                onClick={() => {
                                    if (sub.action === 'openParcelaModal') openParcelaModal();
                                    if (sub.action === 'openCustomerHistoryModal') openCustomerHistoryModal();
                                }}
                                className={`${baseClass} ${isActive ? activeClass : 'hover:bg-white/5 hover:border-white/10 hover:shadow-md text-slate-400 hover:text-white'}`}
                                title={isSubCollapsed ? sub.label : ''}
                            >
                                {content}
                            </button>
                        ) : (
                            <Link href={finalRoute} className={`${baseClass} ${isActive ? activeClass : 'hover:bg-white/5 hover:border-white/10 hover:shadow-md text-slate-400 hover:text-white'}`} title={isSubCollapsed ? sub.label : ''}>
                                {content}
                            </Link>
                        );

                        return (
                            <div key={sub.label} className="block">
                                {itemElement}
                                {/* RENDERIZA A LINHA APENAS SE FOR SOLICITADO E O MENU ESTIVER ABERTO */}
                                {sub.withSeparator && !isSubCollapsed && (
                                    <div className="my-2 border-b border-white/5 mx-2" />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer do Sub-Painel (Botão de Recolher) */}
                <div className="mt-auto pt-4 pb-4 px-2 border-t border-white/10 w-full flex flex-col gap-2 bg-black/20">
                    <button onClick={() => setIsSubCollapsed(!isSubCollapsed)} className={`flex items-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white border border-transparent hover:border-white/10 transition-all ${isSubCollapsed ? 'justify-center w-full py-3' : 'w-full px-4 py-3 gap-3'}`} title={isSubCollapsed ? "Expandir" : "Recolher"}>
                        {isSubCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                        {!isSubCollapsed && <span className="font-bold text-xs uppercase tracking-wider">Recolher</span>}
                    </button>
                </div>
            </div>
        );
    };

    return (
        // --- ALTERAÇÃO ESTRATÉGICA AQUI ---
        // Troquei 'h-full' por 'h-[calc(100vh-64px)]'
        // Isso força o menu a ter o tamanho exato da tela menos o cabeçalho (64px),
        // garantindo que os botões (Sair/Recolher) fiquem no rodapé mesmo sem mexer no Layout.
        <div className="flex h-[calc(100vh-64px)] relative z-10 font-sans">
            <nav className={`bg-black/40 backdrop-blur-xl border-r border-white/5 h-full flex flex-col py-4 z-20 shadow-2xl relative transition-all duration-300 ease-in-out ${isMainCollapsed ? 'w-20 items-center' : 'w-64 px-4'}`}>
                <div className={`mb-8 flex items-center ${isMainCollapsed ? 'justify-center' : 'justify-between'}`}>
                    {logoUrl ? (
                        <div className={`relative ${isMainCollapsed ? 'w-10 h-10' : 'w-12 h-12'} shrink-0 ring-1 ring-white/10 rounded-xl overflow-hidden shadow-lg bg-black/20`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={logoUrl}
                                alt={storeName}
                                className="w-full h-full object-contain p-1"
                            />
                        </div>
                    ) : (
                        <div className="h-10 w-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-custom cursor-default select-none shrink-0 border border-white/10">PRO</div>
                    )}
                    {!isMainCollapsed && (
                        <div className="ml-3 overflow-hidden">
                            <h2 className="text-sm font-bold text-white whitespace-nowrap drop-shadow-md">Gestão Ótica</h2>
                            <p className="text-[10px] text-slate-400 font-medium uppercase truncate tracking-wide">{storeName}</p>
                        </div>
                    )}
                </div>

                <div className="flex-1 w-full space-y-3 overflow-y-auto custom-scrollbar pr-1">
                    {MENU_STRUCTURE.filter(grp => grp.allowedRoles.includes(userRole)).map(group => {
                        const isActive = activePanel === group.id || (group.id === 'inicio' && pathname === `/dashboard/loja/${storeId}` && activePanel === null);

                        // Cores Neon para Ativos
                        const neonGlow = isActive ?
                            (group.id === 'atendimento' ? 'shadow-[0_0_15px_rgba(59,130,246,0.3)] bg-blue-500/20 text-blue-300 border-blue-500/30' :
                                group.id === 'loja_vazia' ? 'shadow-[0_0_15px_rgba(245,158,11,0.3)] bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                    group.id === 'gerencia' ? 'shadow-[0_0_15px_rgba(168,85,247,0.3)] bg-purple-500/20 text-purple-300 border-purple-500/30' :
                                        'shadow-[0_0_15px_rgba(255,255,255,0.1)] bg-white/10 text-white border-white/20')
                            : 'text-slate-400 hover:bg-white/5 hover:text-white border-transparent';

                        return (
                            <button
                                key={group.id}
                                onClick={() => handleMainClick(group)}
                                className={`flex items-center rounded-2xl transition-all duration-200 group relative border ${isMainCollapsed ? 'justify-center w-14 h-14' : 'w-full px-4 py-3 gap-4'} ${neonGlow}`}
                                title={isMainCollapsed ? group.label : ''}
                            >
                                <group.icon className={`transition-transform flex-shrink-0 ${isMainCollapsed ? 'h-6 w-6' : 'h-5 w-5'} ${isActive ? 'scale-110 drop-shadow-md' : 'group-hover:scale-110'}`} />
                                {!isMainCollapsed && <span className={`text-sm font-bold uppercase tracking-wide`}>{group.label}</span>}
                                {activePanel === group.id && group.id !== 'inicio' && isMainCollapsed && <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-l-[6px] border-l-white/20 border-b-[6px] border-b-transparent drop-shadow-sm filter"></div>}
                                {activePanel === group.id && group.id !== 'inicio' && !isMainCollapsed && <ChevronRight className="ml-auto h-4 w-4 opacity-50" />}
                            </button>
                        );
                    })}
                </div>

                <div className="mt-auto pt-4 border-t border-white/10 w-full flex flex-col gap-2">
                    {/* === BOTÃO DA IA (SUPORTE) === */}
                    <button
                        onClick={() => router.push(`/dashboard/ajuda?storeId=${storeId}`, { scroll: false })}
                        className={`flex items-center rounded-xl text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 hover:text-blue-200 border border-blue-500/20 transition-all ${isMainCollapsed ? 'justify-center w-14 h-14' : 'w-full px-4 py-3 gap-3'}`}
                        title="Ajuda Inteligente"
                    >
                        <Bot className={`h-5 w-5 ${!isMainCollapsed ? 'animate-pulse' : ''}`} />
                        {!isMainCollapsed && (
                            <div className="flex flex-col items-start">
                                <span className="font-bold text-sm">Suporte IA</span>
                                <span className="text-[10px] text-blue-400/70 font-medium">Tire suas dúvidas</span>
                            </div>
                        )}
                    </button>

                    <button onClick={() => setIsMainCollapsed(!isMainCollapsed)} className={`flex items-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white border border-transparent hover:border-white/10 transition-all ${isMainCollapsed ? 'justify-center w-14 h-14' : 'w-full px-4 py-3 gap-3'}`} title={isMainCollapsed ? "Expandir Menu" : "Recolher Menu"}>
                        {isMainCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
                        {!isMainCollapsed && <span className="font-bold text-xs uppercase tracking-wider">Recolher</span>}
                    </button>
                    <button onClick={handleLogout} className={`flex items-center rounded-xl text-red-400/70 hover:bg-red-500/10 hover:text-red-300 border border-transparent hover:border-red-500/20 transition-all ${isMainCollapsed ? 'justify-center w-14 h-14' : 'w-full px-4 py-3 gap-3'}`} title="Sair">
                        <LogOut className="h-5 w-5" />
                        {!isMainCollapsed && <span className="font-bold text-sm uppercase tracking-wider">Sair</span>}
                    </button>
                </div>
            </nav>

            {activePanel && renderSubPanel()}

            {/* MODAIS agora são renderizados pelo ModalsProvider no layout */}

        </div>
    );
}
