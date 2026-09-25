import {
  WhatsAppSystemDecisionDraftSchema,
  type WhatsAppRedesignClassification,
  type WhatsAppSystemDecisionDraft,
} from './contracts'

export type WhatsAppRedesignReplyLanguage = 'pt-BR' | 'es' | 'en'

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

const MARKERS: Record<WhatsAppRedesignReplyLanguage, readonly string[]> = {
  'pt-BR': [
    'amanha', 'hoje', 'loja', 'aberta', 'aberto', 'abrem', 'onde', 'quero', 'preciso',
    'obrigado', 'obrigada', 'ola', 'oi', 'voces', 'tem', 'qual', 'horario', 'endereco',
    'atendente', 'posso', 'pix', 'me passa', 'me envia',
  ],
  es: [
    'manana', 'hoy', 'tienda', 'abierta', 'abierto', 'abren', 'donde', 'quiero', 'necesito',
    'gracias', 'hola', 'tienen', 'cual', 'horario', 'direccion', 'atencion', 'puedo',
    'envia', 'pasa', 'clave pix', 'llave pix',
  ],
  en: [
    'tomorrow', 'today', 'store', 'shop', 'open', 'closed', 'where', 'want', 'need', 'thanks',
    'thank you', 'hello', 'hi', 'do you have', 'which', 'hours', 'address', 'attendant',
    'staff', 'pix key',
  ],
}

function scores(value: string) {
  const text = ` ${normalize(value).replace(/[^a-z0-9]+/g, ' ')} `
  return Object.fromEntries(Object.entries(MARKERS).map(([language, markers]) => [
    language,
    markers.reduce((score, marker) => {
      const normalizedMarker = normalize(marker)
      return score + (text.includes(` ${normalizedMarker} `) ? 1 : 0)
    }, 0),
  ])) as Record<WhatsAppRedesignReplyLanguage, number>
}

function highestScore(result: Record<WhatsAppRedesignReplyLanguage, number>) {
  const ranked = Object.entries(result).sort((left, right) => right[1] - left[1])
  return ranked[0][1] > 0 && ranked[0][1] > ranked[1][1]
    ? ranked[0][0] as WhatsAppRedesignReplyLanguage
    : null
}

export function detectWhatsAppRedesignReplyLanguage(
  currentTexts: string[],
  recentCustomerTexts: string[] = []
): WhatsAppRedesignReplyLanguage {
  const current = highestScore(scores(currentTexts.join(' ')))
  if (current) return current
  return highestScore(scores(recentCustomerTexts.slice(-3).join(' '))) ?? 'pt-BR'
}

