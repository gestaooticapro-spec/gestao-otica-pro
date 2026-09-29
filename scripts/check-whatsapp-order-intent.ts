import dotenv from 'dotenv'

// Avaliacao opt-in: so classifica frases sinteticas; nao consulta clientes nem envia WhatsApp.
dotenv.config({ path: '.env.local', quiet: true })

async function main() {
  const { classifyWhatsAppRedesignConversation, writeWhatsAppToolAgentReply } = await import('../src/lib/whatsapp/ai')
  const { runStoreOneOrderStatusTurn } = await import('../src/lib/whatsapp/redesign/order-status-live')
  const summary = {
    activeTopic: 'vision_exam' as const,
    secondaryTopics: [],
    phase: 'active' as const,
    humanControl: 'ai_active' as const,
    customerControlMode: 'auto' as const,
    attachmentStatus: 'none' as const,
    pendingAction: 'none' as const,
    subject: null,
    handoffReason: null,
    lastHumanActivityAt: null,
    humanActiveUntil: null,
    updatedAt: new Date().toISOString(),
  }
  const examples = [
    ['Como está o óculos do Odair?', 'order_status'],
    ['O óculos do Odair está pronto?', 'order_status'],
    ['Queria saber se posso buscar o óculos do Odair', 'order_status'],
    ['Qual é o valor do exame de vista?', 'vision_exam'],
  ] as const

  let failed = false
  for (const [text, expected] of examples) {
    const result = await classifyWhatsAppRedesignConversation({
      storeId: 1,
      memory: { summary, messages: [{
        id: 'previous-exam', providerMessageId: null, role: 'customer', kind: 'text',
        text: 'Qual o preço do exame de vista?', occurredAt: new Date(Date.now() - 60_000).toISOString(),
      }] },
      turnMessages: [{
        id: 'synthetic-test', providerMessageId: null, role: 'customer', kind: 'text',
        text, occurredAt: new Date().toISOString(),
      }],
      elapsedSincePreviousMessageMs: null,
    })
    const actual = result.success ? result.data.intent : 'classification_failed'
    const passed = result.success && actual === expected && result.data.confidence >= 0.78
    console.log(`${passed ? 'OK' : 'FAIL'}: ${text} -> ${actual} (esperado: ${expected})`)
    if (!passed) failed = true
  }

  const orders = [
    { orderNumber: '1043', patientName: null, status: 'lens_arrived_assembling', statusText: 'Oi, CLIENTE DE TESTE! A lente já chegou e seu óculos entrou na fila de montagem.' },
    { orderNumber: '1041', patientName: null, status: 'lens_in_production', statusText: 'Oi, CLIENTE DE TESTE! Seu pedido está em produção no laboratório no momento.' },
  ]
  const statusTurn = await runStoreOneOrderStatusTurn({
    plan: { tool: 'lookup_open_orders', source: 'canonical_decision' },
    assistant: {
      messageText: 'Como está o óculos do Odair?',
      referencedPersonName: 'Odair',
      strictOrderFacts: true,
      storeName: 'Ótica de teste',
    },
    executeLookup: async (call) => ({
      tool: call.name,
      ok: true,
      data: { customerName: 'Cliente de teste', multipleOpenOrders: true, tooManyOpenOrders: false, orders },
    }),
    writeReply: (assistant, results, options) => writeWhatsAppToolAgentReply(
      assistant, results, { ...options, model: 'gpt-4.1-mini' }
    ),
  })
  const replyValid = statusTurn.disposition.kind === 'send'
  console.log(`${replyValid ? 'OK' : 'FAIL'}: consulta e validacao da resposta com nome nao vinculado (${statusTurn.disposition.kind}${statusTurn.disposition.kind === 'suppress' ? `: ${statusTurn.disposition.reason}` : ''})`)
  if (!replyValid) failed = true

  if (failed) process.exitCode = 1
}

main().catch(() => {
  console.error('Falha ao executar a avaliação de intenção.')
  process.exitCode = 1
})
