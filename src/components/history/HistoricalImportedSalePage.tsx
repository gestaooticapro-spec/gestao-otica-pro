'use client'

import { ArrowLeft, Calendar, ClipboardList, Landmark, ShoppingBag, Wallet } from 'lucide-react'
import { useRouter } from 'next/navigation'
import HistoricalSaleItemsEditor from '@/components/history/HistoricalSaleItemsEditor'
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
  const { venda, customer, financiamento, vendaItens } = data
  const entradaHistorica = Number((venda as any).historical_entry_amount || 0)
  const parcelasPendentes = financiamento?.financiamento_parcelas.filter((parcela: any) => {
    const status = String(parcela.status || '').toLowerCase()
    return status !== 'pago' && !parcela.data_pagamento
  }) || []
  const saldoCarneAberto = parcelasPendentes.reduce(
    (total: number, parcela: any) => total + Number(parcela.valor_parcela || 0),
    0
  )
  const temParcelasPendentes = parcelasPendentes.length > 0

  const handleBack = () => {
    if (window.history.length > 1) router.back()
    else router.push(`/dashboard/loja/${storeId}/vendas?mode=historico`)
  }

  return (
    <main className="min-h-[calc(100vh-64px)] bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-950/20 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <button type="button" onClick={handleBack} className="mt-0.5 rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white" title="Voltar para a tela anterior">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Venda histórica importada</p>
              <h1 className="mt-1 text-xl font-black text-white">{customer?.full_name || 'Cliente'} <span className="font-mono text-amber-300">#{venda.id}</span></h1>
              <p className="mt-1 text-xs text-slate-400">Registro trazido de {String((venda as any).import_source_system || 'sistema anterior')} em {formatDate(venda.created_at)}.</p>
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-black/20 px-4 py-3 text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Carnê em aberto</p>
            <p className="text-xl font-black text-amber-300">{formatCurrency(saldoCarneAberto)}</p>
            <p className="mt-1 text-[10px] text-slate-500">Saldo da venda: {formatCurrency(0)}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><ShoppingBag className="mb-2 h-4 w-4 text-indigo-300" /><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Valor original</p><p className="mt-1 text-lg font-black text-white">{formatCurrency(venda.valor_total)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><Landmark className="mb-2 h-4 w-4 text-emerald-300" /><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Entrada anterior</p><p className="mt-1 text-lg font-black text-white">{formatCurrency(entradaHistorica)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><Calendar className="mb-2 h-4 w-4 text-sky-300" /><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Data da venda</p><p className="mt-1 text-lg font-black text-white">{formatDate(venda.created_at)}</p></div>
        </div>

        <HistoricalSaleItemsEditor vendaId={venda.id} storeId={storeId} items={vendaItens} />

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
              valorRestante={saldoCarneAberto}
              onFinanceAdded={async () => router.refresh()}
              disabled={false}
              isQuitado={!temParcelasPendentes}
              isHistoricalImport
              whatsappReceiptEnabled
            />
          ) : <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-slate-400">Esta venda histórica não possui parcelas importadas.</div>}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-sky-500/15 bg-sky-500/5 p-4 text-xs leading-relaxed text-sky-100/80"><Wallet className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" /><p>Esta tela preserva o histórico e permite cobrar parcelas e complementar os produtos comprados. Essas ações não criam OS, não alteram estoque, não geram comissão e não lançam a entrada anterior no caixa atual.</p></div>
      </div>
    </main>
  )
}
