import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const source = await readFile(new URL('../services/whatsapp-automation/server.mjs', import.meta.url), 'utf8')
function declaration(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1)
  const next = source.indexOf('\nfunction ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}
const api = runInNewContext([
  ...['unwrapMessage', 'isReactionMessage', 'extractText', 'extractInbound', 'extractStoreInitiatedMessage'].map(declaration),
  '({ isReactionMessage, extractText, extractInbound, extractStoreInitiatedMessage })',
].join('\n'), { extractStatusReference: () => null, messageTimestampIso: () => null,
  detectAttachmentKind: () => null })

function payload(message, fromMe = false) {
  return { data: { key: { id: 'event', remoteJid: '5544997149411@s.whatsapp.net', fromMe }, message } }
}

test('servico nao transforma reacoes ou remocao em inbound ou atividade humana', () => {
  for (const text of ['\u{1F44D}', '\u{2764}', '']) {
    const reaction = { reactionMessage: { text, key: { id: 'original' } } }
    for (const message of [reaction, { ephemeralMessage: { message: reaction } }]) {
      assert.equal(api.isReactionMessage(message), true)
      assert.equal(api.extractText(message), '')
      assert.equal(api.extractInbound(payload(message)), null)
      assert.equal(api.extractStoreInitiatedMessage(payload(message, true)), null)
    }
  }
})

test('emoji comum chega ao atendimento e referencia citada nao o transforma em reacao', () => {
  for (const message of [ { conversation: '\u{1F44D}' }, {
    extendedTextMessage: { text: 'Quero ajuda', contextInfo: {
      quotedMessage: { reactionMessage: { text: '\u{1F44D}' } },
    } },
  } ]) {
    assert.equal(api.isReactionMessage(message), false)
    assert.ok(api.extractInbound(payload(message)))
    assert.ok(api.extractStoreInitiatedMessage(payload(message, true)))
  }
})

test('recuperacao de eventos usa o mesmo filtro e webhook ignora antes de agrupar', () => {
  const recovery = source.slice(source.indexOf('async function reconcileChannel('), source.indexOf('async function runMessageReconciliation('))
  assert.match(recovery, /const inbound = extractInbound\(payload\)/)
  const webhook = source.slice(source.indexOf('async function handleMessage('), source.indexOf('function evolutionMessageRecords('))
  assert.ok(webhook.indexOf('isReactionMessage(') < webhook.indexOf('extractStoreInitiatedMessage('))
  assert.ok(webhook.indexOf('isReactionMessage(') < webhook.indexOf('enqueueBufferedInbound('))
})
