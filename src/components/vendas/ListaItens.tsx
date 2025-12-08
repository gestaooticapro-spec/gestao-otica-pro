// Caminho: src/components/vendas/ListaItens.tsx
'use client'

import { useTransition } from 'react'
import {
  deleteVendaItem,
  type DeleteVendaItemResult,
} from '@/lib/actions/vendas.actions'
import { Database } from '@/lib/database.types'
import { Loader2, Trash2, XCircle } from 'lucide-react'

type VendaItem = Database['public']['Tables']['venda_itens']['Row']

// Props
type ListaItensProps = {
  itens: VendaItem[]
  vendaId: number
  storeId: number
  onItemDeleted: () => Promise<void> // Função para recarregar a página pai
  disabled: boolean
}

// --- Funções Helper ---
const formatCurrency = (value: number | null | undefined): string => {
  return (value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}
// --- FIM HELPER ---

// --- Botão Deletar (Componente interno) ---
function DeleteButton({
  item,
  vendaId,
  storeId,
  onItemDeleted,
  disabled,
}: {
  item: VendaItem
  vendaId: number
  storeId: number
  onItemDeleted: () => Promise<void>
  disabled: boolean
}) {
  const [isDeleting, startDeleteTransition] = useTransition()

  const handleDelete = () => {
    if (
      disabled ||
      !window.confirm(`Tem certeza que deseja remover o item "${item.descricao}"?`)
    ) {
      return
    }

    startDeleteTransition(async () => {
      const result = await deleteVendaItem(item.id, vendaId, storeId)
      if (result.success) {
        await onItemDeleted() // Recarrega os dados na página pai
      } else {
        alert(`Erro ao remover item: ${result.message}`)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting || disabled}
      className="p-1 text-gray-500 rounded-md hover:text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Remover Item"
    >
      {isDeleting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <XCircle className="h-4 w-4" />
      )}
    </button>
  )
}

// --- Componente Principal da Lista ---
export default function ListaItens({
  itens,
  vendaId,
  storeId,
  onItemDeleted,
  disabled,
}: ListaItensProps) {
  return (
    <div className="flex flex-col h-full">
      <h3 className="text-lg font-semibold text-gray-800 mb-2">
        Itens da Venda
      </h3>
      
      {/* Cabeçalho da Lista */}
      <div className="hidden md:flex bg-gray-300 p-2 rounded-t-md font-semibold text-gray-700 text-sm">
        <div className="w-1/2">Descrição</div>
        <div className="w-1/6 text-center">Qtd.</div>
        <div className="w-1/6 text-right">Vl. Unit.</div>
        <div className="w-1/6 text-right">Vl. Total</div>
        <div className="w-8"></div> {/* Coluna do X */}
      </div>

      {/* Lista de Itens */}
      <div className="flex-1 overflow-y-auto space-y-2 bg-white p-2 rounded-b-md shadow-inner">
        {itens.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            Nenhum item adicionado ao carrinho.
          </p>
        ) : (
          itens.map((item) => (
            <div
              key={item.id}
              className="flex flex-col md:flex-row md:items-center p-2 rounded bg-gray-50 border border-gray-200"
            >
              {/* Descrição */}
              <div className="w-full md:w-1/2 font-medium text-gray-800">
                <span className="md:hidden text-xs text-gray-500">Item: </span>
                {item.descricao}
                <span className="text-xs text-gray-500 italic ml-1">
                  ({item.item_tipo})
                </span>
              </div>
              
              {/* Qtd */}
              <div className="w-full md:w-1/6 md:text-center">
                <span className="md:hidden text-xs text-gray-500">Qtd: </span>
                {item.quantidade}
              </div>
              
              {/* Vl. Unitário */}
              <div className="w-full md:w-1/6 md:text-right">
                <span className="md:hidden text-xs text-gray-500">Vl. Unit: </span>
                {formatCurrency(item.valor_unitario)}
              </div>
              
              {/* Vl. Total */}
              <div className="w-full md:w-1/6 md:text-right font-bold text-blue-700">
                <span className="md:hidden text-xs text-gray-500">Vl. Total: </span>
                {formatCurrency(item.valor_total_item)}
              </div>
              
              {/* Botão Deletar */}
              <div className="w-full md:w-8 flex justify-end md:justify-center mt-1 md:mt-0">
                <DeleteButton
                  item={item}
                  vendaId={vendaId}
                  storeId={storeId}
                  onItemDeleted={onItemDeleted}
                  disabled={disabled}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}