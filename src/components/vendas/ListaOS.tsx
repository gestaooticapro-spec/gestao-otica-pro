// Caminho: src/components/vendas/ListaOS.tsx
'use client'

import Link from 'next/link'
import { Database } from '@/lib/database.types'
import { FileText, PlusCircle, PenTool } from 'lucide-react'

type ServiceOrder = Database['public']['Tables']['service_orders']['Row']

// Props
type ListaOSProps = {
  vendaId: number
  storeId: number
  serviceOrders: ServiceOrder[]
  employeeId: string // Recebido da URL (useSearchParams)
  employeeName: string // Recebido da URL (useSearchParams)
  disabled: boolean
}

// --- Funções Helper ---
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A'
  try {
    return new Date(dateString).toLocaleDateString('pt-BR')
  } catch (e) {
    return 'Data Inválida'
  }
}
// --- FIM HELPER ---

// --- Componente Principal ---
export default function ListaOS({
  vendaId,
  storeId,
  serviceOrders,
  employeeId,
  employeeName,
  disabled,
}: ListaOSProps) {
  // A URL base para a Ficha Técnica (o módulo que já criamos)
  const linkBase = `/dashboard/loja/${storeId}/vendas/${vendaId}/os`
  const queryParams = `?employee_id=${employeeId}&employee_name=${employeeName}`
  
  // O link para CRIAR uma nova OS
  const linkNovaOS = `${linkBase}?index=-1${queryParams}`

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold text-gray-800">
          Fichas Técnicas (OS)
        </h3>
        <Link
          href={linkNovaOS}
          className="flex items-center gap-1 px-3 py-1 text-sm rounded-md shadow-sm bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          title="Iniciar nova Ordem de Serviço"
        >
          <PlusCircle className="h-4 w-4" />
          Nova OS
        </Link>
      </div>

      {/* Lista de OSs */}
      <div className="flex-1 overflow-y-auto space-y-2 bg-white p-2 rounded-lg shadow-inner">
        {serviceOrders.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            Nenhuma Ficha Técnica vinculada a esta venda.
          </p>
        ) : (
          serviceOrders.map((os, index) => (
            <div
              key={os.id}
              className="flex justify-between items-center p-2 rounded bg-gray-50 border border-gray-200"
            >
              <div className="font-medium text-gray-800">
                OS #{os.id}
                <span className="text-xs text-gray-500 ml-2">
                  (Criada em: {formatDate(os.created_at)})
                </span>
              </div>
              <Link
                href={`${linkBase}?index=${index}${queryParams}`}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                title="Ver e editar ficha técnica"
              >
                <PenTool className="h-3 w-3" />
                Ver/Editar
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  )
}