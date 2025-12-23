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

type ResumoFinanceiroProps = {
  venda: Venda
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
      className="p-1 bg-slate-200 text-slate-600 rounded-r-md hover:bg-slate-300 disabled:opacity-50 h-8 w-8 flex items-center justify-center"
      title="Aplicar"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingDown className="h-3 w-3" />}
    </button>
  )
}

export default function ResumoFinanceiro({
  venda,
  onUpdate,
  disabled,
}: ResumoFinanceiroProps) {

  const [descontoString, setDescontoString] = useState('0,00')

  const descontoInitialState: UpdateDescontoResult = { success: false, message: '' }
  const [descontoState, dispatchDesconto] = useFormState(updateVendaDesconto, descontoInitialState)

  useEffect(() => {
    setDescontoString(formatCurrency(venda.valor_desconto).replace('R$', '').trim())
  }, [venda.valor_desconto])

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

  const totalPago = venda.valor_final - (venda.valor_restante ?? 0)

  return (
    <div className="flex items-center gap-4 text-xs">

      {/* Bloco 1: Total Bruto */}
      <div className="flex flex-col">
        <span className="text-[9px] text-gray-400 uppercase font-bold">Subtotal</span>
        <span className="font-bold text-gray-600">{formatCurrency(venda.valor_total)}</span>
      </div>

      {/* Bloco 2: Desconto (Formulário Compacto) */}
      <div className="flex flex-col">
        <span className="text-[9px] text-gray-400 uppercase font-bold mb-0.5">Desconto (R$)</span>
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
              className="w-16 rounded-l-md border-gray-300 border-r-0 shadow-sm text-gray-900 h-8 text-xs font-bold text-right disabled:bg-gray-100 focus:ring-0 focus:border-blue-500"
            />
            {!disabled && <DescontoSubmitButton />}
          </div>
        </form>
      </div>

      {/* Bloco 3: Total Pago */}
      <div className="flex flex-col border-l border-gray-200 pl-3">
        <span className="text-[9px] text-gray-400 uppercase font-bold">Pago / Sinal</span>
        <span className="font-bold text-green-600">{formatCurrency(totalPago)}</span>
      </div>

      {/* Bloco 4: A RECEBER (Destaque) */}
      <div className="flex flex-col items-end border-l border-gray-200 pl-3">
        <span className="text-[9px] text-gray-400 uppercase font-bold">A Receber</span>
        <span className={`text-xl font-black leading-none ${venda.valor_restante > 0.01 ? 'text-red-600' : 'text-emerald-600'}`}>
          {formatCurrency(venda.valor_restante)}
        </span>
      </div>

    </div>
  )
}