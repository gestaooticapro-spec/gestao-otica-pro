import { createServer } from 'node:http'

const config = {
  port: Number(process.env.PORT || 8080),
  appBaseUrl: requiredEnv('APP_BASE_URL').replace(/\/$/, ''),
  internalSecret: requiredEnv('WHATSAPP_INTERNAL_SECRET'),
  evolutionBaseUrl: requiredEnv('EVOLUTION_API_URL').replace(/\/$/, ''),
  evolutionApiKey: requiredEnv('EVOLUTION_API_KEY'),
  webhookSecret: requiredEnv('EVOLUTION_WEBHOOK_SECRET'),
}

// Clientes costumam separar a resposta em saudacao + conteudo (por exemplo,
// "Boa tarde" e, alguns segundos depois, "Esta otima"). Vinte segundos
// preservam uma conversa mais natural sem atrasar demais a resposta.
const INBOUND_AGGREGATION_WINDOW_MS = Number(process.env.WHATSAPP_INBOUND_AGGREGATION_WINDOW_MS || 20000)
const APP_REQUEST_TIMEOUT_MS = Number(process.env.WHATSAPP_APP_REQUEST_TIMEOUT_MS || 65000)
const PENDING_REPLY_RECOVERY_ATTEMPTS = 4
const PENDING_REPLY_RECOVERY_DELAY_MS = 1500
const MAX_ADMIN_BODY_BYTES = 15 * 1024 * 1024
const MAX_MEDIA_BYTES = 10 * 1024 * 1024
const MAX_INBOUND_VISION_BYTES = 3 * 1024 * 1024
// A Loja 1 e o canal piloto do atendimento automatico. O watchdog fica
// propositalmente restrito a esta instancia para nao reiniciar os demais
// WhatsApps sem uma decisao operacional explicita.
const STORE_ONE_WATCHDOG_ENABLED = process.env.WHATSAPP_STORE_ONE_WATCHDOG_ENABLED !== 'false'
const STORE_ONE_WATCHDOG_INSTANCE_KEY = process.env.WHATSAPP_STORE_ONE_WATCHDOG_INSTANCE_KEY || 'loja-1-otica-prisma-guaira'
const STORE_ONE_WATCHDOG_INTERVAL_MS = Math.max(30000, Number(process.env.WHATSAPP_STORE_ONE_WATCHDOG_INTERVAL_MS || 60000))
const STORE_ONE_WATCHDOG_RESTART_COOLDOWN_MS = Math.max(60000, Number(process.env.WHATSAPP_STORE_ONE_WATCHDOG_RESTART_COOLDOWN_MS || 300000))
const STORE_ONE_RECONCILIATION_ENABLED = process.env.WHATSAPP_STORE_ONE_RECONCILIATION_ENABLED !== 'false'
const STORE_ONE_RECONCILIATION_INTERVAL_MS = Math.max(30000, Number(process.env.WHATSAPP_STORE_ONE_RECONCILIATION_INTERVAL_MS || 60000))
const STORE_ONE_RECONCILIATION_LOOKBACK_MS = Math.max(60000, Number(process.env.WHATSAPP_STORE_ONE_RECONCILIATION_LOOKBACK_MS || 24 * 60 * 60 * 1000))
const INBOUND_FORWARD_RETRY_ATTEMPTS = Math.max(1, Number(process.env.WHATSAPP_INBOUND_FORWARD_RETRY_ATTEMPTS || 5))
const INBOUND_FORWARD_RETRY_BASE_MS = Math.max(1000, Number(process.env.WHATSAPP_INBOUND_FORWARD_RETRY_BASE_MS || 5000))
const WEBHOOK_REPLAY_MAX_AGE_MS = Math.max(60000, Number(process.env.WHATSAPP_WEBHOOK_REPLAY_MAX_AGE_MS || 15 * 60 * 1000))
const RECONCILIATION_PAGE_SIZE = 500
const RECONCILIATION_MAX_PAGES = 10
const inboundBuffers = new Map()
const recentlyObservedProviderIds = new Map()
let storeOneWatchdogRunning = false
let storeOneWatchdogLastRestartAt = 0
let storeOneReconciliationRunning = false
const serviceStartedAt = Date.now()

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
    || message.reactionMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || message.documentMessage?.caption
    || unwrappedMessage.conversation
    || unwrappedMessage.extendedTextMessage?.text
    || unwrappedMessage.reactionMessage?.text
    || unwrappedMessage.imageMessage?.caption
    || unwrappedMessage.videoMessage?.caption
    || unwrappedMessage.documentMessage?.caption
    || ''
}

