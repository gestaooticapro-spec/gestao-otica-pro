import { getEmployees } from '@/lib/actions/employee.actions'
import PdvExpressInterface from '@/components/vendas/PdvExpressInterface'
import { Zap } from 'lucide-react'
import CashGuard from '@/components/financeiro/CashGuard'

export const dynamic = 'force-dynamic'

export default async function PdvExpressPage({ params }: { params: { storeId: string } }) {
  const storeId = parseInt(params.storeId, 10)

  // Apenas buscamos os funcionários. 
  // NÃO INICIAMOS MAIS A VENDA AQUI (Isso corrige o bug de vendas fantasmas)
  const employees = await getEmployees(storeId)

  return (
    <div className="relative flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden font-sans">

      {/* BACKGROUND IGUAL AO MENU */}
      <div className="absolute inset-0 z-0 bg-[url('/tela1.jpg')] bg-cover bg-center opacity-40 blur-sm" />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/80 via-slate-950/90 to-slate-950" />
      <CashGuard storeId={storeId} />

      {/* Header Simplificado Glass */}
      <div className="relative z-10 bg-white/5 backdrop-blur-md border-b border-white/10 px-6 py-4 flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight uppercase">PDV Express</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Venda Rápida (Balcão)</p>
          </div>
        </div>
      </div>

      {/* Área de Trabalho */}
      <div className="relative z-10 flex-1 p-4 lg:p-6 overflow-hidden">
        <PdvExpressInterface
          storeId={storeId}
          employees={employees}
        />
      </div>
    </div>
  )
}