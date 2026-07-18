// Caminho: src/app/dashboard/loja/[storeId]/consultas/page.tsx
import BackButton from '@/components/ui/BackButton'
import { getAlertasOperacionais, getAniversariantes, getVencimentosProximos } from '@/lib/actions/consultas.actions'
import PaineisAlertas from '@/components/consultas/PaineisAlertas'
import BuscaUniversal from '@/components/consultas/BuscaUniversal'
import AniversariantesWidget from '@/components/consultas/AniversariantesWidget'
import WidgetVencimentos from '@/components/consultas/WidgetVencimentos'
import RetornosCobrancaWidget from '@/components/consultas/RetornosCobrancaWidget'
import { getRetornosDeHoje } from '@/lib/actions/collection.actions'
import { createAdminClient } from '@/lib/supabase/admin'
import ConsultasBackground from '@/components/consultas/ConsultasBackground'
import { getStoreModulesForStore } from '@/lib/store-modules.server'

export default async function ConsultasPage(props: { params: Promise<{ storeId: string }> }) {
  const params = await props.params;
  const storeId = parseInt(params.storeId, 10)

  const supabaseAdmin = createAdminClient()
  const { data: store } = await (supabaseAdmin.from('stores') as any)
    .select('name')
    .eq('id', storeId)
    .single()
  const storeName = store?.name || `Loja ${storeId}`
  const modules = await getStoreModulesForStore(storeId)

  // Busca em paralelo para ser rápido
  const [alertas, aniversariantes, vencimentos, retornos] = await Promise.all([
    getAlertasOperacionais(storeId),
    getAniversariantes(storeId),
    modules.installments ? getVencimentosProximos(storeId) : Promise.resolve([]),
    modules.installments ? getRetornosDeHoje(storeId) : Promise.resolve([])
  ])

  return (
    <ConsultasBackground>
      <div className="max-w-screen-2xl mx-auto h-full flex flex-col gap-6">
        
        {/* HEADER FIXO */}
        <div className="flex items-center gap-4 shrink-0">
          <BackButton title="Voltar" />
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight drop-shadow-md">Informações Gerais</h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] opacity-70">Central de inteligência da loja.</p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-8 flex-1 min-h-0">
          {/* COLUNA ESQUERDA (Busca) */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 h-full overflow-y-auto pr-2 custom-scrollbar">
            <BuscaUniversal storeId={storeId} />
          </div>

        {/* COLUNA DIREITA (Alertas + Aniversariantes) - Ocupa 4 colunas */}
        <div className="col-span-12 lg:col-span-4 flex flex-col h-full overflow-y-auto custom-scrollbar pb-20 gap-6">

          {/* WIDGET DE VENCIMENTOS */}
          {modules.installments && <div className="shrink-0 rounded-3xl overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-white/10">
            <WidgetVencimentos dados={vencimentos} storeName={storeName} storeId={storeId} />
          </div>}

          {/* RETORNOS DE COBRANÇA */}
          {modules.installments && <div className="shrink-0 rounded-3xl overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-white/10">
            <RetornosCobrancaWidget retornos={retornos} />
          </div>}

          {/* WIDGET DE ANIVERSARIANTES */}
          <div className="shrink-0 rounded-3xl overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-white/10">
            <AniversariantesWidget clientes={aniversariantes} storeId={storeId} />
          </div>

          {/* RADAR OPERACIONAL */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="rounded-3xl overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-white/10">
              <PaineisAlertas
                entregas={alertas.entregas}
                laboratorio={alertas.laboratorio}
                storeId={storeId}
              />
            </div>
          </div>
        </div>
        {/* FIM DA GRID */}
        </div>
      </div>
    </ConsultasBackground>
  )
}
