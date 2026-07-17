import assert from 'node:assert/strict'

import {
  extractWhatsAppInboundPayloadMeta,
  isWhatsAppInboundPayloadFromMe,
  stripWhatsAppInboundMediaContent,
} from '@/lib/whatsapp/inbound-payload'

const cases = [
  {
    name: 'image with webhook base64',
    payload: {
      event: 'messages.upsert',
      data: {
        message: {
          imageMessage: {
            mimetype: 'image/jpeg',
            base64: 'aGVsbG8=',
          },
        },
      },
    },
    expected: {
      text: null,
      hasAttachment: true,
      attachmentKind: 'image',
      mimeType: 'image/jpeg',
      base64: 'aGVsbG8=',
    },
  },
  {
    name: 'conversation text',
    payload: {
      event: 'messages.upsert',
      data: {
        message: {
          conversation: 'Meu oculos chegou?',
        },
      },
    },
    expected: {
      text: 'Meu oculos chegou?',
      hasAttachment: false,
      attachmentKind: null,
    },
  },
  {
    name: 'document with caption',
    payload: {
      event: 'messages.upsert',
      data: {
        message: {
          documentMessage: {
            mimetype: 'application/pdf',
            fileName: 'receita.pdf',
            caption: 'Segue minha receita',
          },
        },
      },
    },
    expected: {
      text: 'Segue minha receita',
      hasAttachment: true,
      attachmentKind: 'document',
      mimeType: 'application/pdf',
      fileName: 'receita.pdf',
    },
  },
  {
    name: 'image in ephemeral wrapper',
    payload: {
      event: 'messages.upsert',
      data: {
        message: {
          ephemeralMessage: {
            message: {
              imageMessage: {
                mimetype: 'image/jpeg',
                caption: 'Essa armacao serve?',
              },
            },
          },
        },
      },
    },
    expected: {
      text: 'Essa armacao serve?',
      hasAttachment: true,
      attachmentKind: 'image',
      mimeType: 'image/jpeg',
    },
  },
  {
    name: 'extended text inside view once wrapper',
    payload: {
      event: 'messages.upsert',
      data: {
        message: {
          viewOnceMessageV2: {
            message: {
              extendedTextMessage: {
                text: 'Que horas fecha hoje?',
              },
            },
          },
        },
      },
    },
    expected: {
      text: 'Que horas fecha hoje?',
      hasAttachment: false,
      attachmentKind: null,
    },
  },
]

for (const testCase of cases) {
  const result = extractWhatsAppInboundPayloadMeta(testCase.payload as never)
  assert.equal(result.text, testCase.expected.text, `${testCase.name}: text`)
  assert.equal(result.hasAttachment, testCase.expected.hasAttachment, `${testCase.name}: hasAttachment`)
  assert.equal(result.attachmentKind, testCase.expected.attachmentKind, `${testCase.name}: attachmentKind`)

  if ('mimeType' in testCase.expected) {
    assert.equal(result.mimeType, testCase.expected.mimeType, `${testCase.name}: mimeType`)
  }

  if ('fileName' in testCase.expected) {
    assert.equal(result.fileName, testCase.expected.fileName, `${testCase.name}: fileName`)
  }

  if ('base64' in testCase.expected) {
    assert.equal(result.base64, testCase.expected.base64, `${testCase.name}: base64`)
  }
}

const payloadWithMedia = {
  data: {
    message: {
      imageMessage: {
        mimetype: 'image/jpeg',
        caption: 'Comprovante',
        base64: 'aGVsbG8=',
      },
    },
  },
}
const payloadWithoutMedia = stripWhatsAppInboundMediaContent(payloadWithMedia as never) as {
  data: { message: { imageMessage: { mimetype: string; caption: string; base64?: string } } }
}
assert.equal(payloadWithoutMedia.data.message.imageMessage.base64, undefined, 'strips base64 before persistence')
assert.equal(payloadWithoutMedia.data.message.imageMessage.caption, 'Comprovante', 'preserves attachment metadata')

assert.equal(isWhatsAppInboundPayloadFromMe({
  event: 'messages.upsert',
  data: {
    key: {
      fromMe: true,
    },
    message: {
      conversation: 'Oi, vou verificar para voce.',
    },
  },
} as never), true, 'detects store outbound payload')

assert.equal(isWhatsAppInboundPayloadFromMe({
  event: 'messages.upsert',
  data: {
    key: {
      fromMe: false,
    },
    message: {
      conversation: 'Meu oculos chegou?',
    },
  },
} as never), false, 'does not mark customer inbound as fromMe')

console.log('WhatsApp inbound payload parser checks passed.')
