import { getTrayContext } from '@/lib/actions/nfc.actions'
import { NfcTrayClient } from './NfcTrayClient'

export default async function NfcTrayPage(
  props: {
    params: Promise<{ storeId: string; trayId: string }>
  }
) {
  const params = await props.params;
  const storeId = parseInt(params.storeId, 10)
  const { trayId } = params

  if (isNaN(storeId) || !trayId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-500 font-medium text-center">URL Inválida.</p>
      </div>
    )
  }

  // Busca o contexto atual da bandeja no servidor
  const result = await getTrayContext(trayId, storeId)

  return (
    <NfcTrayClient 
      initialResult={result} 
      trayId={trayId} 
      storeId={storeId} 
    />
  )
}
