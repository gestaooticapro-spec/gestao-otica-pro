import { getInadimplentes } from '@/lib/actions/collection.actions'
import { Megaphone } from 'lucide-react'
import CobrancaInterface from '@/components/cobranca/CobrancaInterface'
import ModuleDisabledState from '@/components/modules/ModuleDisabledState'
import { isStoreModuleEnabledForStore } from '@/lib/store-modules.server'

export default async function CobrancaPage(
  props: {
    params: Promise<{ storeId: string }>
    searchParams: Promise<{ filtro?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const storeId = parseInt(params.storeId, 10)
  const enabled = await isStoreModuleEnabledForStore(storeId, 'installments')

  if (!enabled) {
    return <ModuleDisabledState storeId={storeId} moduleLabel="Parcelamento" />
  }

  // Define o filtro baseado na URL (padrão 'cobrar')
  const activeTab = searchParams.filtro === 'ja_cobrados' ? 'ja_cobrados' : 'cobrar'

  // Busca os dados direto do banco (Server Side)
  const devedores = await getInadimplentes(storeId, activeTab)

  return (
    <CobrancaInterface
      initialData={devedores}
      storeId={storeId}
      defaultTab={activeTab}
    />
  )
}
