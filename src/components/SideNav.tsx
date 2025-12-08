'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  ShoppingCart, Users, DollarSign, Archive, 
  Settings, BarChart3, Megaphone, Wallet, Zap, Search,
  ChevronLeft, ChevronRight, LogOut, HeartHandshake, ChevronDown, FileText,
  FileInput, ArrowLeftRight, FileSpreadsheet, CalendarRange, Percent, Home // <--- Home Importado
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Role = 'admin' | 'manager' | 'store_operator' | 'vendedor' | 'tecnico';

interface MenuItem {
    label: string;
    icon: React.ElementType;
    route?: string; 
    allowedRoles: Role[];
    children?: MenuItem[]; 
}

interface MenuGroup {
    id: string;
    items: MenuItem[];
}

interface SideNavProps {
    userRole: Role;
    storeId: number; 
    storeName: string;
}

// --- CONFIGURAÇÃO DE ESTILOS POR GRUPO ---
const groupStyles: Record<string, { active: string, hover: string, icon: string }> = {
    // ESTILO NOVO PARA A HOME
    inicio: { 
        active: 'bg-slate-800 text-white shadow-md', 
        hover: 'hover:bg-slate-100 hover:text-slate-900',
        icon: 'text-slate-500'
    },
    vendas: { 
        active: 'bg-blue-50 text-blue-700 shadow-sm', 
        hover: 'hover:bg-blue-50 hover:text-blue-700',
        icon: 'text-blue-600'
    },
    cadastros: { 
        active: 'bg-indigo-50 text-indigo-700 shadow-sm', 
        hover: 'hover:bg-indigo-50 hover:text-indigo-700',
        icon: 'text-indigo-600'
    },
    estoque: { 
        active: 'bg-amber-50 text-amber-800 shadow-sm', 
        hover: 'hover:bg-amber-50 hover:text-amber-800',
        icon: 'text-amber-600'
    },
    infos: { 
        active: 'bg-cyan-50 text-cyan-700 shadow-sm', 
        hover: 'hover:bg-cyan-50 hover:text-cyan-700',
        icon: 'text-cyan-600'
    },
    financeiro: { 
        active: 'bg-emerald-50 text-emerald-700 shadow-sm', 
        hover: 'hover:bg-emerald-50 hover:text-emerald-700',
        icon: 'text-emerald-600'
    },
    gestao: { 
        active: 'bg-slate-100 text-slate-800 shadow-sm', 
        hover: 'hover:bg-slate-100 hover:text-slate-900',
        icon: 'text-slate-600'
    }
};

