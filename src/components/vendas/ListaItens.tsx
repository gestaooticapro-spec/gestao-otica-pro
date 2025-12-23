// Caminho: src/components/vendas/ListaItens.tsx
'use client'

import { useTransition } from 'react'
import {
  deleteVendaItem,
  type DeleteVendaItemResult,
  type VendaItem,
} from '@/lib/actions/vendas.actions'
import { Database } from '@/lib/database.types'
import { Loader2, Trash2 } from 'lucide-react'

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
      className="p-1 text-red-500 rounded hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Remover Item"
    >
      {isDeleting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
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
      {/* Título removido pois já existe no container pai */}

      {/* Cabeçalho da Lista */}
      <div className="hidden md:flex bg-gray-100 p-1.5 rounded-t-md font-bold text-gray-600 text-[10px] uppercase tracking-wider border-b border-gray-200">
        <div className="w-1/2 pl-1">Descrição</div>
        <div className="w-1/6 text-center">Qtd.</div>
        <div className="w-1/6 text-right">Unit.</div>
        <div className="w-1/6 text-right pr-2">Total</div>
        <div className="w-6"></div> {/* Coluna do X */}
      </div>

      {/* Lista de Itens */}
      <div className="flex-1 overflow-y-auto space-y-1 bg-white p-0 rounded-b-md">
        {itens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 bg-gray-50/50 rounded-b-md border border-dashed border-gray-200 m-1">
            <p className="text-xs font-medium">Carrinho vazio</p>
            <p className="text-[10px]">Adicione itens ao lado</p>
          </div>
        ) : (
          itens.map((item) => (
            <div
              key={item.id}
              className="flex flex-col md:flex-row md:items-center p-1.5 rounded hover:bg-blue-50/50 border-b border-gray-50 last:border-0 transition-colors group"
            >
              {/* Descrição */}
              <div className="w-full md:w-1/2 font-medium text-gray-800 text-xs pl-1">
                <span className="md:hidden text-[10px] text-gray-500 uppercase font-bold mr-1">Item:</span>
                {item.descricao}
                <span className="text-[9px] text-gray-400 italic ml-1 bg-gray-100 px-1 rounded border">
                  {item.item_tipo}
                </span>
              </div>

              {/* Qtd */}
              <div className="w-full md:w-1/6 md:text-center text-xs">
                <span className="md:hidden text-[10px] text-gray-500 uppercase font-bold mr-1">Qtd:</span>
                <span className="font-bold">{item.quantidade}</span> <span className="text-[9px] text-gray-400 uppercase">{item.unidade || 'Un.'}</span>
              </div>

              {/* Vl. Unitário */}
              <div className="w-full md:w-1/6 md:text-right text-xs text-gray-600">
                <span className="md:hidden text-[10px] text-gray-500 uppercase font-bold mr-1">Unit:</span>
                {formatCurrency(item.valor_unitario)}
              </div>

              {/* Vl. Total */}
              <div className="w-full md:w-1/6 md:text-right font-bold text-blue-700 text-xs pr-2">
                <span className="md:hidden text-[10px] text-gray-500 uppercase font-bold mr-1">Total:</span>
                {formatCurrency(item.valor_total_item)}
              </div>

              {/* Botão Deletar */}
              <div className="w-full md:w-6 flex justify-end md:justify-center mt-1 md:mt-0">
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