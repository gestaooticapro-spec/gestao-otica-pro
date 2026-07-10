import { createServer } from 'node:http'

const config = {
  port: Number(process.env.PORT || 8080),
  appBaseUrl: requiredEnv('APP_BASE_URL').replace(/\/$/, ''),
  internalSecret: requiredEnv('WHATSAPP_INTERNAL_SECRET'),
  evolutionBaseUrl: requiredEnv('EVOLUTION_API_URL').replace(/\/$/, ''),
  evolutionApiKey: requiredEnv('EVOLUTION_API_KEY'),
  webhookSecret: requiredEnv('EVOLUTION_WEBHOOK_SECRET'),
}

const INBOUND_AGGREGATION_WINDOW_MS = Number(process.env.WHATSAPP_INBOUND_AGGREGATION_WINDOW_MS || 10000)
const MAX_ADMIN_BODY_BYTES = 15 * 1024 * 1024
const MAX_MEDIA_BYTES = 10 * 1024 * 1024
const inboundBuffers = new Map()

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function jsonResponse(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

async function readJson(request) {
  const chunks = []
  let totalBytes = 0
  for await (const chunk of request) {
    totalBytes += chunk.length
    if (totalBytes > MAX_ADMIN_BODY_BYTES) {
      const error = new Error('Request body too large')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function isAuthorizedWebhook(request, url) {
  const authorization = request.headers.authorization || ''
  const headerSecret = request.headers['x-webhook-secret'] || ''
  const querySecret = url.searchParams.get('token') || ''

  return authorization === `Bearer ${config.webhookSecret}`
    || headerSecret === config.webhookSecret
    || querySecret === config.webhookSecret
}

function isAuthorizedAdmin(request) {
  const authorization = request.headers.authorization || ''
  return authorization === `Bearer ${config.internalSecret}`
}

function eventName(payload) {
  return String(payload.event || payload.type || '').trim().toLowerCase()
}

function extractText(message = {}) {
  const unwrappedMessage = unwrapMessage(message)

  return message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || message.documentMessage?.caption
    || unwrappedMessage.conversation
    || unwrappedMessage.extendedTextMessage?.text
    || unwrappedMessage.imageMessage?.caption
    || unwrappedMessage.videoMessage?.caption
    || unwrappedMessage.documentMessage?.caption
    || ''
}

function unwrapMessage(message = {}) {
  return message.ephemeralMessage?.message
    || message.viewOnceMessage?.message
    || message.viewOnceMessageV2?.message
    || message.viewOnceMessageV2Extension?.message
    || message.documentWithCaptionMessage?.message
    || message.editedMessage?.message
    || {}
}

function detectAttachmentKind(message = {}) {
  const unwrappedMessage = unwrapMessage(message)
  if (message.imageMessage || unwrappedMessage.imageMessage) return 'image'
  if (message.documentMessage || unwrappedMessage.documentMessage) return 'document'
  if (message.audioMessage || unwrappedMessage.audioMessage) return 'audio'
  if (message.videoMessage || unwrappedMessage.videoMessage) return 'video'
  if (message.stickerMessage || unwrappedMessage.stickerMessage) return 'sticker'
  return null
}

function extractInbound(payload) {
  const data = payload.data || {}
  const key = data.key || {}
  const remoteJid = key.remoteJid || data.remoteJid || ''
  const message = data.message || {}
  const providerMessageId = key.id || data.id || payload.messageId || ''
  const fromMe = Boolean(key.fromMe ?? data.fromMe)

  if (fromMe || !providerMessageId || !remoteJid) return null
  if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return null

  const phone = remoteJid.split('@')[0].replace(/\D/g, '')
  if (!phone) return null

  return {
    phone,
    providerMessageId,
    messageText: extractText(message),
    attachmentKind: detectAttachmentKind(message),
  }
}

function extractStoreInitiatedMessage(payload) {
  const data = payload.data || {}
  const key = data.key || {}
  const remoteJid = key.remoteJid || data.remoteJid || ''
  const message = data.message || {}
  const providerMessageId = key.id || data.id || payload.messageId || ''
  const fromMe = Boolean(key.fromMe ?? data.fromMe)

  if (!fromMe || !providerMessageId || !remoteJid) return null
  if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return null

  const phone = remoteJid.split('@')[0].replace(/\D/g, '')
  if (!phone) return null

  return {
    phone,
    providerMessageId,
    messageText: extractText(message),
  }
}

function previewText(text, maxLength = 90) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized
}

function normalizeAggregationText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\u0000/g, '')
    .trim()
}

function inboundBufferKey(instanceKey, phone) {
  return `${instanceKey}::${phone}`
}

function clearBufferedInboundTimer(entry) {
  if (entry?.timer) {
    clearTimeout(entry.timer)
    entry.timer = null
  }
}

function buildAggregatedInboundPayload(messages) {
  return {
    source: 'whatsapp-automation-buffer',
    aggregated: true,
    aggregationWindowMs: INBOUND_AGGREGATION_WINDOW_MS,
    messageCount: messages.length,
    messages: messages.map((message) => ({
      providerMessageId: message.providerMessageId,
      messageText: message.messageText,
      attachmentKind: message.attachmentKind || null,
      receivedAt: message.receivedAt,
    })),
  }
}

function formatTokenUsage(usage) {
  if (!usage) return 'tokens=unknown'
  const input = Number.isFinite(usage.inputTokens) ? usage.inputTokens : '?'
  const output = Number.isFinite(usage.outputTokens) ? usage.outputTokens : '?'
  const total = Number.isFinite(usage.totalTokens) ? usage.totalTokens : '?'
  return `tokens(in=${input}, out=${output}, total=${total})`
}

function logAiDiagnostics(status) {
  const diagnostics = Array.isArray(status?.aiDiagnostics) ? status.aiDiagnostics : []
  for (const item of diagnostics) {
    const base = [
      `[ai] task=${item.task}`,
      `success=${Boolean(item.success)}`,
      `provider=${item.provider || 'unknown'}`,
      `model=${item.model || 'unknown'}`,
      `latency_ms=${Number.isFinite(item.latencyMs) ? item.latencyMs : 'unknown'}`,
      formatTokenUsage(item.tokenUsage),
    ]

    if (item.intent) base.push(`intent=${item.intent}`)
    if (Number.isFinite(item.confidence)) base.push(`confidence=${item.confidence}`)
    if (item.error) base.push(`error=${previewText(item.error, 140)}`)

    console.log(base.join(' '))
  }
}

function mapConnectionStatus(payload) {
  const raw = String(
    payload.data?.state
    || payload.data?.status
    || payload.state
    || payload.status
    || ''
  ).toLowerCase()

  if (['open', 'connected', 'online'].includes(raw)) return 'connected'
  if (['connecting', 'qr'].includes(raw)) return 'connecting'
  if (['close', 'closed', 'disconnected', 'offline'].includes(raw)) return 'disconnected'
  return 'unknown'
}

async function appRequest(path, payload) {
  const response = await fetch(`${config.appBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.internalSecret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`App request failed (${response.status}): ${JSON.stringify(result)}`)
  }
  return result
}

async function sendEvolutionText(instanceKey, phone, text) {
  const response = await fetch(
    `${config.evolutionBaseUrl}/message/sendText/${encodeURIComponent(instanceKey)}`,
    {
      method: 'POST',
      headers: {
        apikey: config.evolutionApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ number: phone, text }),
      signal: AbortSignal.timeout(20000),
    }
  )

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Evolution send failed (${response.status}): ${JSON.stringify(result)}`)
  }
  return result
}

