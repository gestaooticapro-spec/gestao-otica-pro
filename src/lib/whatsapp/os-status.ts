export type WhatsAppOsStatusCode =
  | 'ready_for_pickup'
  | 'lens_arrived_needs_frame'
  | 'lens_arrived_assembling'
  | 'at_lab'
  | 'preparing'

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
      replyText: `Olá, ${firstName}! O óculos${patient} está pronto e aguardando retirada na loja.`,
    }
  }

  if (serviceOrder.dt_lente_chegou && serviceOrder.armacao_com_cliente) {
    return {
      statusCode: 'lens_arrived_needs_frame',
      replyText: `Olá, ${firstName}! A lente${patient} chegou. Você já pode levar a armação à loja para fazermos a montagem.`,
    }
  }

  if (serviceOrder.dt_lente_chegou) {
    return {
      statusCode: 'lens_arrived_assembling',
      replyText: `Olá, ${firstName}! A lente${patient} chegou e o óculos está em montagem.`,
    }
  }

  if (serviceOrder.dt_pedido_em) {
    return {
      statusCode: 'at_lab',
      replyText: `Olá, ${firstName}! O pedido${patient} está no laboratório. Avisaremos quando avançar para a próxima etapa.`,
    }
  }

  return {
    statusCode: 'preparing',
    replyText: `Olá, ${firstName}! A ordem de serviço${patient} está aberta e em preparação.`,
  }
}
