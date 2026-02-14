import { getInadimplentes } from '@/lib/actions/collection.actions'
import { Megaphone } from 'lucide-react'
import CobrancaInterface from '@/components/cobranca/CobrancaInterface'

export default async function CobrancaPage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams: { filtro?: string }
}) {
  const storeId = parseInt(params.storeId, 10)

  // Define o filtro baseado na URL (padrão 'cobrar')
  const activeTab = searchParams.filtro === 'ja_cobrados' ? 'ja_cobrados' : 'cobrar'

  // Busca os dados direto do banco (Server Side)
  const devedores = await getInadimplentes(storeId, activeTab)

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden">

      {/* Header da Página */}
      <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-6 py-3 shadow-sm flex-shrink-0 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/10 rounded-lg text-red-500 border border-red-500/20">
            <Megaphone className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Central de Cobrança</h1>
            <p className="text-xs text-slate-400">Gerencie inadimplência e histórico de contatos</p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-sm font-bold text-slate-400">Total de Devedores</p>
          <p className="text-2xl font-black text-red-500 drop-shadow-sm">{devedores.length}</p>
        </div>
      </div>

      {/* Área Principal (Client Component) */}
      <div className="flex-1 overflow-hidden p-4">
        {/* Passamos os dados iniciais para o componente interativo */}
        <CobrancaInterface
          initialData={devedores}
          storeId={storeId}
          defaultTab={activeTab}
        />
      </div>
    </div>
  )
}