async function sendEvolutionMedia(instanceKey, phone, media) {
  const response = await fetch(
    `${config.evolutionBaseUrl}/message/sendMedia/${encodeURIComponent(instanceKey)}`,
    {
      method: 'POST',
      headers: {
        apikey: config.evolutionApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        number: phone,
        mediatype: media.type,
        mimetype: media.mimeType,
        fileName: media.fileName,
        caption: media.caption,
        media: media.base64,
      }),
      signal: AbortSignal.timeout(25000),
    }
  )

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Evolution media send failed (${response.status}): ${JSON.stringify(result)}`)
  }
  return result
}

function normalizeAdminMedia(value) {
  if (!value || typeof value !== 'object') return null

  const type = String(value.type || '').trim().toLowerCase()
  const mimeType = String(value.mimeType || '').trim().toLowerCase()
  const fileName = String(value.fileName || '').trim()
  const caption = String(value.caption || '').trim()
  const base64 = String(value.base64 || '').replace(/^data:[^;]+;base64,/, '').trim()

  const validType = type === 'document' || type === 'image'
  const validMime = type === 'document'
    ? mimeType === 'application/pdf'
    : /^image\/(jpeg|png|webp)$/.test(mimeType)
  const validFileName = /^[a-zA-Z0-9._-]{1,160}$/.test(fileName)
  const validBase64 = base64.length > 0 && base64.length % 4 === 0 && /^[a-zA-Z0-9+/]+={0,2}$/.test(base64)
  const decodedBytes = validBase64 ? Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0) : 0

  if (!validType || !validMime || !validFileName || !validBase64 || decodedBytes <= 0 || decodedBytes > MAX_MEDIA_BYTES || caption.length > 1024) {
    const error = new Error('Invalid media payload')
    error.status = 400
    throw error
  }

  return { type, mimeType, fileName, caption, base64 }
}

function isTimeoutError(error) {
  return error?.name === 'TimeoutError'
    || error?.name === 'AbortError'
    || String(error?.message || '').toLowerCase().includes('timeout')
}

async function evolutionRequest(path, options = {}) {
  const response = await fetch(`${config.evolutionBaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.evolutionApiKey,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(`Evolution request failed (${response.status}): ${JSON.stringify(result)}`)
    error.status = response.status
    error.payload = result
    throw error
  }
  return result
}

