export type WhatsAppOsStatusCode =
  | 'ready_for_pickup'
  | 'lens_arrived_needs_frame'
  | 'lens_arrived_assembling'
  | 'lens_in_production'

export type WhatsAppOpenOs = {
  id: number
  created_at: string
  dependente_name: string | null
  dt_pedido_em: string | null
  dt_lente_chegou: string | null
  dt_montado_em: string | null
  armacao_com_cliente: boolean
}

export function describeOpenOs(
  customerName: string,
  serviceOrder: WhatsAppOpenOs
): { statusCode: WhatsAppOsStatusCode; replyText: string } {
  const firstName = customerName.trim().split(/\s+/)[0] || 'cliente'
  const patient = serviceOrder.dependente_name
    ? ` de ${serviceOrder.dependente_name.trim().split(/\s+/)[0]}`
    : ''

  if (serviceOrder.dt_montado_em) {
    return {
      statusCode: 'ready_for_pickup',
      replyText: `Oi, ${firstName}! Seu oculos${patient} ficou pronto e ja pode ser retirado na loja.`,
    }
  }

  if (serviceOrder.dt_lente_chegou && serviceOrder.armacao_com_cliente) {
    return {
      statusCode: 'lens_arrived_needs_frame',
      replyText: `Oi, ${firstName}! Boa noticia: a lente${patient} ja chegou. Quando puder, traga a armacao na loja para fazermos a montagem.`,
    }
  }

  if (serviceOrder.dt_lente_chegou) {
    return {
      statusCode: 'lens_arrived_assembling',
      replyText: `Oi, ${firstName}! A lente${patient} ja chegou e seu oculos entrou na fila de montagem. Assim que ficar pronto, avisamos voce.`,
    }
  }

  return {
    statusCode: 'lens_in_production',
    replyText: `Oi, ${firstName}! Seu pedido${patient} esta em producao no laboratorio. Assim que houver novidade, avisamos voce.`,
  }
}
