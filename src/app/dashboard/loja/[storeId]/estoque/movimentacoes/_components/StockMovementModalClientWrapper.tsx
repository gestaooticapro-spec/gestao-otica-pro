'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import StockMovementModal from '@/components/modals/StockMovementModal'

export default function StockMovementModalClientWrapper({ storeId }: { storeId: number }) {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <>
            <button 
                onClick={() => setIsOpen(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-bold shadow-md flex items-center gap-2 text-sm transition-colors"
            >
                <Plus className="h-4 w-4" />
                Nova Movimentação
            </button>

            <StockMovementModal 
                isOpen={isOpen} 
                onClose={() => {
                    setIsOpen(false)
                    // Opcional: router.refresh() é chamado internamente no modal via revalidatePath na server action
                }} 
                storeId={storeId} 
            />
        </>
    )
}