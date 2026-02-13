//============================
//📄 ARQUIVO: src/components/vendas/ListaPagamentos.tsx
//============================

'use client'

import { useTransition } from 'react'
import { deletePagamento } from '@/lib/actions/vendas.actions'
import { Database } from '@/lib/database.types'
import { Loader2, Trash2 } from 'lucide-react'

type Pagamento = Database['public']['Tables']['pagamentos']['Row'] & {
  employee?: { full_name: string } | null
}

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
      className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded-md transition-colors disabled:opacity-50"
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

      {/* Cabeçalho Laranja (Financeiro) */}
      <div className="hidden md:flex bg-amber-500/10 p-2 rounded-t-xl font-bold text-amber-500 text-[10px] uppercase tracking-wider border-b border-amber-500/20">
        <div className="w-2/12 pl-1">Data</div>
        <div className="w-3/12">Forma</div>
        <div className="w-3/12">Responsável</div>
        <div className="w-2/12 text-right">Valor</div>
        <div className="w-1/12 text-center">Parc.</div>
        <div className="w-1/12 text-right pr-2"></div> {/* Coluna Ações */}
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 bg-transparent p-0 rounded-b-xl custom-scrollbar max-h-60">
        {pagamentos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500 bg-white/5 rounded-b-xl border border-dashed border-white/10 m-0">
            <p className="text-xs font-medium">Sem pagamentos</p>
          </div>
        ) : (
          pagamentos.map((pag) => (
            <div
              key={pag.id}
              className="flex flex-col md:flex-row md:items-center p-2 rounded-lg hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors group"
            >
              <div className="w-full md:w-2/12 font-medium text-slate-300 text-xs pl-1">
                {formatDate(pag.data_pagamento)}
              </div>
              <div className="w-full md:w-3/12 text-[10px] text-amber-200/80 font-semibold uppercase">
                {pag.forma_pagamento}
              </div>
              <div className="w-full md:w-3/12 text-[10px] text-slate-500 uppercase truncate" title={pag.employee?.full_name || 'N/A'}>
                {pag.employee?.full_name?.split(' ')[0] || '-'}
              </div>
              <div className="w-full md:w-2/12 md:text-right font-bold text-amber-400 text-xs">
                {formatCurrency(pag.valor_pago)}
              </div>
              <div className="w-full md:w-1/12 md:text-center text-[10px] text-slate-400">
                {pag.parcelas}x
              </div>

              {/* Coluna de Ações (Alinhada à direita) */}
              <div className="w-full md:w-1/12 flex justify-end pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
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