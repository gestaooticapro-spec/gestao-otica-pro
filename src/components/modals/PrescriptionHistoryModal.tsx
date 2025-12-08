// ARQUIVO: src/components/modals/PrescriptionHistoryModal.tsx
'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, History, Check, Calendar, Stethoscope, User } from 'lucide-react'
import { getCustomerPrescriptionHistory, type PrescriptionHistoryItem } from '@/lib/actions/vendas.actions'

type PrescriptionHistoryModalProps = {
  isOpen: boolean
  onClose: () => void
  onSelect: (data: PrescriptionHistoryItem) => void
  customerId: number
  storeId: number
  dependenteId: number | null // <--- RECEBE O ID DE QUEM ESTÁ SELECIONADO
  dependenteNome?: string // Opcional, só para exibir no título
}

// Helper
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pt-BR')

export default function PrescriptionHistoryModal({
  isOpen,
  onClose,
  onSelect,
  customerId,
  storeId,
  dependenteId,
  dependenteNome
}: PrescriptionHistoryModalProps) {
  const [history, setHistory] = useState<PrescriptionHistoryItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && customerId) {
      setLoading(true)
      // Passamos o dependenteId para filtrar no backend
      getCustomerPrescriptionHistory(customerId, storeId, dependenteId)
        .then(data => setHistory(data))
        .finally(() => setLoading(false))
    }
  }, [isOpen, customerId, storeId, dependenteId]) // <--- Recarrega se mudar o paciente

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div 
        className="relative w-full max-w-2xl bg-gray-100 rounded-xl shadow-2xl border border-gray-300 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 bg-white border-b border-gray-200">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <History className="h-5 w-5 text-blue-600" />
              Histórico de Receitas
            </h3>
            {/* Feedback visual de quem estamos vendo */}
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
               Filtrando por: <span className="font-bold bg-blue-50 text-blue-700 px-1.5 rounded flex items-center gap-1"><User className="h-3 w-3"/> {dependenteNome || 'Titular'}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Lista de Receitas */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <p className="text-sm">Buscando histórico de {dependenteNome || 'Titular'}...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p>Nenhuma receita encontrada para este paciente.</p>
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:border-blue-300 transition-colors">
                
                {/* Cabeçalho do Card */}
                <div className="flex justify-between items-start mb-3 border-b border-gray-100 pb-2">
                  <div className="flex gap-4">
                    <span className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                      <Calendar className="h-3 w-3" /> {formatDate(item.created_at)}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-medium text-gray-600">
                      <Stethoscope className="h-3 w-3" /> {item.oftalmologistas?.nome_completo || 'Médico N/A'}
                    </span>
                  </div>
                  <button 
                    onClick={() => onSelect(item)}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1 shadow-sm transition-transform active:scale-95"
                  >
                    <Check className="h-3 w-3" /> USAR ESTA
                  </button>
                </div>

                {/* Grid de Resumo dos Valores */}
                <div className="grid grid-cols-7 gap-2 text-center text-xs">
                  {/* Labels */}
                  <div className="col-span-1 font-bold text-gray-400 text-[10px] self-center">OLHO</div>
                  <div className="col-span-2 font-bold text-gray-400 text-[10px]">ESF</div>
                  <div className="col-span-2 font-bold text-gray-400 text-[10px]">CIL</div>
                  <div className="col-span-2 font-bold text-gray-400 text-[10px]">EIXO</div>

                  {/* OD */}
                  <div className="col-span-1 font-bold text-blue-600 self-center">OD</div>
                  <div className="col-span-2 bg-gray-100 rounded py-1 font-medium text-gray-700">
                    {item.receita_longe_od_esferico || '-'}
                  </div>
                  <div className="col-span-2 bg-gray-100 rounded py-1 font-medium text-gray-700">
                    {item.receita_longe_od_cilindrico || '-'}
                  </div>
                  <div className="col-span-2 bg-gray-100 rounded py-1 font-medium text-gray-700">
                    {item.receita_longe_od_eixo || '-'}
                  </div>

                  {/* OE */}
                  <div className="col-span-1 font-bold text-blue-600 self-center">OE</div>
                  <div className="col-span-2 bg-gray-100 rounded py-1 font-medium text-gray-700">
                    {item.receita_longe_oe_esferico || '-'}
                  </div>
                  <div className="col-span-2 bg-gray-100 rounded py-1 font-medium text-gray-700">
                    {item.receita_longe_oe_cilindrico || '-'}
                  </div>
                  <div className="col-span-2 bg-gray-100 rounded py-1 font-medium text-gray-700">
                    {item.receita_longe_oe_eixo || '-'}
                  </div>
                </div>

                {/* Footer do Card (Adição e DNP) */}
                {(item.receita_adicao || item.medida_dnp_od) && (
                  <div className="mt-3 pt-2 border-t border-dashed border-gray-200 flex gap-4 text-xs text-gray-600">
                    {item.receita_adicao && <span>Add: <strong>{item.receita_adicao}</strong></span>}
                    {item.medida_dnp_od && <span>DNP OD: <strong>{item.medida_dnp_od}</strong></span>}
                    {item.medida_dnp_oe && <span>DNP OE: <strong>{item.medida_dnp_oe}</strong></span>}
                  </div>
                )}

              </div>
            ))
          )}
        </div>
        
        <div className="bg-gray-200 px-5 py-3 text-right">
            <button onClick={onClose} className="text-sm font-bold text-gray-600 hover:text-gray-800">Cancelar</button>
        </div>
      </div>
    </div>
  )
}