export function localizeNextOpenSchedule(
  schedule: string,
  language: WhatsAppRedesignReplyLanguage
) {
  if (language === 'pt-BR') return schedule
  const normalized = normalize(schedule)
  const time = schedule.match(/\b\d{1,2}:\d{2}\b/)?.[0]
  if (!time) {
    if (/fechado excepcionalmente/.test(normalized)) {
      return language === 'es' ? 'cerrado excepcionalmente' : 'closed exceptionally'
    }
    if (/fechado/.test(normalized)) return language === 'es' ? 'cerrado' : 'closed'
    return schedule
  }

  const day = /amanha/.test(normalized) ? (language === 'es' ? 'mañana' : 'tomorrow')
    : /hoje/.test(normalized) ? (language === 'es' ? 'hoy' : 'today')
      : /domingo/.test(normalized) ? (language === 'es' ? 'domingo' : 'Sunday')
        : /segunda-feira/.test(normalized) ? (language === 'es' ? 'lunes' : 'Monday')
          : /terca-feira/.test(normalized) ? (language === 'es' ? 'martes' : 'Tuesday')
            : /quarta-feira/.test(normalized) ? (language === 'es' ? 'miércoles' : 'Wednesday')
              : /quinta-feira/.test(normalized) ? (language === 'es' ? 'jueves' : 'Thursday')
                : /sexta-feira/.test(normalized) ? (language === 'es' ? 'viernes' : 'Friday')
                  : /sabado/.test(normalized) ? (language === 'es' ? 'sábado' : 'Saturday')
                    : null
  const [firstTime, secondTime] = [...schedule.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((match) => match[0])
  if (secondTime) {
    return `${day ? `${day}: ` : ''}${firstTime} ${language === 'es' ? 'a' : 'to'} ${secondTime}`
  }
  return `${day ? `${day} ` : ''}${language === 'es' ? 'a las' : 'at'} ${time}`
}

export function localizeStoreHoursRange(
  schedule: string,
  language: WhatsAppRedesignReplyLanguage
) {
  const normalized = normalize(schedule)
  if (/fechado excepcionalmente/.test(normalized)) {
    return language === 'es' ? 'cerrado excepcionalmente' : 'closed exceptionally'
  }
  if (/^fechado$/.test(normalized)) return language === 'es' ? 'cerrado' : 'closed'
  const times = [...schedule.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((match) => match[0])
  if (times.length >= 2) return `${times[0]} ${language === 'es' ? 'a' : 'to'} ${times[1]}`
  return schedule
}

function localizedHandoff(
  intent: WhatsAppRedesignClassification['intent'],
  language: WhatsAppRedesignReplyLanguage
) {
  const messages: Record<WhatsAppRedesignReplyLanguage, Partial<Record<WhatsAppRedesignClassification['intent'], string>>> = {
    'pt-BR': {
      vision_exam: 'Sou a IAra, uma assistente virtual. Para te dar a informação correta sobre exame de vista ou avaliação de grau, vou chamar um atendente.',
      product_availability: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para verificar essa peça ou lente para você.',
      order_status: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para consultar corretamente o status dos seus óculos.',
      installment_status: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para consultar essa informação financeira com segurança.',
      complaint_or_adaptation: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para entender melhor o que você precisa.',
      exchange_or_warranty: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para verificar sua troca ou garantia.',
      budget_request: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para preparar essa informação para você.',
      human_agent_request: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para continuar com você.',
    },
    es: {
      vision_exam: 'Soy IAra, una asistente virtual. Para darte información correcta sobre el examen visual, avisaré a un asesor.',
      product_availability: 'Soy IAra, una asistente virtual. Pediré a un asesor que confirme la disponibilidad de esa pieza o lente.',
      order_status: 'Soy IAra, una asistente virtual. Pediré a un asesor que consulte el estado de tus gafas.',
      installment_status: 'Soy IAra, una asistente virtual. Pediré a un asesor que consulte esta información de pago de forma segura.',
      complaint_or_adaptation: 'Soy IAra, una asistente virtual. Pediré a un asesor que te ayude con lo ocurrido.',
      exchange_or_warranty: 'Soy IAra, una asistente virtual. Pediré a un asesor que revise el cambio o la garantía.',
      budget_request: 'Soy IAra, una asistente virtual. Pediré a un asesor que prepare esta información para ti.',
      human_agent_request: 'Soy IAra, una asistente virtual. Avisaré a un asesor para que continúe contigo.',
    },
    en: {
      vision_exam: 'I’m IAra, a virtual assistant. I’ll ask a team member to help with your eye exam question.',
      product_availability: 'I’m IAra, a virtual assistant. I’ll ask a team member to confirm whether that frame or lens is available.',
      order_status: 'I’m IAra, a virtual assistant. I’ll ask a team member to check the status of your glasses.',
      installment_status: 'I’m IAra, a virtual assistant. I’ll ask a team member to check this payment information securely.',
      complaint_or_adaptation: 'I’m IAra, a virtual assistant. I’ll ask a team member to help with what happened.',
      exchange_or_warranty: 'I’m IAra, a virtual assistant. I’ll ask a team member to review the exchange or warranty.',
      budget_request: 'I’m IAra, a virtual assistant. I’ll ask a team member to prepare this information for you.',
      human_agent_request: 'I’m IAra, a virtual assistant. I’ll ask a team member to continue helping you.',
    },
  }
  return messages[language][intent]
    ?? (language === 'es' ? 'Soy IAra, una asistente virtual. Para no darte información incorrecta, pediré a un asesor que continúe contigo.'
      : language === 'en' ? 'I’m IAra, a virtual assistant. To avoid giving you incorrect information, I’ll ask a team member to continue helping you.'
        : 'Sou a IAra, uma assistente virtual. Para não te passar uma informação errada, vou chamar um atendente para continuar com você.')
}

export function localizeWhatsAppRedesignDecision(
  decision: WhatsAppSystemDecisionDraft,
  classification: WhatsAppRedesignClassification,
  language: WhatsAppRedesignReplyLanguage
): WhatsAppSystemDecisionDraft {
  if (language === 'pt-BR' || decision.action === 'no_reply' || !decision.canonicalReply) {
    return WhatsAppSystemDecisionDraftSchema.parse({
      ...decision,
      facts: { ...decision.facts, replyLanguage: language },
    })
  }

  let reply = decision.canonicalReply
  if (decision.action === 'answer_store_hours') {
    const requestedTomorrow = decision.facts.requestedDay === 'tomorrow'
    const schedule = requestedTomorrow
      ? String(decision.facts.tomorrowSchedule ?? '')
      : String(decision.facts.todaySchedule ?? '')
    const range = localizeStoreHoursRange(schedule, language)
    const isClosed = /^fechado(?: excepcionalmente)?$/i.test(schedule)
    if (requestedTomorrow) {
      reply = isClosed
        ? language === 'es' ? 'Mañana la tienda estará cerrada.' : 'The store will be closed tomorrow.'
        : language === 'es' ? `Sí, mañana abrimos de ${range}.` : `Yes, we’ll be open tomorrow from ${range}.`
    } else {
      const isOpen = decision.facts.isStoreOpenNow === true
      const nextOpen = localizeNextOpenSchedule(String(decision.facts.nextOpenSchedule ?? ''), language)
      reply = language === 'es'
        ? isOpen ? `Sí, estamos abiertos ahora. El horario de hoy es ${range}.` : `Ahora estamos cerrados. La próxima apertura será ${nextOpen}.`
        : isOpen ? `Yes, we’re open now. Today’s hours are ${range}.` : `We’re currently closed. The next opening is ${nextOpen}.`
    }
  } else if (decision.action === 'answer_store_location') {
    reply = reply.replace(/^Nossa loja fica em /, language === 'es' ? 'Nuestra tienda está en ' : 'Our store is located at ')
      .replace(/\. Mapa:/, language === 'en' ? '. Map:' : '. Mapa:')
  } else if (decision.action === 'answer_official_pix') {
    reply = language === 'es' ? 'Enviar la clave Pix oficial registrada para la tienda.'
      : 'Send the store’s official registered Pix key.'
  } else if (decision.action === 'conservative_fallback') {
    reply = language === 'es' ? '¡Hola! ¿En qué puedo ayudarte?'
      : 'Hello! How can I help you?'
  } else if (decision.action === 'human_handoff' || decision.action === 'repeat_handoff'
    || decision.action === 'acknowledge_attachment' || decision.action === 'recognize_continuation') {
    reply = decision.action === 'repeat_handoff'
      ? language === 'es' ? 'Soy IAra, una asistente virtual. Entiendo que retomas este asunto. Volveré a avisar a un asesor para que te atienda.'
        : 'I’m IAra, a virtual assistant. I understand you’re following up. I’ll notify a team member again so they can continue helping you.'
      : classification.mentionsAttachment || decision.action === 'acknowledge_attachment'
        ? language === 'es' ? 'Recibí el archivo. Soy IAra, una asistente virtual, y pediré a un asesor que lo revise contigo.'
          : 'I received the file. I’m IAra, a virtual assistant, and I’ll ask a team member to review it with you.'
        : localizedHandoff(classification.requestsHuman ? 'human_agent_request' : classification.intent, language)
  }

  return WhatsAppSystemDecisionDraftSchema.parse({
    ...decision,
    canonicalReply: reply,
    facts: { ...decision.facts, replyLanguage: language },
  })
}

export function localizedPixReply(input: {
  key: string
  holder: string | null
  language: WhatsAppRedesignReplyLanguage
}) {
  const holder = input.holder?.trim()
  if (input.language === 'es') {
    return `Nuestra clave Pix es ${input.key}.${holder ? ` Titular: ${holder}.` : ''} Verifica el titular antes de pagar.`
  }
  if (input.language === 'en') {
    return `Our Pix key is ${input.key}.${holder ? ` Account holder: ${holder}.` : ''} Verify the account holder before paying.`
  }
  return `Nossa chave Pix é ${input.key}.${holder ? ` Favorecido: ${holder}.` : ''} Confira o favorecido antes de pagar.`
}
