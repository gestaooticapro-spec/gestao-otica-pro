import assert from 'node:assert/strict'
import { loadEnvConfig } from '@next/env'
import { WhatsAppRedesignConversationStore } from '../src/lib/whatsapp/redesign/store'

// Consulta somente leitura. Não classifica, não processa, não envia e não grava.
// Uso: npm run check:whatsapp-redesign:db -- --turn-id=<uuid> --store-id=1
async function main() {
  const turnId = process.argv.find((arg) => arg.startsWith('--turn-id='))?.slice('--turn-id='.length)
  const storeIdText = process.argv.find((arg) => arg.startsWith('--store-id='))?.slice('--store-id='.length) ?? '1'
  if (!turnId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(turnId)) {
    throw new Error('Informe --turn-id=<uuid> de um turno de teste conhecido.')
  }
  const storeId = Number(storeIdText)
  if (!Number.isSafeInteger(storeId) || storeId < 1) throw new Error('store-id invalido.')

  loadEnvConfig(process.cwd())
  const context = await new WhatsAppRedesignConversationStore().loadTurnContext(turnId)
  assert.equal(context.conversation.store_id, storeId, 'O turno não pertence à loja informada.')
  const closesAt = Date.parse(context.turn.closes_at)
  const allMessagesAtOrBeforeClose = context.memory.messages.every(
    (message) => Date.parse(message.occurredAt) <= closesAt
  )
  assert.equal(allMessagesAtOrBeforeClose, true, 'O contexto contém mensagem posterior ao turno.')

  // Não imprime telefones, textos, metadados ou credenciais.
  console.log(JSON.stringify({
    turnId,
    storeId,
    status: context.turn.status,
    mode: context.conversation.mode,
    humanControl: context.memory.summary.humanControl,
    activeTopic: context.memory.summary.activeTopic,
    memoryMessageCount: context.memory.messages.length,
    allMessagesAtOrBeforeClose,
  }))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Falha na conferência de leitura.')
  process.exitCode = 1
})
