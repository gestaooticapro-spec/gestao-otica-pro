import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectWhatsAppRedesignReplyLanguage,
  localizedPixReply,
  localizeWhatsAppRedesignDecision,
} from '../src/lib/whatsapp/redesign/reply-language'
import { isExplicitOfficialPixRequest } from '../src/lib/whatsapp/redesign/system-decision'
import { applyStoreAvailabilityToDecision } from '../src/lib/whatsapp/redesign/store-availability-policy'
import {
  WhatsAppRedesignClassificationSchema,
  WhatsAppSystemDecisionDraftSchema,
} from '../src/lib/whatsapp/redesign/contracts'

const classification = WhatsAppRedesignClassificationSchema.parse({
  intent: 'store_hours', confidence: 0.99, topicRelation: 'change_topic',
  requestsHuman: false, mentionsAttachment: false,
  entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
})

test('detecta idioma da mensagem atual e usa contexto recente somente quando necessário', () => {
  assert.equal(detectWhatsAppRedesignReplyLanguage(['¿La tienda estará abierta mañana?']), 'es')
  assert.equal(detectWhatsAppRedesignReplyLanguage(['Will the store be open tomorrow?']), 'en')
  assert.equal(detectWhatsAppRedesignReplyLanguage(['A loja abre amanhã?']), 'pt-BR')
  assert.equal(detectWhatsAppRedesignReplyLanguage(
    ['Buenos días, ¿cómo están?'], ['Will the store be open today?', 'Where is the store?']
  ), 'es')
  assert.equal(detectWhatsAppRedesignReplyLanguage(['Good morning, how are you?']), 'en')
  assert.equal(detectWhatsAppRedesignReplyLanguage(['Bom dia, tudo bem?']), 'pt-BR')
  assert.equal(detectWhatsAppRedesignReplyLanguage(['???'], ['Hola, ¿cuál es la dirección?']), 'es')
  assert.equal(detectWhatsAppRedesignReplyLanguage(['Oi, ¿la tienda está abierta?']), 'es')
})

test('localiza a resposta de horário sem alterar os fatos da loja', () => {
  const decision = WhatsAppSystemDecisionDraftSchema.parse({
    action: 'answer_store_hours', fallbackReply: 'Horário de hoje: 08:30 às 18:00.',
    facts: { requestedDay: 'tomorrow', tomorrowSchedule: '08:30 às 12:30' },
    humanHandoffTiming: null,
    humanization: {
      mustNotAddFacts: true, mustKeepShort: true, mustIdentifyIara: false,
      mustMentionHumanHandoff: false, forbiddenClaims: [],
    },
  })
  const localized = localizeWhatsAppRedesignDecision(decision, classification, 'es')
  assert.equal(localized.fallbackReply, 'Sí, mañana abrimos de 08:30 a 12:30.')
  assert.equal(localized.facts.tomorrowSchedule, '08:30 às 12:30')
  assert.equal(localized.facts.replyLanguage, 'es')
})

test('aviso de handoff fora do expediente acompanha o idioma e o próximo horário', () => {
  const decision = WhatsAppSystemDecisionDraftSchema.parse({
    action: 'human_handoff', fallbackReply: 'Soy IAra, una asistente virtual. Avisaré a un asesor.',
    facts: { replyLanguage: 'es' },
    humanHandoffTiming: null,
    humanization: {
      mustNotAddFacts: true, mustKeepShort: true, mustIdentifyIara: true,
      mustMentionHumanHandoff: true, forbiddenClaims: [],
    },
  })
  const result = applyStoreAvailabilityToDecision(decision, {
    is_open_now: false, is_exceptional_closure: false,
    today_schedule: 'Fechado', next_open_schedule: 'Amanhã às 08:30',
    full_weekly_schedule: '',
  })
  assert.match(result.fallbackReply ?? '', /La tienda está cerrada ahora/)
  assert.match(result.fallbackReply ?? '', /mañana a las 08:30/)
  assert.equal(result.humanHandoffTiming?.mode, 'when_store_opens')
})

test('pedido explícito e resposta da chave Pix respeitam espanhol e inglês', () => {
  assert.equal(isExplicitOfficialPixRequest('¿Cuál es la clave Pix de la tienda?'), true)
  assert.equal(isExplicitOfficialPixRequest('What is the Pix key?'), true)
  assert.equal(localizedPixReply({ key: 'test-key', holder: 'Test Shop', language: 'es' }),
    'Nuestra clave Pix es test-key. Titular: Test Shop. Verifica el titular antes de pagar.')
  assert.equal(localizedPixReply({ key: 'test-key', holder: null, language: 'en' }),
    'Our Pix key is test-key. Verify the account holder before paying.')
})
