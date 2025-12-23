//============================
//📄 ARQUIVO: src/components/vendas/ListaPagamentos.tsx
//============================

'use client'

import { useTransition } from 'react'
import { deletePagamento } from '@/lib/actions/vendas.actions'
import { Database } from '@/lib/database.types'
import { Loader2, Trash2 } from 'lucide-react'

type Pagamento = Database['public']['Tables']['pagamentos']['Row']

type ListaPagamentosProps = {
  pagamentos: Pagamento[]
  vendaId: number
  storeId: number
  onDelete: () => Promise<void>
  disabled: boolean
}

const formatCurrency = (value: number | null | undefined): string => {
  return (value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    return dateString.split('T')[0].split('-').reverse().join('/');
  } catch (e) {
    return 'Data Inválida';
  }
}

function DeleteButton({
  pagamento,
  vendaId,
  storeId,
  onDelete,
  disabled,
}: {
  pagamento: Pagamento
  vendaId: number
  storeId: number
  onDelete: () => Promise<void>
  disabled: boolean
}) {
  const [isDeleting, startDeleteTransition] = useTransition()

  const handleDelete = () => {
    if (disabled || !window.confirm(`Remover pagamento de ${formatCurrency(pagamento.valor_pago)}?`)) return;

    startDeleteTransition(async () => {
      const result = await deletePagamento(pagamento.id, vendaId, storeId)
      if (result.success) {
        await onDelete()
      } else {
        alert(`Erro: ${result.message}`)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting || disabled}
      className="p-1 text-red-500 rounded-md hover:bg-red-100 disabled:opacity-50 transition-colors"
      title="Estornar / Remover"
    >
      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  )
}

export default function ListaPagamentos({
  pagamentos,
  vendaId,
  storeId,
  onDelete,
  disabled,
}: ListaPagamentosProps) {
  return (
    <div className="flex flex-col h-full">
      {/* SUBTÍTULO DO QUADRO ESQUERDO */}
      <h3 className="text-lg font-bold text-gray-800 mb-3 border-b border-gray-300 pb-2 hidden">
        Histórico de Pgto
      </h3>

      {/* Cabeçalho Verde Esmeralda */}
      <div className="hidden md:flex bg-emerald-50 p-1.5 rounded-t-md font-bold text-emerald-800 text-[10px] uppercase tracking-wider border-b border-emerald-100">
        <div className="w-3/12 pl-1">Data</div>
        <div className="w-3/12">Forma</div>
        <div className="w-3/12 text-right">Valor</div>
        <div className="w-1/12 text-center">Parc.</div>
        <div className="w-2/12 text-center"></div> {/* Coluna Ações vazia */}
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 bg-white p-0 rounded-b-md shadow-inner border border-emerald-50 max-h-60">
        {pagamentos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 bg-emerald-50/30 rounded-b-md border border-dashed border-emerald-100 m-1">
            <p className="text-xs font-medium">Sem pagamentos</p>
          </div>
        ) : (
          pagamentos.map((pag) => (
            <div
              key={pag.id}
              className="flex flex-col md:flex-row md:items-center p-1.5 rounded bg-white border-b border-emerald-50 last:border-0 hover:bg-emerald-50/50 transition-colors group"
            >
              <div className="w-full md:w-3/12 font-medium text-gray-700 text-xs pl-1">
                {formatDate(pag.data_pagamento)}
              </div>
              <div className="w-full md:w-3/12 text-[10px] text-gray-600 font-semibold uppercase">
                {pag.forma_pagamento}
              </div>
              <div className="w-full md:w-3/12 md:text-right font-bold text-emerald-700 text-xs">
                {formatCurrency(pag.valor_pago)}
              </div>
              <div className="w-full md:w-1/12 md:text-center text-[10px] text-gray-500">
                {pag.parcelas}x
              </div>

              {/* Coluna de Ações (Apenas Deletar agora) */}
              <div className="w-full md:w-2/12 flex justify-end md:justify-center gap-1">
                <DeleteButton
                  pagamento={pag}
                  vendaId={vendaId}
                  storeId={storeId}
                  onDelete={onDelete}
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