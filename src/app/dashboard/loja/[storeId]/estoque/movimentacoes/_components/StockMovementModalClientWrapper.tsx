'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import StockMovementModal from '@/components/modals/StockMovementModal'

export default function StockMovementModalClientWrapper({ storeId, initialSearchTerm }: { storeId: number, initialSearchTerm?: string }) {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="w-full bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white border border-white/5 hover:border-amber-500/30 h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all"
            >
                <Plus className="h-4 w-4" />
                Nova Movimentação
            </button>

            <StockMovementModal
                isOpen={isOpen}
                onClose={() => {
                    setIsOpen(false)
                }}
                storeId={storeId}
                initialSearchTerm={initialSearchTerm}
            />
        </>
    )
}