async function fetchEvolutionInstances() {
  return evolutionRequest('/instance/fetchInstances')
}

function instanceExists(instances, instanceKey) {
  return (Array.isArray(instances) ? instances : []).some((item) => {
    const name = item?.name || item?.instance?.instanceName || item?.instanceName
    return name === instanceKey
  })
}

function extractQrCodeBase64(payload) {
  return payload?.qrcode?.base64
    || payload?.qrcode?.base64Image
    || payload?.base64
    || null
}

function extractConnectionState(payload) {
  return String(
    payload?.instance?.state
    || payload?.state
    || payload?.status
    || ''
  ).toLowerCase() || 'unknown'
}

async function createEvolutionInstance(instanceKey) {
  return evolutionRequest('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName: instanceKey,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    }),
  })
}

async function connectEvolutionInstance(instanceKey) {
  return evolutionRequest(`/instance/connect/${encodeURIComponent(instanceKey)}`)
}

async function logoutEvolutionInstance(instanceKey) {
  return evolutionRequest(`/instance/logout/${encodeURIComponent(instanceKey)}`, {
    method: 'DELETE',
  })
}

async function getEvolutionConnectionState(instanceKey) {
  return evolutionRequest(`/instance/connectionState/${encodeURIComponent(instanceKey)}`)
}

