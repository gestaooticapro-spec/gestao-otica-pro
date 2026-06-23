// Diagnóstico SOMENTE LEITURA do estado das bandejas NFC.
// Não executa nenhum UPDATE/INSERT/DELETE.
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRole) {
  console.error('Credenciais Supabase ausentes no .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const OS_ID = 471
const STORE_ID = 1

async function run() {
  console.log('=== DIAGNÓSTICO NFC TRAYS (somente leitura) ===\n')

  // 1) Quantas bandejas possuem a OS 471 vinculada?
  const { data: traysWithOs, error: e1 } = await supabase
    .from('nfc_trays')
    .select('id, store_id, current_service_order_id, status, created_at, updated_at')
    .eq('current_service_order_id', OS_ID)
  if (e1) { console.error('Erro ao buscar bandejas com OS 471:', e1); return }
  console.log(`[1] Bandejas com current_service_order_id = ${OS_ID}: ${traysWithOs.length}`)
  console.table(traysWithOs)
  console.log()

  // 2) Todas as bandejas da store_id 1 (para ver quais estavam "vazias")
  const { data: storeTrays, error: e2 } = await supabase
    .from('nfc_trays')
    .select('id, store_id, current_service_order_id, status, created_at, updated_at')
    .eq('store_id', STORE_ID)
    .order('id', { ascending: true })
  if (e2) { console.error('Erro ao buscar bandejas da loja 1:', e2); return }
  console.log(`[2] Total de bandejas na store_id ${STORE_ID}: ${storeTrays.length}`)
  console.table(storeTrays)
  console.log()

  const vazias = storeTrays.filter((t) => t.current_service_order_id === null)
  console.log(`    -> Bandejas vazias (current_service_order_id IS NULL): ${vazias.length}`)
  console.log()

  // 3) Histórico de eventos da OS 471
  const { data: events, error: e3 } = await supabase
    .from('nfc_tray_events')
    .select('id, tray_id, store_id, service_order_id, action, metadata, created_at')
    .eq('service_order_id', OS_ID)
    .order('created_at', { ascending: false })
    .limit(50)
  if (e3) { console.error('Erro ao buscar eventos da OS 471:', e3); return }
  console.log(`[3] Eventos NFC da OS ${OS_ID} (últimos 50): ${events.length}`)
  console.table(events)
  console.log()

  // 4) Todos os eventos OS_LINKED (para entender o padrão)
  const { data: linkedEvents, error: e4 } = await supabase
    .from('nfc_tray_events')
    .select('id, tray_id, store_id, service_order_id, action, metadata, created_at')
    .eq('action', 'OS_LINKED')
    .order('created_at', { ascending: false })
    .limit(50)
  if (e4) { console.error('Erro ao buscar eventos OS_LINKED:', e4); return }
  console.log(`[4] Eventos OS_LINKED recentes (últimos 50): ${linkedEvents.length}`)
  console.table(linkedEvents)
  console.log()

  // 5) Resumo
  console.log('=== RESUMO ===')
  console.log(`Bandejas com OS ${OS_ID} vinculada agora: ${traysWithOs.length}`)
  if (traysWithOs.length > 1) {
    console.log('!!! PROBLEMA CONFIRMADO: a OS 471 está em mais de uma bandeja.')
    console.log('    Isso só é possível se o índice único idx_nfc_trays_current_os_unique')
    console.log('    NÃO existir no banco (a migration de repair não foi aplicada).')
  } else if (traysWithOs.length === 1) {
    console.log(`OK: OS 471 está em apenas 1 bandeja (${traysWithOs[0].id}).`)
    console.log('    Se você vê OS 471 em outras bandejas "vazias", pode ser cache do')
    console.log('    navegador ou leitura de tags fisicamente duplicadas (mesma URL).')
  } else {
    console.log(`OS 471 NÃO está vinculada a nenhuma bandeja no momento.`)
  }
}

run().catch((err) => {
  console.error('Erro inesperado:', err)
  process.exit(1)
})