function messageTimestampIso(payload) {
  const raw = payload.data?.messageTimestamp ?? payload.messageTimestamp
  const seconds = Number(typeof raw === 'object' ? raw?.low : raw)
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString()
  return new Date(seconds * 1000).toISOString()
}

function statusContextInfo(message = {}, dataContextInfo = null) {
  const unwrapped = unwrapMessage(message)
  return message.extendedTextMessage?.contextInfo
    || message.imageMessage?.contextInfo
    || message.videoMessage?.contextInfo
    || message.documentMessage?.contextInfo
    || message.audioMessage?.contextInfo
    || unwrapped.extendedTextMessage?.contextInfo
    || unwrapped.imageMessage?.contextInfo
    || unwrapped.videoMessage?.contextInfo
    || unwrapped.documentMessage?.contextInfo
    || unwrapped.audioMessage?.contextInfo
    || dataContextInfo
    || null
}

function extractStatusReference(message = {}, dataContextInfo = null) {
  const unwrapped = unwrapMessage(message)
  const reaction = message.reactionMessage || unwrapped.reactionMessage
  if (reaction?.key?.id && reaction.key.remoteJid === 'status@broadcast') {
    return {
      providerMessageId: String(reaction.key.id),
      interactionType: 'reaction',
    }
  }

  const contextInfo = statusContextInfo(message, dataContextInfo)
  const quotedRemoteJid = contextInfo?.remoteJid
    || contextInfo?.participant
    || contextInfo?.quotedMessage?.key?.remoteJid
  if (contextInfo?.stanzaId && (
    quotedRemoteJid === 'status@broadcast'
    || contextInfo.quotedMessage
  )) {
    return {
      providerMessageId: String(contextInfo.stanzaId),
      interactionType: 'reply',
    }
  }

  return null
}

