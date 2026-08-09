'use client'

import { ArrowLeft, Calendar, ClipboardList, Landmark, ShoppingBag, Wallet } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import FinanciamentoBox from '@/components/vendas/FinanciamentoBox'
import type { VendaPageData } from '@/lib/actions/vendas.actions'

const formatCurrency = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

export default function HistoricalImportedSalePage({ data, storeId }: { data: VendaPageData; storeId: number }) {
  const router = useRouter()
  const { venda, customer, financiamento } = data
  const saldoEmAberto = Number(venda.valor_restante || 0)
  const entradaHistorica = Number((venda as any).historical_entry_amount || 0)
  const temParcelasPendentes = financiamento?.financiamento_parcelas.some(
    (parcela: any) => parcela.status !== 'Pago' && !parcela.data_pagamento
  ) ?? false

  return (
    <main className="min-h-[calc(100vh-64px)] bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-950/20 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Link href={`/dashboard/loja/${storeId}/cliente/${venda.customer_id}/historico`} className="mt-0.5 rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white" title="Voltar ao histórico do cliente">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Venda histórica importada</p>
              <h1 className="mt-1 text-xl font-black text-white">{customer?.full_name || 'Cliente'} <span className="font-mono text-amber-300">#{venda.id}</span></h1>
              <p className="mt-1 text-xs text-slate-400">Registro trazido de {String((venda as any).import_source_system || 'sistema anterior')} em {formatDate(venda.created_at)}.</p>
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-black/20 px-4 py-3 text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Saldo em cobrança</p>
            <p className="text-xl font-black text-amber-300">{formatCurrency(saldoEmAberto)}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><ShoppingBag className="mb-2 h-4 w-4 text-indigo-300" /><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Valor original</p><p className="mt-1 text-lg font-black text-white">{formatCurrency(venda.valor_total)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><Landmark className="mb-2 h-4 w-4 text-emerald-300" /><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Entrada anterior</p><p className="mt-1 text-lg font-black text-white">{formatCurrency(entradaHistorica)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><Calendar className="mb-2 h-4 w-4 text-sky-300" /><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Data da venda</p><p className="mt-1 text-lg font-black text-white">{formatDate(venda.created_at)}</p></div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <div className="mb-4 flex items-center gap-2"><ClipboardList className="h-4 w-4 text-amber-300" /><h2 className="text-sm font-black uppercase tracking-wider text-white">Cobrança e parcelas</h2></div>
          {financiamento ? (
            <FinanciamentoBox
              financiamento={financiamento as any}
              vendaId={venda.id}
              customerId={venda.customer_id}
              customer={customer as any}
              storeId={storeId}
              employeeId={venda.employee_id || 0}
              valorRestante={saldoEmAberto}
              onFinanceAdded={async () => router.refresh()}
              disabled={false}
              isQuitado={!temParcelasPendentes && saldoEmAberto <= 0.01}
              isHistoricalImport
              whatsappReceiptEnabled
            />
          ) : <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-slate-400">Esta venda histórica não possui parcelas importadas.</div>}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-sky-500/15 bg-sky-500/5 p-4 text-xs leading-relaxed text-sky-100/80"><Wallet className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" /><p>Esta tela serve somente ao histórico e à cobrança das parcelas em aberto. Ela não cria OS, não altera estoque, não gera comissão e não lança a entrada anterior no caixa atual.</p></div>
      </div>
    </main>
  )
}
