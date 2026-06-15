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
      replyText: `Ola, ${firstName}! Oculos${patient} pronto. Pode vir retirar.`,
    }
  }

  if (serviceOrder.dt_lente_chegou && serviceOrder.armacao_com_cliente) {
    return {
      statusCode: 'lens_arrived_needs_frame',
      replyText: `Ola, ${firstName}! Lente${patient} chegou, aguardando armacao.`,
    }
  }

  if (serviceOrder.dt_lente_chegou) {
    return {
      statusCode: 'lens_arrived_assembling',
      replyText: `Ola, ${firstName}! Lente${patient} chegou, na fila da montagem.`,
    }
  }

  return {
    statusCode: 'lens_in_production',
    replyText: `Ola, ${firstName}! Lente${patient} em producao.`,
  }
}
