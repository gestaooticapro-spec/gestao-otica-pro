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
