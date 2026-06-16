export type WhatsAppOsStatusCode =
  | 'ready_for_pickup'
  | 'lens_arrived_needs_frame'
  | 'lens_arrived_assembling'
  | 'lens_in_production'

export type WhatsAppTemplateContext = {
  firstName: string
  patient: string
}

export const DEFAULT_WHATSAPP_OS_REPLY_TEMPLATES: Record<WhatsAppOsStatusCode, string> = {
  lens_in_production: 'Oi, {nome}! Seu pedido{paciente} esta em producao no laboratorio no momento.',
  lens_arrived_needs_frame: 'Oi, {nome}! Boa noticia: a lente{paciente} ja chegou. Quando puder, traga a armacao na loja para fazermos a montagem.',
  lens_arrived_assembling: 'Oi, {nome}! A lente{paciente} ja chegou e seu oculos entrou na fila de montagem.',
  ready_for_pickup: 'Oi, {nome}! Seu oculos{paciente} ficou pronto e ja pode ser retirado na loja.',
}

export type WhatsAppOpenOs = {
  id: number
  created_at: string
  dependente_name: string | null
  dt_pedido_em: string | null
  dt_lente_chegou: string | null
  dt_montado_em: string | null
  armacao_com_cliente: boolean
}

function buildTemplateContext(customerName: string, serviceOrder: WhatsAppOpenOs): WhatsAppTemplateContext {
  const firstName = customerName.trim().split(/\s+/)[0] || 'cliente'
  const patient = serviceOrder.dependente_name
    ? ` de ${serviceOrder.dependente_name.trim().split(/\s+/)[0]}`
    : ''

  return {
    firstName,
    patient,
  }
}

export function renderWhatsAppTemplate(template: string, context: WhatsAppTemplateContext) {
  return template
    .replace(/\{nome\}/gi, context.firstName)
    .replace(/\{paciente\}/gi, context.patient)
}

export function describeOpenOs(
  customerName: string,
  serviceOrder: WhatsAppOpenOs,
  templates?: Partial<Record<WhatsAppOsStatusCode, string>>
): { statusCode: WhatsAppOsStatusCode; replyText: string } {
  const context = buildTemplateContext(customerName, serviceOrder)

  const resolveText = (statusCode: WhatsAppOsStatusCode) =>
    renderWhatsAppTemplate(
      templates?.[statusCode]?.trim() || DEFAULT_WHATSAPP_OS_REPLY_TEMPLATES[statusCode],
      context
    )

  if (serviceOrder.dt_montado_em) {
    return {
      statusCode: 'ready_for_pickup',
      replyText: resolveText('ready_for_pickup'),
    }
  }

  if (serviceOrder.dt_lente_chegou && serviceOrder.armacao_com_cliente) {
    return {
      statusCode: 'lens_arrived_needs_frame',
      replyText: resolveText('lens_arrived_needs_frame'),
    }
  }

  if (serviceOrder.dt_lente_chegou) {
    return {
      statusCode: 'lens_arrived_assembling',
      replyText: resolveText('lens_arrived_assembling'),
    }
  }

  return {
    statusCode: 'lens_in_production',
    replyText: resolveText('lens_in_production'),
  }
}
