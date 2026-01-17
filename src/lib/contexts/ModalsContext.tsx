'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import ParcelaSearchModal from '@/components/modals/ParcelaSearchModal';
import LabTrackingModal from '@/components/modals/LabTrackingModal';
import EntregaModal from '@/components/modals/EntregaModal';
import CustomerHistoryModal from '@/components/modals/CustomerHistoryModal';

// --- TIPOS ---
interface ModalsContextType {
    openParcelaModal: () => void;
    openLabModal: () => void;
    openEntregaModal: () => void;
    openCustomerHistoryModal: () => void;
    closeAllModals: () => void;
}

interface ModalsProviderProps {
    children: ReactNode;
    storeId: number;
}

// --- CONTEXTO ---
const ModalsContext = createContext<ModalsContextType | undefined>(undefined);

// --- PROVIDER ---
export function ModalsProvider({ children, storeId }: ModalsProviderProps) {
    const [isParcelaModalOpen, setIsParcelaModalOpen] = useState(false);
    const [isLabModalOpen, setIsLabModalOpen] = useState(false);
    const [isEntregaModalOpen, setIsEntregaModalOpen] = useState(false);
    const [isCustomerHistoryModalOpen, setIsCustomerHistoryModalOpen] = useState(false);

    const openParcelaModal = () => setIsParcelaModalOpen(true);
    const openLabModal = () => setIsLabModalOpen(true);
    const openEntregaModal = () => setIsEntregaModalOpen(true);
    const openCustomerHistoryModal = () => setIsCustomerHistoryModalOpen(true);

    const closeAllModals = () => {
        setIsParcelaModalOpen(false);
        setIsLabModalOpen(false);
        setIsEntregaModalOpen(false);
        setIsCustomerHistoryModalOpen(false);
    };

    return (
        <ModalsContext.Provider
            value={{
                openParcelaModal,
                openLabModal,
                openEntregaModal,
                openCustomerHistoryModal,
                closeAllModals
            }}
        >
            {children}

            {/* Modais Globais */}
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

            <CustomerHistoryModal
                isOpen={isCustomerHistoryModalOpen}
                onClose={() => setIsCustomerHistoryModalOpen(false)}
                storeId={storeId}
            />
        </ModalsContext.Provider>
    );
}

// --- HOOK ---
export function useModals(): ModalsContextType {
    const context = useContext(ModalsContext);
    if (context === undefined) {
        throw new Error('useModals must be used within a ModalsProvider');
    }
    return context;
}