const menuGroups: MenuGroup[] = [
    // --- NOVO GRUPO: INÍCIO ---
    {
        id: 'inicio',
        items: [
            { label: 'Visão Geral', icon: Home, route: '/dashboard/loja/[id]', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },
        ]
    },
    {
        id: 'vendas',
        items: [
            { label: 'Venda Express', icon: Zap, route: '/dashboard/loja/[id]/pdv-express', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },
            { label: 'Atendimento', icon: ShoppingCart, route: '/dashboard/loja/[id]/atendimento', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },
            { label: 'Fechamento', icon: DollarSign, route: '/dashboard/loja/[id]/vendas', allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico'] },
        ]
    },
    {
        id: 'cadastros',
        items: [
            { label: 'Clientes', icon: Users, route: '/dashboard/loja/[id]/clientes', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },
            { label: 'Catálogo Geral', icon: Archive, route: '/dashboard/loja/[id]/cadastros', allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico'] },
        ]
    },
    {
        id: 'estoque',
        items: [
            { 
                label: 'Importar', 
                icon: FileInput, 
                allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico'],
                children: [
                    { label: 'Nota (XML)', icon: FileText, route: '/dashboard/loja/[id]/importacao', allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico'] },
                    { label: 'Lentes (CSV)', icon: FileSpreadsheet, route: '/dashboard/loja/[id]/cadastros/importar-lentes', allowedRoles: ['admin', 'manager', 'store_operator', 'tecnico'] },
                ]
            },
            { label: 'Movimentações / Perdas', icon: ArrowLeftRight, route: '/dashboard/loja/[id]/estoque/movimentacoes', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },
        ]
    },
    {
        id: 'infos',
        items: [
            { label: 'Informações', icon: Search, route: '/dashboard/loja/[id]/consultas', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },
            { label: 'Pós-Venda / Sucesso', icon: HeartHandshake, route: '/dashboard/loja/[id]/pos-venda', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },
        ]
    },
    {
        id: 'financeiro',
        items: [
            { label: 'Livro Caixa', icon: Wallet, route: '/dashboard/loja/[id]/financeiro/caixa', allowedRoles: ['admin', 'manager', 'store_operator'] },
            { label: 'Cobrança', icon: Megaphone, route: '/dashboard/loja/[id]/cobranca', allowedRoles: ['admin', 'manager', 'store_operator'] },
            { label: 'Contas a Pagar', icon: CalendarRange, route: '/dashboard/loja/[id]/financeiro/contas', allowedRoles: ['admin', 'manager'] },
        ]
    },
    {
        id: 'gestao',
        items: [
            { label: 'Comissões', icon: Percent, route: '/dashboard/loja/[id]/financeiro/comissoes', allowedRoles: ['admin', 'manager'] },
            { 
                label: 'Relatórios', 
                icon: BarChart3, 
                allowedRoles: ['admin', 'manager'],
                children: [
                    { label: 'Vendas Detalhado', icon: FileText, route: '/dashboard/loja/[id]/reports/vendas', allowedRoles: ['admin', 'manager'] },
                ]
            },
            { label: 'Configuração', icon: Settings, route: '/dashboard/loja/[id]/config', allowedRoles: ['admin', 'manager'] }, 
        ]
    }
];

const SideNav = ({ userRole, storeId, storeName }: SideNavProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const supabase = createClient();
    
    const startCollapsed = userRole === 'store_operator' || userRole === 'vendedor';
    const [isCollapsed, setIsCollapsed] = useState(startCollapsed);
    
    const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
    
    const hasAccess = (item: MenuItem) => {
        return item.allowedRoles.includes(userRole);
    };

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) alert('Erro ao sair');
        router.push('/login');
    };

    const toggleMenu = (label: string) => {
        if (isCollapsed) setIsCollapsed(false); 
        setExpandedMenus(prev => 
            prev.includes(label) 
                ? prev.filter(l => l !== label) 
                : [...prev, label]
        );
    };

    const renderMenuItem = (item: MenuItem, groupId: string, isChild = false) => {
        const hasChildren = !!item.children;
        const isExpanded = expandedMenus.includes(item.label);
        
        const finalRoute = item.route ? item.route.replace('[id]', storeId.toString()) : '#';
        const isActive = item.route && pathname === finalRoute;

        const style = groupStyles[groupId] || groupStyles.gestao; 

        const itemClass = `
            flex items-center rounded-xl transition-all duration-200 group font-medium text-sm w-full text-left
            ${isCollapsed ? 'justify-center p-3 aspect-square' : 'px-3 py-2.5'}
            ${isActive 
                ? style.active 
                : `text-gray-500 ${style.hover} hover:bg-opacity-50`}
            ${isChild && !isCollapsed ? 'pl-9 text-xs' : ''} 
        `;

        if (hasChildren) {
            return (
                <div key={item.label}>
                    <button 
                        onClick={() => toggleMenu(item.label)}
                        className={`${itemClass} justify-between`}
                    >
                        <div className="flex items-center">
                            <item.icon className={`
                                flex-shrink-0 transition-colors
                                ${isCollapsed ? 'h-6 w-6' : 'h-5 w-5 mr-3'}
                                ${isExpanded || isActive ? style.icon : 'text-gray-400 group-hover:text-gray-600'}
                            `} />
                            {!isCollapsed && <span>{item.label}</span>}
                        </div>
                        {!isCollapsed && (
                            isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                        )}
                    </button>
                    
                    {isExpanded && !isCollapsed && (
                        <div className="mt-1 space-y-1 animate-in slide-in-from-top-1">
                            {item.children?.map(child => renderMenuItem(child, groupId, true))}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <Link 
                key={item.label}
                href={finalRoute}
                title={isCollapsed ? item.label : ''}
                className={itemClass}
            >
                <item.icon className={`
                    flex-shrink-0 transition-colors
                    ${isCollapsed ? 'h-6 w-6' : 'h-5 w-5 mr-3'}
                    ${isActive && groupId === 'inicio' ? 'text-white' : isActive ? style.icon : 'text-gray-400 group-hover:text-gray-600'}
                    ${isChild ? 'h-4 w-4 opacity-70' : ''}
                `} />
                {!isCollapsed && <span>{item.label}</span>}
            </Link>
        );
    };

    return (
        <nav 
            className={`flex flex-col h-full bg-white border-r border-gray-100 transition-all duration-300 ease-in-out shadow-sm z-50 relative ${
              isCollapsed ? 'w-20' : 'w-64'
            }`}
        >
            <div className="flex items-center justify-between p-5 h-20">
                {!isCollapsed && (
                    <Link 
                        href={`/dashboard/loja/${storeId}`} 
                        className="flex flex-col overflow-hidden animate-in fade-in duration-300 cursor-pointer hover:opacity-80 transition-opacity"
                        title="Ir para o Início"
                    >
                        <h2 className="text-lg font-bold text-teal-600 tracking-tight whitespace-nowrap">
                            Pro<span className="text-gray-400 font-light">Ótica</span>
                        </h2>
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider truncate mt-1">
                            {storeName}
                        </p>
                    </Link>
                )}
                
                <button 
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className={`p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors ${isCollapsed ? 'mx-auto' : ''}`}
                >
                    {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-6 custom-scrollbar">
                {menuGroups.map((group) => {
                    const visibleItems = group.items.filter(hasAccess);
                    if (visibleItems.length === 0) return null;

                    return (
                        <div key={group.id} className="px-3">
                            {!isCollapsed && group.id !== 'inicio' && (
                                <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                                    {group.id}
                                </p>
                            )}
                            <div className="space-y-1">
                                {visibleItems.map(item => renderMenuItem(item, group.id))}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="p-4 border-t border-gray-100">
                <button
                    onClick={handleLogout}
                    className={`
                       flex items-center rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors w-full
                        ${isCollapsed ? 'justify-center p-3' : 'px-3 py-2.5'}
                    `}
                >
                    <LogOut className={`${isCollapsed ? 'h-5 w-5' : 'h-5 w-5 mr-3'}`} />
                    {!isCollapsed && <span className="font-medium text-sm">Sair</span>}
                </button>
            </div>
        </nav>
    );
};

export default SideNav;