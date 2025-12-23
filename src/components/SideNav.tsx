// ARQUIVO: src/components/SideNav.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    // Ícones
    ShoppingCart, Users, DollarSign, Archive,
    Settings, BarChart3, Megaphone, Wallet, Zap, Search,
    LogOut, HeartHandshake, FileText, Bot, // <--- BOT ADICIONADO AQUI
    FileInput, ArrowLeftRight, FileSpreadsheet, CalendarRange, Percent, Home, LifeBuoy,
    CheckCircle2, Tag, ChevronRight, ChevronLeft, PanelLeftClose, PanelLeftOpen, X, Globe
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// IMPORTS DOS MODAIS
import ParcelaSearchModal from '@/components/modals/ParcelaSearchModal';
import LabTrackingModal from '@/components/modals/LabTrackingModal';
import EntregaModal from '@/components/modals/EntregaModal';

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
                route: '#',
                action: 'openEntregaModal',
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
                route: '#',
                action: 'openLabModal',
                allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico']
            },

            { label: 'Movimentações', icon: ArrowLeftRight, route: '/dashboard/loja/[id]/estoque/movimentacoes', allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico'] },

            // Separador após Importar XML
            { label: 'Importar XML', icon: FileInput, route: '/dashboard/loja/[id]/importacao', allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico'], withSeparator: true },

            { label: 'Produtos & Preços', icon: Tag, route: '/dashboard/loja/[id]/cadastros', allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico'] },
            { label: 'Histórico Vendas', icon: FileSpreadsheet, route: '/dashboard/loja/[id]/vendas', allowedRoles: ['admin', 'manager', 'store_operator'] },
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
            { label: 'Relat. Vendas', icon: BarChart3, route: '/dashboard/loja/[id]/reports/vendas', allowedRoles: ['admin', 'manager'], withSeparator: true },

            { label: 'Configuração', icon: Settings, route: '/dashboard/loja/[id]/config', allowedRoles: ['admin', 'manager'] },
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

    // Modais
    const [isParcelaModalOpen, setIsParcelaModalOpen] = useState(false);
    const [isLabModalOpen, setIsLabModalOpen] = useState(false);
    const [isEntregaModalOpen, setIsEntregaModalOpen] = useState(false);

    useEffect(() => {
        // Opcional: Fecha o painel ao navegar
        // setActivePanel(null); 
    }, [pathname]);

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) alert('Erro ao sair');
        router.push('/login');
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
            <div className={`bg-slate-50 border-r border-gray-200 h-full flex flex-col transition-all duration-300 ease-in-out shadow-xl z-20 relative ${isSubCollapsed ? 'w-20' : 'w-64'}`}>
                <div className="h-20 border-b border-gray-200 flex items-center justify-between px-4 bg-white shrink-0">
                    {!isSubCollapsed && (
                        <h3 className="font-black text-slate-700 uppercase tracking-widest text-xs truncate animate-in fade-in">
                            {group.label}
                        </h3>
                    )}
                    <div className="flex gap-1 ml-auto">
                        <button onClick={() => setIsSubCollapsed(!isSubCollapsed)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors">
                            {isSubCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        </button>
                        {!isSubCollapsed && (
                            <button onClick={() => setActivePanel(null)} className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                    {group.subItems.filter(sub => sub.allowedRoles.includes(userRole)).map(sub => {
                        let activeClass = 'bg-slate-200 text-slate-900 font-bold';
                        let iconActiveColor = 'text-slate-700';

                        if (group.id === 'atendimento') { activeClass = 'bg-blue-100 text-blue-800 font-bold'; iconActiveColor = 'text-blue-600'; }
                        if (group.id === 'loja_vazia') { activeClass = 'bg-amber-100 text-amber-800 font-bold'; iconActiveColor = 'text-amber-600'; }
                        if (group.id === 'gerencia') { activeClass = 'bg-purple-100 text-purple-800 font-bold'; iconActiveColor = 'text-purple-600'; }

                        const baseClass = `flex items-center rounded-lg transition-all duration-200 group/item relative ${isSubCollapsed ? 'justify-center p-3 aspect-square' : 'gap-3 p-3 w-full text-left'}`;

                        // LÓGICA DE AÇÃO
                        const isAction = !!sub.action;
                        const finalRoute = isAction ? '#' : sub.route.replace('[id]', storeId.toString());
                        const isActive = !isAction && pathname === finalRoute;

                        const content = (
                            <>
                                <sub.icon className={`flex-shrink-0 transition-transform duration-200 ${isSubCollapsed ? 'h-6 w-6' : 'h-4 w-4'} ${isActive ? iconActiveColor : 'opacity-70 group-hover/item:opacity-100 group-hover/item:scale-110 text-slate-500'}`} />
                                {!isSubCollapsed && <span className="text-sm truncate">{sub.label}</span>}
                                {!isSubCollapsed && isActive && <ChevronRight className="h-3 w-3 ml-auto opacity-50" />}
                            </>
                        );

                        // Decide se renderiza Link ou Button
                        const itemElement = isAction ? (
                            <button
                                onClick={() => {
                                    if (sub.action === 'openParcelaModal') setIsParcelaModalOpen(true);
                                    if (sub.action === 'openLabModal') setIsLabModalOpen(true);
                                    if (sub.action === 'openEntregaModal') setIsEntregaModalOpen(true);
                                }}
                                className={`${baseClass} ${isActive ? activeClass : 'hover:bg-white hover:shadow-sm text-slate-600 hover:text-slate-900'}`}
                                title={isSubCollapsed ? sub.label : ''}
                            >
                                {content}
                            </button>
                        ) : (
                            <Link href={finalRoute} className={`${baseClass} ${isActive ? activeClass : 'hover:bg-white hover:shadow-sm text-slate-600 hover:text-slate-900'}`} title={isSubCollapsed ? sub.label : ''}>
                                {content}
                            </Link>
                        );

                        return (
                            <div key={sub.label} className="block">
                                {itemElement}
                                {/* RENDERIZA A LINHA APENAS SE FOR SOLICITADO E O MENU ESTIVER ABERTO */}
                                {sub.withSeparator && !isSubCollapsed && (
                                    <div className="my-2 border-b border-gray-200 mx-2" />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        // --- ALTERAÇÃO ESTRATÉGICA AQUI ---
        // Troquei 'h-full' por 'h-[calc(100vh-64px)]'
        // Isso força o menu a ter o tamanho exato da tela menos o cabeçalho (64px),
        // garantindo que os botões (Sair/Recolher) fiquem no rodapé mesmo sem mexer no Layout.
        <div className="flex h-[calc(100vh-64px)] relative z-10">
            <nav className={`bg-white border-r border-gray-200 h-full flex flex-col py-4 z-20 shadow-md relative transition-all duration-300 ease-in-out ${isMainCollapsed ? 'w-20 items-center' : 'w-64 px-4'}`}>
                <div className={`mb-8 flex items-center ${isMainCollapsed ? 'justify-center' : 'justify-between'}`}>
                    {logoUrl ? (
                        <div className={`relative ${isMainCollapsed ? 'w-10 h-10' : 'w-12 h-12'} shrink-0`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={logoUrl}
                                alt={storeName}
                                className="w-full h-full object-contain rounded-md"
                            />
                        </div>
                    ) : (
                        <div className="h-10 w-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-lg cursor-default select-none shrink-0">PRO</div>
                    )}
                    {!isMainCollapsed && (
                        <div className="ml-3 overflow-hidden">
                            <h2 className="text-sm font-bold text-slate-800 whitespace-nowrap">Gestão Ótica</h2>
                            <p className="text-[10px] text-slate-400 font-medium uppercase truncate">{storeName}</p>
                        </div>
                    )}
                </div>

                <div className="flex-1 w-full space-y-3 overflow-y-auto custom-scrollbar pr-1">
                    {MENU_STRUCTURE.filter(grp => grp.allowedRoles.includes(userRole)).map(group => {
                        const isActive = activePanel === group.id || (group.id === 'inicio' && pathname === `/dashboard/loja/${storeId}`);
                        return (
                            <button
                                key={group.id}
                                onClick={() => handleMainClick(group)}
                                className={`flex items-center rounded-2xl transition-all duration-200 group relative ${isMainCollapsed ? 'justify-center w-14 h-14' : 'w-full px-4 py-3 gap-4'} ${isActive ? `${getActiveColor(group.id)} shadow-lg` : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
                                title={isMainCollapsed ? group.label : ''}
                            >
                                <group.icon className={`transition-transform flex-shrink-0 ${isMainCollapsed ? 'h-6 w-6' : 'h-5 w-5'} ${isActive && isMainCollapsed ? 'scale-110' : 'group-hover:scale-110'}`} />
                                {!isMainCollapsed && <span className={`text-sm font-bold uppercase tracking-wide ${isActive ? 'opacity-100' : 'text-slate-500 group-hover:text-slate-700'}`}>{group.label}</span>}
                                {activePanel === group.id && group.id !== 'inicio' && isMainCollapsed && <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-l-[6px] border-l-white border-b-[6px] border-b-transparent drop-shadow-sm filter"></div>}
                                {activePanel === group.id && group.id !== 'inicio' && !isMainCollapsed && <ChevronRight className="ml-auto h-4 w-4 opacity-50" />}
                            </button>
                        );
                    })}
                </div>

                <div className="mt-auto pt-4 border-t border-gray-100 w-full flex flex-col gap-2">
                    {/* === BOTÃO DA IA (SUPORTE) === */}
                    <button
                        onClick={() => router.push(`/dashboard/ajuda?storeId=${storeId}`, { scroll: false })}
                        className={`flex items-center rounded-xl text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 transition-all ${isMainCollapsed ? 'justify-center w-14 h-14' : 'w-full px-4 py-3 gap-3'}`}
                        title="Ajuda Inteligente"
                    >
                        <Bot className={`h-5 w-5 ${!isMainCollapsed ? 'animate-pulse' : ''}`} />
                        {!isMainCollapsed && (
                            <div className="flex flex-col items-start">
                                <span className="font-bold text-sm">Suporte IA</span>
                                <span className="text-[10px] text-blue-400 font-medium">Tire suas dúvidas</span>
                            </div>
                        )}
                    </button>

                    <button onClick={() => setIsMainCollapsed(!isMainCollapsed)} className={`flex items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all ${isMainCollapsed ? 'justify-center w-14 h-14' : 'w-full px-4 py-3 gap-3'}`} title={isMainCollapsed ? "Expandir Menu" : "Recolher Menu"}>
                        {isMainCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
                        {!isMainCollapsed && <span className="font-bold text-xs uppercase">Recolher</span>}
                    </button>
                    <button onClick={handleLogout} className={`flex items-center rounded-xl text-red-300 hover:bg-red-50 hover:text-red-500 transition-all ${isMainCollapsed ? 'justify-center w-14 h-14' : 'w-full px-4 py-3 gap-3'}`} title="Sair">
                        <LogOut className="h-5 w-5" />
                        {!isMainCollapsed && <span className="font-bold text-sm">Sair</span>}
                    </button>
                </div>
            </nav>

            {activePanel && renderSubPanel()}

            {/* MODAIS GLOBAIS */}
            <ParcelaSearchModal
                isOpen={isParcelaModalOpen}
                onClose={() => setIsParcelaModalOpen(false)}
                storeId={storeId}
            />

            <LabTrackingModal
                isOpen={isLabModalOpen}
                onClose={() => setIsLabModalOpen(false)}
                storeId={storeId}
            />

            <EntregaModal
                isOpen={isEntregaModalOpen}
                onClose={() => setIsEntregaModalOpen(false)}
                storeId={storeId}
            />

        </div>
    );
}