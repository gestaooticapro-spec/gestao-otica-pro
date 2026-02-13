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
  employeeId: string
  employeeName: string
  disabled: boolean
  hideHeader?: boolean
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
  hideHeader = false,
}: ListaOSProps) {
  // A URL base para a Ficha Técnica
  const linkBase = `/dashboard/loja/${storeId}/vendas/${vendaId}/os`

  // Parâmetros comuns (contexto do funcionário)
  // Nota: Removi o '?' do início para gerenciar melhor a concatenação abaixo
  const commonParams = `employee_id=${employeeId}&employee_name=${employeeName}`

  // O link para CRIAR uma nova OS (Sem ID = Nova)
  const linkNovaOS = `${linkBase}?${commonParams}`

  return (
    <div className="flex flex-col h-full">
      {!hideHeader && (
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
      )}

      {/* Lista de OSs */}
      <div className="flex-1 overflow-y-auto space-y-2 bg-transparent p-0 rounded-lg">
        {serviceOrders.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4 italic">
            Nenhuma Ficha Técnica vinculada a esta venda.
          </p>
        ) : (
          serviceOrders.map((os) => (
            <div
              key={os.id}
              className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/20 transition-all group"
            >
              <div className="font-bold text-slate-200 text-sm">
                OS #{os.id}
                <span className="text-[10px] text-slate-500 ml-2 font-normal">
                  (Criada em: {formatDate(os.created_at)})
                </span>
              </div>

              {/* CORREÇÃO AQUI: Passamos 'os_id' explicitamente na URL */}
              <Link
                href={`${linkBase}?os_id=${os.id}&${commonParams}`}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40 transition-all"
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