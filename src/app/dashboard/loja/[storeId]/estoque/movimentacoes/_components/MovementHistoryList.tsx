'use client'

import { useState } from 'react'
import { 
    History, User, Calendar, Info, 
    ArrowRightLeft, Package, X, ArrowDown, ArrowUp, 
    AlertTriangle, Gift, SlidersHorizontal 
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Movement {
    id: number
    created_at: string
    tipo: 'Entrada' | 'Saida' | 'Perda' | 'Brinde' | 'Ajuste' | 'Devolucao' | 'Reserva'
    quantidade: number
    motivo: string
    products: {
        nome: string
        codigo_barras?: string
    }
    product_variants?: {
        nome_variante?: string
        esferico?: number
        cilindrico?: number
        eixo?: number
        adicao?: number
        olho?: string
        diametro?: number
        is_sobra?: boolean
    }
    employees: {
        full_name: string
    }
}

interface Props {
    movimentos: Movement[]
}

const typeConfig = {
    'Entrada': { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: ArrowUp },
    'Saida': { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: ArrowDown },
    'Perda': { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: AlertTriangle },
    'Brinde': { color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: Gift },
    'Ajuste': { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: SlidersHorizontal },
    'Devolucao': { color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', icon: ArrowRightLeft },
    'Reserva': { color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', icon: Package }
}

export default function MovementHistoryList({ movimentos }: Props) {
    const [selectedMovement, setSelectedMovement] = useState<Movement | null>(null)

    const handleClose = () => setSelectedMovement(null)

    return (
        <div className="space-y-3 relative">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                <History className="h-4 w-4" /> Histórico Recente
            </h3>

            {movimentos.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-white/5 rounded-2xl">
                    <History className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">Nenhuma movimentação encontrada.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-2">
                    {movimentos.map((m) => {
                        const config = typeConfig[m.tipo] || typeConfig['Ajuste']
                        const Icon = config.icon

                        return (
                            <button
                                key={m.id}
                                onClick={() => setSelectedMovement(m)}
                                className="group w-full text-left p-3 bg-white/5 border border-white/5 hover:border-white/20 hover:bg-white/10 rounded-xl transition-all flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`h-10 w-10 rounded-lg ${config.bg} ${config.border} border flex items-center justify-center shrink-0`}>
                                        <Icon className={`h-5 w-5 ${config.color}`} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-200 truncate group-hover:text-amber-400 transition-colors">
                                            {m.products?.nome || 'Produto Removido'}
                                        </p>
                                        <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                            <Calendar className="h-3 w-3" /> 
                                            {format(new Date(m.created_at), "dd MMM, HH:mm", { locale: ptBR })}
                                            {m.product_variants && (
                                                <span className="ml-2 px-1 rounded bg-white/5 text-amber-500/80 font-bold">LENTE</span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className={`text-sm font-black ${config.color}`}>
                                        {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                                    </p>
                                    <p className="text-[10px] text-slate-500 font-medium">un</p>
                                </div>
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Modal de Detalhes */}
            {selectedMovement && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div 
                        className="bg-slate-900 border border-white/10 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header do Modal */}
                        <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/5">
                            <div>
                                <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest mb-1">Detalhes da Movimentação</h4>
                                <p className="text-slate-400 text-[10px]">ID #{selectedMovement.id} • {format(new Date(selectedMovement.created_at), "PPP 'às' HH:mm", { locale: ptBR })}</p>
                            </div>
                            <button 
                                onClick={handleClose}
                                className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Corpo do Modal */}
                        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            
                            {/* Produto */}
                            <div className="flex items-start gap-4">
                                <div className={`h-12 w-12 rounded-2xl ${typeConfig[selectedMovement.tipo]?.bg} border border-white/10 flex items-center justify-center shrink-0`}>
                                    <Package className={`h-6 w-6 ${typeConfig[selectedMovement.tipo]?.color}`} />
                                </div>
                                <div className="min-w-0">
                                    <h5 className="text-lg font-bold text-white leading-tight">
                                        {selectedMovement.products?.nome}
                                    </h5>
                                    {selectedMovement.products?.codigo_barras && (
                                        <p className="text-xs text-slate-500 font-mono mt-1">
                                            EAN: {selectedMovement.products.codigo_barras}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Info Principal Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo de Movimento</p>
                                    <div className="flex items-center gap-2">
                                        <div className={`h-2 w-2 rounded-full ${typeConfig[selectedMovement.tipo]?.color.replace('text-', 'bg-')}`} />
                                        <span className={`text-sm font-bold ${typeConfig[selectedMovement.tipo]?.color}`}>
                                            {selectedMovement.tipo}
                                        </span>
                                    </div>
                                </div>
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Quantidade</p>
                                    <p className="text-sm font-bold text-white">
                                        {selectedMovement.quantidade} unidades
                                    </p>
                                </div>
                            </div>

                            {/* Se for LENTE - Graus */}
                            {selectedMovement.product_variants && (
                                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-4">
                                    <div className="flex items-center gap-2 pb-2 border-b border-amber-500/10">
                                        <Info className="h-4 w-4 text-amber-500" />
                                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Especificações Técnicas</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-500 uppercase">Esférico</p>
                                            <p className="text-sm font-bold text-slate-200">
                                                {(selectedMovement.product_variants.esferico ?? 0) > 0 ? '+' : ''}
                                                {selectedMovement.product_variants.esferico?.toFixed(2)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-500 uppercase">Cilíndrico</p>
                                            <p className="text-sm font-bold text-slate-200">
                                                {selectedMovement.product_variants.cilindrico?.toFixed(2)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-500 uppercase">Eixo</p>
                                            <p className="text-sm font-bold text-slate-200">
                                                {selectedMovement.product_variants.eixo ?? '0'}°
                                            </p>
                                        </div>
                                        {selectedMovement.product_variants.adicao && (
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-500 uppercase">Adição</p>
                                                <p className="text-sm font-bold text-slate-200">
                                                    +{selectedMovement.product_variants.adicao.toFixed(2)}
                                                </p>
                                            </div>
                                        )}
                                        {selectedMovement.product_variants.olho && (
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-500 uppercase">Olho</p>
                                                <p className="text-sm font-bold text-slate-200">
                                                    {selectedMovement.product_variants.olho}
                                                </p>
                                            </div>
                                        )}
                                        {selectedMovement.product_variants.diametro && (
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-500 uppercase">Diâmetro</p>
                                                <p className="text-sm font-bold text-slate-200">
                                                    Ø {selectedMovement.product_variants.diametro}mm
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    {selectedMovement.product_variants.is_sobra && (
                                        <div className="mt-2 px-2 py-1 rounded bg-sky-500/10 border border-sky-500/20 inline-block">
                                            <span className="text-[9px] font-black text-sky-400 uppercase">LENTE DE SOBRA (REAPROVEITADA)</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Motivo */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Info className="h-4 w-4 text-slate-500" />
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Motivo da Movimentação</span>
                                </div>
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-sm text-slate-300 italic">
                                    "{selectedMovement.motivo}"
                                </div>
                            </div>

                            {/* Funcionário */}
                            <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5">
                                <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                                    <User className="h-6 w-6 text-slate-500" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Registrado por</p>
                                    <p className="text-sm font-bold text-slate-200">
                                        {selectedMovement.employees?.full_name}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer do Modal */}
                        <div className="p-6 bg-white/5 border-t border-white/5">
                            <button 
                                onClick={handleClose}
                                className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black text-slate-200 uppercase tracking-widest transition-all active:scale-95"
                            >
                                Fechar Detalhes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