function extractStoreStatusPublication(payload) {
  const data = payload.data || {}
  const key = data.key || {}
  const remoteJid = key.remoteJid || data.remoteJid || ''
  const providerMessageId = key.id || data.id || payload.messageId || ''
  const fromMe = Boolean(key.fromMe ?? data.fromMe)
  const message = data.message || {}
  const unwrapped = unwrapMessage(message)
  const statusReference = extractStatusReference(message, data.contextInfo)

  // O WhatsApp nem sempre replica a publicação de Status feita no celular para
  // o dispositivo conectado. Uma reação recebida em status@broadcast é o
  // marcador explícito de que existe um Status da loja para contextualizar.
  if (statusReference?.interactionType === 'reaction') {
    return {
      providerMessageId: statusReference.providerMessageId,
      messageText: null,
      mediaKind: null,
      publishedAt: messageTimestampIso(payload),
      detectedByReaction: true,
    }
  }

  if (!fromMe || remoteJid !== 'status@broadcast' || !providerMessageId) return null

  return {
    providerMessageId: String(providerMessageId),
    messageText: extractText(message),
    mediaKind: detectAttachmentKind(message),
    publishedAt: messageTimestampIso(payload),
    detectedByReaction: false,
  }
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

function decodedBase64Bytes(value) {
  const base64 = String(value || '').replace(/^data:[^;]+;base64,/, '').trim()
  if (!base64 || base64.length % 4 !== 0 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(base64)) return 0
  const paddingBytes = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - paddingBytes
}

function prepareInboundPayloadForApp(payload, attachmentKind) {
  const canForwardMedia = attachmentKind === 'image' || attachmentKind === 'document'
  let keptBase64 = false

  function walk(value) {
    if (Array.isArray(value)) return value.map(walk)
    if (!value || typeof value !== 'object') return value

    return Object.fromEntries(Object.entries(value).flatMap(([key, nestedValue]) => {
      if (key.toLowerCase() !== 'base64') return [[key, walk(nestedValue)]]

      const decodedBytes = decodedBase64Bytes(nestedValue)
      if (!canForwardMedia || keptBase64 || decodedBytes <= 0 || decodedBytes > MAX_INBOUND_VISION_BYTES) {
        return []
      }

      keptBase64 = true
      return [[key, String(nestedValue).replace(/^data:[^;]+;base64,/, '').trim()]]
    }))
  }

  return walk(payload)
}

function extractInbound(payload) {
  const data = payload.data || {}
  const key = data.key || {}
  const remoteJid = key.remoteJid || data.remoteJid || ''
  const message = data.message || {}
  const providerMessageId = key.id || data.id || payload.messageId || ''
  const fromMe = Boolean(key.fromMe ?? data.fromMe)
  const statusReference = extractStatusReference(message, data.contextInfo)

  if (fromMe || !providerMessageId || !remoteJid) return null
  if (remoteJid.endsWith('@g.us')) return null

  const participant = key.participant
    || data.participant
    || data.sender
    || data.pushNameJid
    || ''
  const alternatePhoneJid = key.remoteJidAlt
    || data.remoteJidAlt
    || key.senderPn
    || data.senderPn
    || ''
  const phoneSource = remoteJid === 'status@broadcast'
    ? participant
    : (remoteJid.endsWith('@lid') ? alternatePhoneJid : remoteJid)
  const phone = String(phoneSource).split('@')[0].replace(/\D/g, '')
  if (!phone || phone.length < 10 || phone.length > 15) {
    if (remoteJid.endsWith('@lid')) {
      console.warn(`[webhook] ignored unresolved lid provider_message_id=${providerMessageId}`)
    }
    return null
  }
  if (remoteJid === 'status@broadcast' && !statusReference) return null

  return {
    phone,
    providerMessageId,
    messageText: extractText(message),
    providerCreatedAt: messageTimestampIso(payload),
    attachmentKind: detectAttachmentKind(message),
    statusReferenceId: statusReference?.providerMessageId || null,
    statusInteractionType: statusReference?.interactionType || null,
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
  const attachmentKind = detectAttachmentKind(message)
  const readableText = extractText(message)

  return {
    phone,
    providerMessageId,
    messageText: readableText || (attachmentKind ? `[${attachmentKind} enviado pela loja]` : ''),
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

async function appRequest(path, payload, timeoutMs = APP_REQUEST_TIMEOUT_MS) {
  const response = await fetch(`${config.appBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.internalSecret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`App request failed (${response.status}): ${JSON.stringify(result)}`)
  }
  return result
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function rememberProviderMessage(providerMessageId) {
  if (!providerMessageId) return
  recentlyObservedProviderIds.set(String(providerMessageId), Date.now())
  const cutoff = Date.now() - Math.max(STORE_ONE_RECONCILIATION_LOOKBACK_MS * 2, 60 * 60 * 1000)
  for (const [id, observedAt] of recentlyObservedProviderIds) {
    if (observedAt < cutoff) recentlyObservedProviderIds.delete(id)
  }
}

function forgetProviderMessage(providerMessageId) {
  if (providerMessageId) recentlyObservedProviderIds.delete(String(providerMessageId))
}

function providerCreatedAtMs(inbound) {
  const value = Date.parse(String(inbound?.providerCreatedAt || ''))
  return Number.isFinite(value) ? value : 0
}

function isStaleWebhookReplay(inbound) {
  const createdAt = providerCreatedAtMs(inbound)
  return createdAt > 0 && createdAt < Date.now() - WEBHOOK_REPLAY_MAX_AGE_MS
}

async function auditWebhookEvent(instanceKey, inbound, source, processingStatus = 'received', errorMessage = null) {
  try {
    await appRequest('/api/whatsapp/webhook-events', {
      instanceKey,
      providerMessageId: String(inbound.providerMessageId),
      phone: inbound.phone || null,
      eventName: 'messages.upsert',
      source,
      providerCreatedAt: inbound.providerCreatedAt || null,
      processingStatus,
      errorMessage,
      metadata: {
        attachmentKind: inbound.attachmentKind || null,
        recovered: source === 'reconciliation',
      },
    }, 10000)
  } catch (error) {
    console.error(`[audit] failed instance=${instanceKey} provider_message_id=${inbound.providerMessageId}:`, error)
  }
}

async function processInboundWithRetry(instanceKey, inbound, payload, source = 'webhook') {
  await auditWebhookEvent(instanceKey, inbound, source)
  let lastError = null

  for (let attempt = 1; attempt <= INBOUND_FORWARD_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const result = await processInbound(instanceKey, inbound, payload)
      await auditWebhookEvent(instanceKey, inbound, source, 'forwarded')
      rememberProviderMessage(inbound.providerMessageId)
      return result
    } catch (error) {
      lastError = error
      console.error(`[webhook] inbound forwarding failed instance=${instanceKey} provider_message_id=${inbound.providerMessageId} attempt=${attempt}:`, error)
      if (attempt < INBOUND_FORWARD_RETRY_ATTEMPTS) {
        await wait(INBOUND_FORWARD_RETRY_BASE_MS * attempt)
      }
    }
  }

  await auditWebhookEvent(instanceKey, inbound, source, 'failed', String(lastError?.message || lastError))
  forgetProviderMessage(inbound.providerMessageId)
  throw lastError
}

async function recoverPendingReply(instanceKey, providerMessageId) {
  for (let attempt = 1; attempt <= PENDING_REPLY_RECOVERY_ATTEMPTS; attempt += 1) {
    await wait(PENDING_REPLY_RECOVERY_DELAY_MS)

    try {
      const recovered = await appRequest('/api/whatsapp/pending-reply', {
        instanceKey,
        providerMessageId,
      }, 10000)

      if (recovered.shouldReply) {
        console.log(`[webhook] recovered pending reply instance=${instanceKey} provider_message_id=${providerMessageId} outbound=${recovered.outboundMessageId}`)
        return recovered
      }
    } catch (error) {
      console.error(`[webhook] pending reply recovery attempt=${attempt} failed:`, error)
    }
  }

  return null
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

function isEvolutionConnectionClosed(error) {
  const message = String(error?.message || error).toLowerCase()
  return message.includes('connection closed')
}

async function restartEvolutionInstance(instanceKey) {
  return evolutionRequest(`/instance/restart/${encodeURIComponent(instanceKey)}`, {
    method: 'POST',
  })
}

async function waitForEvolutionConnected(instanceKey, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const statePayload = await getEvolutionConnectionState(instanceKey).catch(() => null)
    const state = extractConnectionState(statePayload)
    if (isEvolutionConnectedState(state)) return true
    await wait(1000)
  }
  return false
}

async function sendEvolutionMediaWithRecovery(instanceKey, phone, media) {
  try {
    return await sendEvolutionMedia(instanceKey, phone, media)
  } catch (error) {
    if (!isEvolutionConnectionClosed(error)) throw error

    // O Baileys pode manter a instancia marcada como open mesmo quando o
    // socket usado por refreshMediaConn morreu. Nesse caso o upload ainda nao
    // comecou, portanto reiniciar a instancia e repetir uma vez e seguro.
    console.warn(`[whatsapp-automation] Media socket closed for instance=${instanceKey}; restarting the instance before one retry.`)
    await restartEvolutionInstance(instanceKey)
    const connected = await waitForEvolutionConnected(instanceKey)
    if (!connected) {
      throw new Error(`Evolution media send recovery timed out for instance=${instanceKey}`)
    }
    return sendEvolutionMedia(instanceKey, phone, media)
  }
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

async function recoverAndRetryEvolutionMedia(instanceKey, phone, media, outboundMessageId) {
  try {
    console.warn(`[whatsapp-automation] Media socket closed for instance=${instanceKey}; recovery retry started in background.`)
    await restartEvolutionInstance(instanceKey)
    const connected = await waitForEvolutionConnected(instanceKey)
    if (!connected) {
      throw new Error(`Evolution media send recovery timed out for instance=${instanceKey}`)
    }

    const result = await sendEvolutionMedia(instanceKey, phone, media)
    const providerMessageId = result.key?.id || result.messageId || result.id
    const deliverySynced = await updateDelivery(outboundMessageId, 'sent', {
      providerMessageId,
      payload: result,
    })
    if (!deliverySynced) console.error('[whatsapp-automation] Background media retry sent, but delivery sync failed.')
  } catch (error) {
    if (isTimeoutError(error)) {
      console.error('[whatsapp-automation] Background media retry timed out; leaving outbound pending for reconciliation.')
      return
    }

    const failedSynced = await updateDelivery(outboundMessageId, 'failed', {
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    if (!failedSynced) console.error('[whatsapp-automation] Failed to persist background media retry failure.')
  }
}

async function deleteEvolutionInstance(instanceKey) {
  return evolutionRequest(`/instance/delete/${encodeURIComponent(instanceKey)}`, {
    method: 'DELETE',
  })
}

async function logoutEvolutionInstanceWithRecovery(instanceKey) {
  try {
    return await logoutEvolutionInstance(instanceKey)
  } catch (error) {
    if (!isEvolutionConnectionClosed(error)) throw error

    // Uma sessao Baileys pode continuar marcada como aberta mesmo depois de
    // perder o socket. Reiniciar apenas essa instancia recria o socket e
    // permite concluir o logout solicitado pelo operador.
    console.warn(`[whatsapp-automation] Connection closed while logging out instance=${instanceKey}; restarting before one retry.`)
    await restartEvolutionInstance(instanceKey)
    await wait(3000)
    try {
      return await logoutEvolutionInstance(instanceKey)
    } catch (retryError) {
      if (!isEvolutionConnectionClosed(retryError)) throw retryError

      // Se nem um socket novo consegue executar o logout, a sessao persistida
      // esta corrompida. Remover a instancia tem o mesmo efeito solicitado
      // pelo operador e permite que o setup seguinte gere um QR limpo.
      console.warn(`[whatsapp-automation] Logout still failed for instance=${instanceKey}; deleting the broken instance.`)
      return deleteEvolutionInstance(instanceKey)
    }
  }
}

async function getEvolutionConnectionState(instanceKey) {
  return evolutionRequest(`/instance/connectionState/${encodeURIComponent(instanceKey)}`)
}

function isEvolutionConnectedState(state) {
  return state === 'open' || state === 'connected'
}

function isEvolutionDisconnectedState(state) {
  return ['close', 'closed', 'disconnected', 'offline', 'refused'].includes(state)
}

async function runStoreOneConnectionWatchdog() {
  if (!STORE_ONE_WATCHDOG_ENABLED || storeOneWatchdogRunning) return
  storeOneWatchdogRunning = true

  try {
    const statePayload = await getEvolutionConnectionState(STORE_ONE_WATCHDOG_INSTANCE_KEY)
    const state = extractConnectionState(statePayload)
    if (isEvolutionConnectedState(state)) return

    // Durante o QR e a reconexao inicial a Evolution informa "connecting".
    // Reiniciar nesse momento invalida a tentativa em andamento e pode deixar
    // a instancia em ciclo de reconexao. Estados desconhecidos tambem nao
    // devem disparar um restart sem confirmacao explicita de desconexao.
    if (!isEvolutionDisconnectedState(state)) {
      console.warn(`[watchdog] store=1 instance=${STORE_ONE_WATCHDOG_INSTANCE_KEY} state=${state}; waiting without restart.`)
      return
    }

    const now = Date.now()
    const elapsedSinceRestart = now - storeOneWatchdogLastRestartAt
    if (elapsedSinceRestart < STORE_ONE_WATCHDOG_RESTART_COOLDOWN_MS) {
      console.warn(`[watchdog] store=1 instance=${STORE_ONE_WATCHDOG_INSTANCE_KEY} state=${state}; restart skipped during cooldown.`)
      return
    }

    storeOneWatchdogLastRestartAt = now
    console.warn(`[watchdog] store=1 instance=${STORE_ONE_WATCHDOG_INSTANCE_KEY} state=${state}; restarting Evolution instance.`)
    await restartEvolutionInstance(STORE_ONE_WATCHDOG_INSTANCE_KEY)
  } catch (error) {
    // A falha da propria consulta nao deve reiniciar cegamente a instancia:
    // ela pode ser uma indisponibilidade temporaria da API Evolution.
    console.error(`[watchdog] store=1 instance=${STORE_ONE_WATCHDOG_INSTANCE_KEY} health check failed:`, error)
  } finally {
    storeOneWatchdogRunning = false
  }
}

async function configureEvolutionWebhook(instanceKey) {
  const webhookUrl = `http://whatsapp-automation:8080/webhooks/evolution/${encodeURIComponent(instanceKey)}?token=${encodeURIComponent(config.webhookSecret)}`

  return evolutionRequest(`/webhook/set/${encodeURIComponent(instanceKey)}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: true,
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
    if (media && isEvolutionConnectionClosed(error)) {
      void recoverAndRetryEvolutionMedia(instanceKey, phone, media, outboundMessageId)
      return { sent: false, retryScheduled: true, deliverySynced: false }
    }

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

async function deliverPendingReply(instanceKey, status) {
  const attemptSynced = await updateDelivery(status.outboundMessageId, 'sending')
  if (!attemptSynced) throw new Error(`Could not mark outbound ${status.outboundMessageId} as sending`)

  let result
  try {
    result = await sendEvolutionText(instanceKey, status.phone, status.replyText)
  } catch (error) {
    if (!isTimeoutError(error)) {
      await updateDelivery(status.outboundMessageId, 'failed', {
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    } else {
      console.error(`[whatsapp-automation] Evolution reply timed out; outbound=${status.outboundMessageId} remains sending for manual reconciliation.`)
    }
    throw error
  }

  const providerMessageId = result.key?.id || result.messageId || result.id
  const deliverySynced = await updateDelivery(status.outboundMessageId, 'sent', {
    providerMessageId,
    payload: result,
  })
  if (!deliverySynced) console.error('[whatsapp-automation] Reply sent, but delivery sync failed.')
  return { providerMessageId, deliverySynced }
}

async function processInbound(instanceKey, inbound, payload) {
  let status
  try {
    status = await appRequest('/api/whatsapp/customer-status', {
      instanceKey,
      ...inbound,
      payload: prepareInboundPayloadForApp(payload, inbound.attachmentKind),
    })
  } catch (error) {
    console.error(`[webhook] app request failed instance=${instanceKey} provider_message_id=${inbound.providerMessageId}; checking whether the request created an outbound before retrying.`)
    status = await recoverPendingReply(instanceKey, inbound.providerMessageId)
    if (!status) throw error
  }
  logAiDiagnostics(status)

  if (!status.shouldReply && status.duplicate) {
    const existing = await appRequest('/api/whatsapp/pending-reply', {
      instanceKey,
      providerMessageId: inbound.providerMessageId,
    }, 10000)
    if (existing.shouldReply) status = existing
    if (existing.terminalFailure) {
      throw new Error(`Existing outbound ${existing.outboundMessageId} is ${existing.outboundStatus}: ${existing.errorMessage || 'delivery not recoverable automatically'}`)
    }
  }

  if (!status.shouldReply) {
    console.log(`[webhook] ignored instance=${instanceKey} phone=${inbound.phone} duplicate=${Boolean(status.duplicate)}`)
    return { ignored: true, duplicate: Boolean(status.duplicate) }
  }

  const { providerMessageId, deliverySynced } = await deliverPendingReply(instanceKey, status)

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

  try {
    const result = await processInboundWithRetry(entry.instanceKey, {
      phone: entry.phone,
      providerMessageId: lastMessage.providerMessageId,
      messageText: aggregatedText,
      providerCreatedAt: lastMessage.providerCreatedAt,
    }, buildAggregatedInboundPayload(messages), entry.source || 'webhook')

    for (const message of messages) {
      await auditWebhookEvent(entry.instanceKey, {
        ...message,
        phone: entry.phone,
      }, entry.source || 'webhook', 'forwarded')
      rememberProviderMessage(message.providerMessageId)
    }
    return result
  } catch (error) {
    for (const message of messages) {
      await auditWebhookEvent(entry.instanceKey, {
        ...message,
        phone: entry.phone,
      }, entry.source || 'webhook', 'failed', String(error?.message || error))
      forgetProviderMessage(message.providerMessageId)
    }
    throw error
  }
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
    source: inbound.source || 'webhook',
    messages: [],
    providerMessageIds: new Set(),
    timer: null,
  }

  entry.messages.push({
    providerMessageId: inbound.providerMessageId,
    messageText: inbound.messageText,
    attachmentKind: inbound.attachmentKind,
    providerCreatedAt: inbound.providerCreatedAt,
    receivedAt: new Date().toISOString(),
  })
  entry.providerMessageIds.add(inbound.providerMessageId)
  inboundBuffers.set(key, entry)
  scheduleBufferedInbound(key, entry)

  console.log(`[webhook] buffered instance=${instanceKey} phone=${inbound.phone} messages=${entry.messages.length} wait_ms=${INBOUND_AGGREGATION_WINDOW_MS} text="${previewText(inbound.messageText)}"`)
  return { ignored: true, buffered: true, pendingMessages: entry.messages.length }
}

async function handleMessage(instanceKey, payload) {
  const statusPublication = extractStoreStatusPublication(payload)
  if (statusPublication) {
    const { detectedByReaction, ...publicationPayload } = statusPublication
    await appRequest('/api/whatsapp/status-publications', {
      instanceKey,
      ...publicationPayload,
      payload: prepareInboundPayloadForApp(payload, null),
    })
    console.log(`[webhook] status captured instance=${instanceKey} provider_message_id=${statusPublication.providerMessageId} source=${detectedByReaction ? 'reaction' : 'publication'} media=${statusPublication.mediaKind || 'text'}`)

    // Publicacoes da propria loja terminam aqui. Reacoes continuam para o
    // atendimento: sem contexto vao para humano; com contexto podem responder.
    if (!detectedByReaction) {
      return { ignored: true, statusPublication: true }
    }
  }

  const storeInitiated = extractStoreInitiatedMessage(payload)
  if (storeInitiated) {
    await appRequest('/api/whatsapp/store-initiated', {
      instanceKey,
      ...storeInitiated,
      // Mensagens enviadas pelo celular da loja so precisam deixar contexto.
      // O arquivo em base64 nao deve ser replicado nem persistido no app.
      payload: prepareInboundPayloadForApp(payload, null),
    })
    return { ignored: true, fromMe: true }
  }

  const inbound = extractInbound(payload)
  if (!inbound) return { ignored: true }

  if (isStaleWebhookReplay(inbound)) {
    console.warn(`[webhook] stale replay deferred to reconciliation instance=${instanceKey} phone=${inbound.phone} provider_message_id=${inbound.providerMessageId} provider_created_at=${inbound.providerCreatedAt}`)
    return { ignored: true, staleReplay: true }
  }

  await auditWebhookEvent(instanceKey, inbound, 'webhook')
  rememberProviderMessage(inbound.providerMessageId)

  console.log(`[webhook] inbound instance=${instanceKey} phone=${inbound.phone} text="${previewText(inbound.messageText)}"`)

  const key = inboundBufferKey(instanceKey, inbound.phone)
  if (inbound.statusReferenceId) {
    console.log(`[webhook] status interaction ignored instance=${instanceKey} phone=${inbound.phone} provider_message_id=${inbound.providerMessageId} status_reference_id=${inbound.statusReferenceId}`)
    await auditWebhookEvent(instanceKey, inbound, 'webhook', 'forwarded')
    return { ignored: true, statusInteraction: true }
  }

  if (inbound.attachmentKind) {
    if (inboundBuffers.has(key)) {
      await flushBufferedInbound(key, 'attachment_bypass')
    }
    return processInboundWithRetry(instanceKey, inbound, payload)
  }

  const normalizedText = normalizeAggregationText(inbound.messageText)
  if (!normalizedText) {
    return processInboundWithRetry(instanceKey, inbound, payload)
  }

  return enqueueBufferedInbound(instanceKey, {
    ...inbound,
    messageText: normalizedText,
  })
}

function evolutionMessageRecords(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.messages)) return payload.messages
  if (Array.isArray(payload?.messages?.records)) return payload.messages.records
  if (Array.isArray(payload?.messages?.records?.records)) return payload.messages.records.records
  return []
}

function evolutionRecordTimestampMs(record) {
  const raw = record?.messageTimestamp
  const seconds = Number(typeof raw === 'object' ? raw?.low : raw)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0
}

function evolutionRecordAsWebhookPayload(instanceKey, record) {
  return {
    event: 'messages.upsert',
    instance: instanceKey,
    data: {
      ...record,
      key: record?.key || {},
      message: record?.message || {},
      messageTimestamp: record?.messageTimestamp,
    },
  }
}

async function findRecentEvolutionMessages(instanceKey, cutoff) {
  const records = []
  let total = 0
  let pages = 1

  for (let page = 0; page < Math.min(pages, RECONCILIATION_MAX_PAGES); page += 1) {
    const response = await evolutionRequest(`/chat/findMessages/${encodeURIComponent(instanceKey)}`, {
      method: 'POST',
      body: JSON.stringify({
        where: {},
        take: RECONCILIATION_PAGE_SIZE,
        skip: page * RECONCILIATION_PAGE_SIZE,
      }),
    })
    const pageRecords = evolutionMessageRecords(response)
    records.push(...pageRecords)
    total = Number(response?.messages?.total || records.length)
    pages = Math.max(1, Number(response?.messages?.pages || Math.ceil(total / RECONCILIATION_PAGE_SIZE)))

    const timestamps = pageRecords.map(evolutionRecordTimestampMs).filter((value) => value > 0)
    if (pageRecords.length < RECONCILIATION_PAGE_SIZE || (timestamps.length && Math.min(...timestamps) < cutoff)) break
  }

  return { records, total, pages }
}

async function knownInboundProviderIds(instanceKey, providerMessageIds) {
  if (providerMessageIds.length === 0) return { knownIds: new Set(), pendingReplies: [] }
  const knownIds = new Set()
  const pendingReplies = []

  for (let offset = 0; offset < providerMessageIds.length; offset += 500) {
    const result = await appRequest('/api/whatsapp/reconciliation-known', {
      instanceKey,
      providerMessageIds: providerMessageIds.slice(offset, offset + 500),
    }, 15000)
    for (const id of Array.isArray(result.knownProviderMessageIds) ? result.knownProviderMessageIds : []) {
      knownIds.add(id)
    }
    pendingReplies.push(...(Array.isArray(result.pendingReplies) ? result.pendingReplies : []))
  }

  return { knownIds, pendingReplies }
}

async function runStoreOneMessageReconciliation() {
  if (!STORE_ONE_RECONCILIATION_ENABLED || storeOneReconciliationRunning) return
  storeOneReconciliationRunning = true

  try {
    const cutoff = Math.max(serviceStartedAt - STORE_ONE_RECONCILIATION_LOOKBACK_MS, Date.now() - STORE_ONE_RECONCILIATION_LOOKBACK_MS)
    const response = await findRecentEvolutionMessages(STORE_ONE_WATCHDOG_INSTANCE_KEY, cutoff)
    const allRecords = response.records
    const recentRecords = allRecords
      .filter((record) => record?.key?.fromMe === false)
      .filter((record) => evolutionRecordTimestampMs(record) >= cutoff)
      .filter((record) => record?.key?.id && !recentlyObservedProviderIds.has(String(record.key.id)))
      .sort((left, right) => evolutionRecordTimestampMs(left) - evolutionRecordTimestampMs(right))
    const { knownIds, pendingReplies } = await knownInboundProviderIds(
      STORE_ONE_WATCHDOG_INSTANCE_KEY,
      recentRecords.map((record) => String(record.key.id))
    )
    const candidates = recentRecords.filter((record) => !knownIds.has(String(record.key.id)))

    console.log(`[reconciliation] scan instance=${STORE_ONE_WATCHDOG_INSTANCE_KEY} records=${allRecords.length} recent=${recentRecords.length} missing=${candidates.length} pending_replies=${pendingReplies.length} total=${response.total} pages=${response.pages}`)

    for (const pending of pendingReplies) {
      const delivered = await deliverPendingReply(STORE_ONE_WATCHDOG_INSTANCE_KEY, pending)
      await auditWebhookEvent(STORE_ONE_WATCHDOG_INSTANCE_KEY, {
        providerMessageId: pending.providerMessageId,
        phone: pending.phone,
      }, 'reconciliation', 'forwarded')
      rememberProviderMessage(pending.providerMessageId)
      console.warn(`[reconciliation] delivered pending reply instance=${STORE_ONE_WATCHDOG_INSTANCE_KEY} outbound=${pending.outboundMessageId} provider_message_id=${delivered.providerMessageId}`)
    }

    for (const record of recentRecords) {
      if (knownIds.has(String(record.key.id))) rememberProviderMessage(record.key.id)
    }

    for (const record of candidates) {
      const payload = evolutionRecordAsWebhookPayload(STORE_ONE_WATCHDOG_INSTANCE_KEY, record)
      const inbound = extractInbound(payload)
      if (!inbound) {
        rememberProviderMessage(record.key.id)
        continue
      }

      if (inbound.statusReferenceId) {
        await auditWebhookEvent(STORE_ONE_WATCHDOG_INSTANCE_KEY, inbound, 'reconciliation', 'forwarded')
        rememberProviderMessage(record.key.id)
        continue
      }

      console.warn(`[reconciliation] recovered instance=${STORE_ONE_WATCHDOG_INSTANCE_KEY} phone=${inbound.phone} provider_message_id=${inbound.providerMessageId} text="${previewText(inbound.messageText)}"`)
      const normalizedText = normalizeAggregationText(inbound.messageText)
      if (!inbound.attachmentKind && normalizedText) {
        enqueueBufferedInbound(STORE_ONE_WATCHDOG_INSTANCE_KEY, {
          ...inbound,
          messageText: normalizedText,
          source: 'reconciliation',
        })
      } else {
        await processInboundWithRetry(STORE_ONE_WATCHDOG_INSTANCE_KEY, inbound, payload, 'reconciliation')
      }
    }
  } catch (error) {
    console.error(`[reconciliation] store=1 instance=${STORE_ONE_WATCHDOG_INSTANCE_KEY} failed:`, error)
  } finally {
    storeOneReconciliationRunning = false
  }
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

      if (request.method === 'POST' && url.pathname === '/admin/instances/restart') {
        const result = await restartEvolutionInstance(instanceKey)
        return jsonResponse(response, 200, {
          instanceKey,
          connectionStatus: extractConnectionState(result) || 'connecting',
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

        await logoutEvolutionInstanceWithRecovery(instanceKey)
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

if (STORE_ONE_WATCHDOG_ENABLED) {
  // Executa uma vez ao iniciar e depois permanece independente do dashboard.
  // O intervalo curto limita a janela de uma desconexao real, enquanto o
  // cooldown impede ciclos de restart caso a Evolution esteja instavel.
  void runStoreOneConnectionWatchdog()
  setInterval(() => {
    void runStoreOneConnectionWatchdog()
  }, STORE_ONE_WATCHDOG_INTERVAL_MS)
  console.log(`[watchdog] store=1 enabled instance=${STORE_ONE_WATCHDOG_INSTANCE_KEY} interval_ms=${STORE_ONE_WATCHDOG_INTERVAL_MS}`)
}

if (STORE_ONE_RECONCILIATION_ENABLED) {
  setTimeout(() => {
    void runStoreOneMessageReconciliation()
  }, 10000)
  setInterval(() => {
    void runStoreOneMessageReconciliation()
  }, STORE_ONE_RECONCILIATION_INTERVAL_MS)
  console.log(`[reconciliation] store=1 enabled instance=${STORE_ONE_WATCHDOG_INSTANCE_KEY} interval_ms=${STORE_ONE_RECONCILIATION_INTERVAL_MS} lookback_ms=${STORE_ONE_RECONCILIATION_LOOKBACK_MS}`)
}
