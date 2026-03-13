import { getResumoCaixa, getUltimoFechamento } from '@/lib/actions/cashflow.actions'
import CaixaInterface from '@/components/financeiro/CaixaInterface'
import CaixaBackground from '@/components/financeiro/CaixaBackground'

import { DollarSign, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default async function CaixaPage({ params }: { params: { storeId: string } }) {
  const storeId = parseInt(params.storeId, 10)
  const resumo = await getResumoCaixa(storeId)

  let ultimoFechamento = null
  if (!resumo) {
    ultimoFechamento = await getUltimoFechamento(storeId)
  }

  return (
    <CaixaBackground>

      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="bg-slate-900/40 backdrop-blur-xl border-b border-white/10 px-6 py-4 shadow-xl shadow-black/20 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/dashboard/loja/${storeId}`}
              className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
              title="Voltar para o Painel"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-emerald-400" />
              Livro Caixa (Movimento Diário)
            </h1>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="p-6 max-w-7xl mx-auto w-full flex-1">
          <CaixaInterface initialData={resumo} storeId={storeId} ultimoFechamento={ultimoFechamento} />
        </div>
      </div>
    </CaixaBackground>
  )
}