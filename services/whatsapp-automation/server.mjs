import { createServer } from 'node:http'

const config = {
  port: Number(process.env.PORT || 8080),
  appBaseUrl: requiredEnv('APP_BASE_URL').replace(/\/$/, ''),
  internalSecret: requiredEnv('WHATSAPP_INTERNAL_SECRET'),
  evolutionBaseUrl: requiredEnv('EVOLUTION_API_URL').replace(/\/$/, ''),
  evolutionApiKey: requiredEnv('EVOLUTION_API_KEY'),
  webhookSecret: requiredEnv('EVOLUTION_WEBHOOK_SECRET'),
}

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
  for await (const chunk of request) chunks.push(chunk)
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
  return message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || ''
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
  } catch (error) {
    console.error('[delivery] Failed to report result:', error)
  }
}

async function handleMessage(instanceKey, payload) {
  const inbound = extractInbound(payload)
  if (!inbound) return { ignored: true }

  const status = await appRequest('/api/whatsapp/customer-status', {
    instanceKey,
    ...inbound,
    payload,
  })

  if (!status.shouldReply) {
    return { ignored: true, duplicate: Boolean(status.duplicate) }
  }

  try {
    const result = await sendEvolutionText(instanceKey, status.phone, status.replyText)
    const providerMessageId = result.key?.id || result.messageId || result.id
    await updateDelivery(status.outboundMessageId, 'sent', {
      providerMessageId,
      payload: result,
    })
    return { sent: true }
  } catch (error) {
    await updateDelivery(status.outboundMessageId, 'failed', {
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw error
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
