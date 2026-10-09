import assert from 'node:assert/strict'
import test from 'node:test'
import { isWhatsAppInboundReaction } from '../src/lib/whatsapp/inbound-payload'

const reaction = { reactionMessage: { text: '\u{1F44D}', key: { id: 'previous-reply' } } }

test('app reconhece adicao, troca e remocao de reacao em envelopes da Evolution', () => {
  for (const text of ['\u{1F44D}', '\u{2764}', '']) {
    const message = { reactionMessage: { text, key: { id: 'previous-reply' } } }
    for (const payload of [message, { message }, { data: { message } }, {
      data: { message: { ephemeralMessage: { message: { viewOnceMessage: { message } } } } },
    }]) assert.equal(isWhatsAppInboundReaction(payload), true)
  }
})

test('emoji como mensagem e reacao citada no contexto continuam mensagens comuns', () => {
  for (const message of [
    { conversation: '\u{1F44D}' },
    { extendedTextMessage: { text: '\u{1F44D}' } },
    { extendedTextMessage: { text: 'Preciso de ajuda', contextInfo: { quotedMessage: reaction } } },
  ]) assert.equal(isWhatsAppInboundReaction({ data: { message } }), false)
  assert.equal(isWhatsAppInboundReaction(null), false)
})
