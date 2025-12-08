// Caminho: src/app/dashboard/loja/[storeId]/consultas/page.tsx
import { getAlertasOperacionais, getAniversariantes } from '@/lib/actions/consultas.actions'
import PaineisAlertas from '@/components/consultas/PaineisAlertas'
import BuscaUniversal from '@/components/consultas/BuscaUniversal'
import AniversariantesWidget from '@/components/consultas/AniversariantesWidget'

export default async function ConsultasPage({ params }: { params: { storeId: string } }) {
  const storeId = parseInt(params.storeId, 10)
  
  // Busca em paralelo para ser rápido
  const [alertas, aniversariantes] = await Promise.all([
      getAlertasOperacionais(storeId),
      getAniversariantes(storeId)
  ])

  return (
    <div className="h-[calc(100vh-64px)] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-teal-100 via-slate-200 to-cyan-100 overflow-hidden p-6">
      
      <div className="max-w-screen-2xl mx-auto h-full grid grid-cols-12 gap-8">
        
        {/* COLUNA ESQUERDA (Busca) - Ocupa 8 colunas em telas grandes */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 h-full overflow-y-auto pr-2 custom-scrollbar">
             <div className="mb-2 pl-1">
                  <h1 className="text-3xl font-black text-slate-800 tracking-tight drop-shadow-sm">Informações Gerais</h1>
                  <p className="text-slate-600 text-sm font-bold opacity-70">Central de inteligência da loja.</p>
             </div>

             <BuscaUniversal storeId={storeId} />
        </div>

        {/* COLUNA DIREITA (Alertas + Aniversariantes) - Ocupa 4 colunas */}
        <div className="col-span-12 lg:col-span-4 flex flex-col h-full overflow-y-auto custom-scrollbar pb-20 gap-6">
             
             {/* WIDGET DE ANIVERSARIANTES (Topo da Coluna Direita) */}
             <div className="shrink-0">
                <AniversariantesWidget clientes={aniversariantes} />
             </div>

             {/* RADAR OPERACIONAL (Abaixo dos Aniversariantes) */}
             <div className="flex-1 flex flex-col gap-4">
                <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 drop-shadow-sm opacity-80">
                    Radar Operacional
                </h2>
                
                <PaineisAlertas 
                    entregas={alertas.entregas} 
                    laboratorio={alertas.laboratorio} 
                    storeId={storeId} 
                />
             </div>
        </div>

      </div>
    </div>
  )
}