async function configureEvolutionWebhook(instanceKey) {
  const webhookUrl = `http://whatsapp-automation:8080/webhooks/evolution/${encodeURIComponent(instanceKey)}?token=${encodeURIComponent(config.webhookSecret)}`

  return evolutionRequest(`/webhook/set/${encodeURIComponent(instanceKey)}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      },
    }),
  })
}

async function handleAdminMessageSend(payload) {
  const instanceKey = String(payload.instanceKey || '').trim()
  const phone = String(payload.phone || '').replace(/\D/g, '')
  const text = String(payload.text || '').trim()
  const media = normalizeAdminMedia(payload.media)
  const outboundMessageId = Number(payload.outboundMessageId)

  if (!/^[a-zA-Z0-9_-]{2,120}$/.test(instanceKey)) {
    const error = new Error('Invalid instance key')
    error.status = 400
    throw error
  }

  if (!phone || phone.length < 10 || phone.length > 15 || (!text && !media) || (text && media) || !Number.isInteger(outboundMessageId) || outboundMessageId <= 0) {
    const error = new Error('Invalid message payload')
    error.status = 400
    throw error
  }

  let result
  try {
    result = media
      ? await sendEvolutionMedia(instanceKey, phone, media)
      : await sendEvolutionText(instanceKey, phone, text)
  } catch (error) {
    if (!isTimeoutError(error)) {
      const failedSynced = await updateDelivery(outboundMessageId, 'failed', {
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      if (!failedSynced) console.error('[whatsapp-automation] Failed to persist rejected delivery.')
    } else {
      console.error('[whatsapp-automation] Evolution send timed out; leaving outbound pending for reconciliation.')
    }
    throw error
  }

  const providerMessageId = result.key?.id || result.messageId || result.id
  const deliverySynced = await updateDelivery(outboundMessageId, 'sent', {
    providerMessageId,
    payload: result,
  })
  if (!deliverySynced) console.error('[whatsapp-automation] Message sent, but delivery sync failed.')

  return { sent: true, providerMessageId, deliverySynced }
}

async function setupEvolutionInstance(instanceKey) {
  const instances = await fetchEvolutionInstances()
  let qrCodeBase64 = null

  if (!instanceExists(instances, instanceKey)) {
    const created = await createEvolutionInstance(instanceKey)
    qrCodeBase64 = extractQrCodeBase64(created)
  }

  await configureEvolutionWebhook(instanceKey)

  const statePayload = await getEvolutionConnectionState(instanceKey).catch(() => null)
  const state = extractConnectionState(statePayload)

  if (state !== 'open' && state !== 'connected') {
    const connected = await connectEvolutionInstance(instanceKey)
    qrCodeBase64 = extractQrCodeBase64(connected) || qrCodeBase64
    return {
      instanceKey,
      connectionStatus: 'connecting',
      qrCodeBase64,
    }
  }

  return {
    instanceKey,
    connectionStatus: 'connected',
    qrCodeBase64,
  }
}

async function updateDelivery(outboundMessageId, status, details = {}) {
  try {
    await appRequest('/api/whatsapp/delivery', {
      outboundMessageId,
      status,
      providerMessageId: details.providerMessageId,
      errorMessage: details.errorMessage,
      payload: details.payload,
    })
    return true
  } catch (error) {
    console.error('[delivery] Failed to report result:', error)
    return false
  }
}

async function processInbound(instanceKey, inbound, payload) {
  const status = await appRequest('/api/whatsapp/customer-status', {
    instanceKey,
    ...inbound,
    payload,
  })
  logAiDiagnostics(status)

  if (!status.shouldReply) {
    console.log(`[webhook] ignored instance=${instanceKey} phone=${inbound.phone} duplicate=${Boolean(status.duplicate)}`)
    return { ignored: true, duplicate: Boolean(status.duplicate) }
  }

  let result
  try {
    result = await sendEvolutionText(instanceKey, status.phone, status.replyText)
  } catch (error) {
    if (!isTimeoutError(error)) {
      const failedSynced = await updateDelivery(status.outboundMessageId, 'failed', {
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      if (!failedSynced) console.error('[whatsapp-automation] Failed to persist rejected reply delivery.')
    } else {
      console.error('[whatsapp-automation] Evolution reply timed out; leaving outbound pending for reconciliation.')
    }
    throw error
  }

  const providerMessageId = result.key?.id || result.messageId || result.id
  const deliverySynced = await updateDelivery(status.outboundMessageId, 'sent', {
    providerMessageId,
    payload: result,
  })
  if (!deliverySynced) console.error('[whatsapp-automation] Reply sent, but delivery sync failed.')

  console.log(`[webhook] sent instance=${instanceKey} phone=${status.phone} outbound=${status.outboundMessageId} text="${previewText(status.replyText)}" deliverySynced=${deliverySynced}`)
  return { sent: true, providerMessageId, deliverySynced }
}

async function flushBufferedInbound(key, reason = 'timeout') {
  const entry = inboundBuffers.get(key)
  if (!entry) return { ignored: true, empty: true }

  inboundBuffers.delete(key)
  clearBufferedInboundTimer(entry)

  const messages = entry.messages
    .map((message) => ({
      ...message,
      messageText: normalizeAggregationText(message.messageText),
    }))
    .filter((message) => message.messageText)

  if (messages.length === 0) {
    return { ignored: true, empty: true }
  }

  const lastMessage = messages[messages.length - 1]
  const aggregatedText = messages.map((message) => message.messageText).join('\n')
  console.log(`[webhook] aggregated instance=${entry.instanceKey} phone=${entry.phone} messages=${messages.length} reason=${reason} text="${previewText(aggregatedText)}"`)

  return processInbound(entry.instanceKey, {
    phone: entry.phone,
    providerMessageId: lastMessage.providerMessageId,
    messageText: aggregatedText,
  }, buildAggregatedInboundPayload(messages))
}

function scheduleBufferedInbound(key, entry) {
  clearBufferedInboundTimer(entry)
  entry.timer = setTimeout(() => {
    flushBufferedInbound(key, 'timer').catch((error) => {
      console.error(`[webhook] failed to flush buffered inbound ${key}:`, error)
    })
  }, INBOUND_AGGREGATION_WINDOW_MS)
}

function enqueueBufferedInbound(instanceKey, inbound) {
  const key = inboundBufferKey(instanceKey, inbound.phone)
  const existing = inboundBuffers.get(key)

  if (existing?.providerMessageIds.has(inbound.providerMessageId)) {
    return { ignored: true, duplicate: true, buffered: true }
  }

  const entry = existing || {
    instanceKey,
    phone: inbound.phone,
    messages: [],
    providerMessageIds: new Set(),
    timer: null,
  }

  entry.messages.push({
    providerMessageId: inbound.providerMessageId,
    messageText: inbound.messageText,
    attachmentKind: inbound.attachmentKind,
    receivedAt: new Date().toISOString(),
  })
  entry.providerMessageIds.add(inbound.providerMessageId)
  inboundBuffers.set(key, entry)
  scheduleBufferedInbound(key, entry)

  console.log(`[webhook] buffered instance=${instanceKey} phone=${inbound.phone} messages=${entry.messages.length} wait_ms=${INBOUND_AGGREGATION_WINDOW_MS} text="${previewText(inbound.messageText)}"`)
  return { ignored: true, buffered: true, pendingMessages: entry.messages.length }
}

async function handleMessage(instanceKey, payload) {
  const storeInitiated = extractStoreInitiatedMessage(payload)
  if (storeInitiated) {
    await appRequest('/api/whatsapp/store-initiated', {
      instanceKey,
      ...storeInitiated,
      payload,
    })
    return { ignored: true, fromMe: true }
  }

  const inbound = extractInbound(payload)
  if (!inbound) return { ignored: true }

  console.log(`[webhook] inbound instance=${instanceKey} phone=${inbound.phone} text="${previewText(inbound.messageText)}"`)

  const key = inboundBufferKey(instanceKey, inbound.phone)
  if (inbound.attachmentKind) {
    if (inboundBuffers.has(key)) {
      await flushBufferedInbound(key, 'attachment_bypass')
    }
    return processInbound(instanceKey, inbound, payload)
  }

  const normalizedText = normalizeAggregationText(inbound.messageText)
  if (!normalizedText) {
    return processInbound(instanceKey, inbound, payload)
  }

  return enqueueBufferedInbound(instanceKey, {
    ...inbound,
    messageText: normalizedText,
  })
}

async function handleConnection(instanceKey, payload) {
  await appRequest('/api/whatsapp/connection', {
    instanceKey,
    status: mapConnectionStatus(payload),
  })
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

  if (request.method === 'GET' && url.pathname === '/health') {
    return jsonResponse(response, 200, { ok: true })
  }

  if (url.pathname.startsWith('/admin/instances/')) {
    if (!isAuthorizedAdmin(request)) {
      return jsonResponse(response, 401, { error: 'Unauthorized' })
    }

    try {
      const payload = await readJson(request)
      const instanceKey = String(payload.instanceKey || '').trim()
      if (!/^[a-zA-Z0-9_-]{2,120}$/.test(instanceKey)) {
        return jsonResponse(response, 400, { error: 'Invalid instance key' })
      }

      if (request.method === 'POST' && url.pathname === '/admin/instances/setup') {
        const result = await setupEvolutionInstance(instanceKey)
        return jsonResponse(response, 200, result)
      }

      if (request.method === 'POST' && url.pathname === '/admin/instances/connect') {
        const result = await connectEvolutionInstance(instanceKey)
        return jsonResponse(response, 200, {
          instanceKey,
          connectionStatus: 'connecting',
          qrCodeBase64: extractQrCodeBase64(result),
        })
      }

      if (request.method === 'POST' && url.pathname === '/admin/instances/disconnect') {
        const statePayload = await getEvolutionConnectionState(instanceKey).catch(() => null)
        const state = extractConnectionState(statePayload)
        if (state !== 'open' && state !== 'connected' && state !== 'connecting') {
          return jsonResponse(response, 200, {
            instanceKey,
            connectionStatus: 'disconnected',
          })
        }

        await logoutEvolutionInstance(instanceKey)
        return jsonResponse(response, 200, {
          instanceKey,
          connectionStatus: 'disconnected',
        })
      }

      if (request.method === 'POST' && url.pathname === '/admin/instances/status') {
        const result = await getEvolutionConnectionState(instanceKey)
        const state = extractConnectionState(result)
        return jsonResponse(response, 200, {
          instanceKey,
          connectionStatus: state === 'open' || state === 'connected' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected',
        })
      }

      return jsonResponse(response, 404, { error: 'Not found' })
    } catch (error) {
      console.error('[admin] Request failed:', error)
      return jsonResponse(response, 500, { error: 'Admin request failed' })
    }
  }

  if (request.method === 'POST' && url.pathname === '/admin/messages/send') {
    if (!isAuthorizedAdmin(request)) {
      return jsonResponse(response, 401, { error: 'Unauthorized' })
    }

    try {
      const payload = await readJson(request)
      const result = await handleAdminMessageSend(payload)
      return jsonResponse(response, 200, result)
    } catch (error) {
      console.error('[admin] Message send failed:', error)
      return jsonResponse(response, error.status || 500, { error: error.message || 'Message send failed' })
    }
  }

  const match = url.pathname.match(/^\/webhooks\/evolution\/([^/]+)$/)
  if (request.method !== 'POST' || !match) {
    return jsonResponse(response, 404, { error: 'Not found' })
  }

  if (!isAuthorizedWebhook(request, url)) {
    return jsonResponse(response, 401, { error: 'Unauthorized' })
  }

  const instanceKey = decodeURIComponent(match[1])

  try {
    const payload = await readJson(request)
    const payloadInstance = String(payload.instance || payload.instanceName || '').trim()
    if (payloadInstance && payloadInstance !== instanceKey) {
      return jsonResponse(response, 400, { error: 'Instance mismatch' })
    }

    const event = eventName(payload)
    if (event.includes('connection')) {
      await handleConnection(instanceKey, payload)
      return jsonResponse(response, 200, { received: true })
    }

    if (event.includes('message') || payload.data?.message) {
      const result = await handleMessage(instanceKey, payload)
      return jsonResponse(response, 200, { received: true, ...result })
    }

    return jsonResponse(response, 200, { received: true, ignored: true })
  } catch (error) {
    console.error('[webhook] Processing failed:', error)
    return jsonResponse(response, 500, { error: 'Processing failed' })
  }
})

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[whatsapp-automation] Listening on port ${config.port}`)
})
