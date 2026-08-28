'use client'

import { useState, useEffect } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  updateVendaDesconto,
  type UpdateDescontoResult,
} from '@/lib/actions/vendas.actions'
import { Database } from '@/lib/database.types'
import { Loader2, TrendingDown } from 'lucide-react'

type Venda = Database['public']['Tables']['vendas']['Row']
type VendaItem = Database['public']['Tables']['venda_itens']['Row']
type Pagamento = Database['public']['Tables']['pagamentos']['Row']

type ResumoFinanceiroProps = {
  venda: Venda
  vendaItens: VendaItem[]
  pagamentos: Pagamento[]
  onUpdate: () => Promise<void>
  disabled: boolean
}

const formatCurrency = (value: number | null | undefined): string => {
  return (value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}
const parseLocaleFloat = (stringNumber: string | null | undefined): number => {
  if (!stringNumber) return 0.0
  const cleaned = stringNumber.replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0.0
}

function DescontoSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="p-1 bg-white/10 text-slate-400 rounded-r-md hover:bg-white/20 disabled:opacity-50 h-9 w-9 flex items-center justify-center border border-l-0 border-white/10"
      title="Aplicar"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingDown className="h-3 w-3" />}
    </button>
  )
}

export default function ResumoFinanceiro({
  venda,
  vendaItens,
  pagamentos,
  onUpdate,
  disabled,
}: ResumoFinanceiroProps) {

  // 1. Calcula o Total Original (Base Fixa)
  const totalOriginal = vendaItens.reduce((acc, item) => {
    const detalhes = (item.detalhes_avulsos as any) || {}
    let originalPrice = detalhes.original_price

    // Fallback: Se não tem original salvo, o preço atual É o original
    if (originalPrice === undefined || originalPrice === null) {
      originalPrice = item.valor_unitario
    }

    return acc + (originalPrice * item.quantidade)
  }, 0)

  // 2. Calcula o Desconto Derivado (Original - Praticado)
  // Praticado = venda.valor_total (que é a soma dos itens já com desconto)
  const derivedDiscount = Math.max(0, totalOriginal - venda.valor_total)

  const [descontoString, setDescontoString] = useState('0,00')

  const descontoInitialState: UpdateDescontoResult = { success: false, message: '' }
  const [descontoState, dispatchDesconto] = useFormState(updateVendaDesconto, descontoInitialState)

  useEffect(() => {
    // Atualiza o input sempre que o desconto derivado mudar (ex: ao carregar ou recalcular)
    setDescontoString(formatCurrency(derivedDiscount).replace('R$', '').trim())
  }, [derivedDiscount])

  useEffect(() => {
    if (descontoState.success) {
      onUpdate()
    }
  }, [descontoState, onUpdate])

  const handleDescontoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '')
    if (value === '') {
      setDescontoString('0,00')
      return
    }
    value = (parseInt(value, 10) / 100).toFixed(2)
    setDescontoString(value.replace('.', ',').replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.'))
  }

  const totalPago = pagamentos.reduce((total, pagamento) => {
    if (pagamento.parcela_id != null) return total
    return total + Number(pagamento.valor_pago || 0)
  }, 0)

  return (
    <div className="flex items-center gap-4 text-xs">

      {/* Bloco 1: Total Bruto (Original) */}
      <div className="flex flex-col">
        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Subtotal</span>
        <span className="font-bold text-slate-200 text-sm">{formatCurrency(totalOriginal)}</span>
      </div>

      {/* Bloco 2: Desconto (Formulário Compacto) */}
      <div className="flex flex-col">
        <span className="text-[10px] text-gray-400 uppercase font-bold mb-0.5 tracking-wider">Desconto (R$)</span>
        <form action={dispatchDesconto} className="flex items-center">
          <input type="hidden" name="venda_id" value={venda.id} />
          <input type="hidden" name="store_id" value={venda.store_id} />
          <input id="valor_desconto" name="valor_desconto" value={parseLocaleFloat(descontoString)} type="hidden" />

          <div className="flex items-center">
            <input
              type="text"
              value={descontoString}
              onChange={handleDescontoChange}
              disabled={disabled}
              className="w-20 rounded-l-md border-white/10 border-r-0 shadow-sm bg-white/5 text-slate-200 h-9 text-sm font-bold text-right disabled:bg-white/5 focus:ring-0 focus:border-blue-500/50"
            />
            {!disabled && <DescontoSubmitButton />}
          </div>
        </form>
      </div>

      {/* Bloco 3: Total Pago */}
      <div className="flex flex-col border-l border-white/10 pl-4">
        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Pago / Sinal</span>
        <span className="font-bold text-emerald-400 text-sm">{formatCurrency(totalPago)}</span>
      </div>

      {/* Bloco 4: A RECEBER (Destaque) */}
      <div className="flex flex-col items-end border-l border-white/10 pl-4">
        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">A Receber</span>
        <span className={`text-xl font-black leading-none ${venda.valor_restante > 0.01 ? 'text-red-500' : 'text-emerald-500'}`}>
          {formatCurrency(venda.valor_restante)}
        </span>
      </div>

    </div>
  )
}
