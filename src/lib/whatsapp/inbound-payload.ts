import type { Json } from '@/lib/database.types'

export type WhatsAppInboundAttachmentKind =
  | 'image'
  | 'document'
  | 'audio'
  | 'video'
  | 'sticker'
  | 'unknown'

export type WhatsAppInboundPayloadMeta = {
  text: string | null
  hasAttachment: boolean
  attachmentKind: WhatsAppInboundAttachmentKind | null
  mimeType: string | null
  fileName: string | null
  caption: string | null
  base64: string | null
}

const MAX_INBOUND_MEDIA_BYTES = 3 * 1024 * 1024
const SUPPORTED_VISION_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const NON_CONTENT_KEYS = new Set([
  'event',
  'type',
  'instance',
  'instanceName',
  'messageId',
  'id',
  'status',
  'pushName',
  'sender',
  'source',
  'apikey',
])

function normalizeText(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

function asRecord(value: Json | null | undefined): Record<string, Json | undefined> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, Json | undefined>
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }

  return null
}

function normalizeInboundMediaBase64(value: string | null, mimeType: string | null) {
  if (!value || !mimeType || !SUPPORTED_VISION_MIME_TYPES.has(mimeType.toLowerCase())) return null

  const base64 = value.replace(/^data:[^;]+;base64,/, '').trim()
  if (!base64 || base64.length % 4 !== 0 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(base64)) return null

  const paddingBytes = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  const decodedBytes = Math.floor((base64.length * 3) / 4) - paddingBytes
  return decodedBytes > 0 && decodedBytes <= MAX_INBOUND_MEDIA_BYTES ? base64 : null
}

function detectAttachmentKind(node: Record<string, Json | undefined>): WhatsAppInboundAttachmentKind | null {
  if (node.imageMessage || node.image) return 'image'
  if (node.documentMessage || node.document) return 'document'
  if (node.audioMessage || node.audio) return 'audio'
  if (node.videoMessage || node.video) return 'video'
  if (node.stickerMessage || node.sticker) return 'sticker'
  return null
}

function unwrapMessageContainer(node: Record<string, Json | undefined>) {
  return asRecord(node.ephemeralMessage)?.message
    || asRecord(node.viewOnceMessage)?.message
    || asRecord(node.viewOnceMessageV2)?.message
    || asRecord(node.viewOnceMessageV2Extension)?.message
    || asRecord(node.documentWithCaptionMessage)?.message
    || asRecord(node.editedMessage)?.message
    || null
}

function extractTextCandidates(node: Record<string, Json | undefined>): unknown[] {
  const unwrappedMessage = unwrapMessageContainer(node)
  return [
    node.conversation,
    asRecord(node.extendedTextMessage)?.text,
    asRecord(node.documentMessage)?.caption,
    node.text,
    node.message,
    node.content,
    asRecord(node.imageMessage)?.caption,
    asRecord(node.documentMessage)?.caption,
    asRecord(node.videoMessage)?.caption,
    asRecord(unwrappedMessage)?.conversation,
    asRecord(asRecord(unwrappedMessage)?.extendedTextMessage)?.text,
    asRecord(asRecord(unwrappedMessage)?.imageMessage)?.caption,
    asRecord(asRecord(unwrappedMessage)?.documentMessage)?.caption,
    asRecord(asRecord(unwrappedMessage)?.videoMessage)?.caption,
    asRecord(node.messageContextInfo)?.quotedMessage
      ? extractTextCandidates(asRecord(node.messageContextInfo)?.quotedMessage as Record<string, Json | undefined>)[0]
      : null,
  ]
}

function extractAttachmentDetails(node: Record<string, Json | undefined>) {
  const unwrappedMessage = unwrapMessageContainer(node)
  const image = asRecord(node.imageMessage)
  const document = asRecord(node.documentMessage)
  const video = asRecord(node.videoMessage)
  const audio = asRecord(node.audioMessage)
  const sticker = asRecord(node.stickerMessage)
  const nestedImage = asRecord(asRecord(unwrappedMessage)?.imageMessage)
  const nestedDocument = asRecord(asRecord(unwrappedMessage)?.documentMessage)
  const nestedVideo = asRecord(asRecord(unwrappedMessage)?.videoMessage)
  const nestedAudio = asRecord(asRecord(unwrappedMessage)?.audioMessage)
  const nestedSticker = asRecord(asRecord(unwrappedMessage)?.stickerMessage)

  const mimeType = firstString(
    image?.mimetype,
    document?.mimetype,
    video?.mimetype,
    audio?.mimetype,
    sticker?.mimetype,
    nestedImage?.mimetype,
    nestedDocument?.mimetype,
    nestedVideo?.mimetype,
    nestedAudio?.mimetype,
    nestedSticker?.mimetype,
    node.mimetype
  )
  const rawBase64 = firstString(
    image?.base64,
    document?.base64,
    nestedImage?.base64,
    nestedDocument?.base64,
    node.base64
  )

  return {
    mimeType,
    fileName: firstString(
      document?.fileName,
      document?.title,
      image?.fileName,
      video?.fileName,
      nestedDocument?.fileName,
      nestedDocument?.title,
      nestedImage?.fileName,
      nestedVideo?.fileName,
      node.fileName,
      node.filename
    ),
    caption: firstString(
      image?.caption,
      document?.caption,
      video?.caption,
      nestedImage?.caption,
      nestedDocument?.caption,
      nestedVideo?.caption,
      node.caption
    ),
    base64: normalizeInboundMediaBase64(rawBase64, mimeType),
  }
}

function walk(value: Json | null | undefined, visited = new Set<unknown>()): WhatsAppInboundPayloadMeta {
  if (value == null) {
    return {
      text: null,
      hasAttachment: false,
      attachmentKind: null,
      mimeType: null,
      fileName: null,
      caption: null,
      base64: null,
    }
  }

  if (typeof value === 'string') {
    const text = normalizeText(value)
    return {
      text,
      hasAttachment: false,
      attachmentKind: null,
      mimeType: null,
      fileName: null,
      caption: null,
      base64: null,
    }
  }

  if (typeof value !== 'object') {
    return {
      text: null,
      hasAttachment: false,
      attachmentKind: null,
      mimeType: null,
      fileName: null,
      caption: null,
      base64: null,
    }
  }

  if (visited.has(value)) {
    return {
      text: null,
      hasAttachment: false,
      attachmentKind: null,
      mimeType: null,
      fileName: null,
      caption: null,
      base64: null,
    }
  }
  visited.add(value)

  if (Array.isArray(value)) {
    for (const item of value) {
      const meta = walk(item, visited)
      if (meta.hasAttachment || meta.text) return meta
    }

    return {
      text: null,
      hasAttachment: false,
      attachmentKind: null,
      mimeType: null,
      fileName: null,
      caption: null,
      base64: null,
    }
  }

  const node = value as Record<string, Json | undefined>
  const unwrappedMessage = unwrapMessageContainer(node)
  const attachmentKind = detectAttachmentKind(node) || (unwrappedMessage ? detectAttachmentKind(asRecord(unwrappedMessage) || {}) : null)
  const text = firstString(...extractTextCandidates(node))
  const details = extractAttachmentDetails(node)

  if (attachmentKind) {
    return {
      text,
      hasAttachment: true,
      attachmentKind,
      mimeType: details.mimeType,
      fileName: details.fileName,
      caption: details.caption,
      base64: details.base64,
    }
  }

  if (text) {
    return {
      text,
      hasAttachment: false,
      attachmentKind: null,
      mimeType: details.mimeType,
      fileName: details.fileName,
      caption: details.caption,
      base64: details.base64,
    }
  }

  const prioritizedNestedValues = [
    node.data,
    node.message,
    unwrappedMessage,
    asRecord(node.messageContextInfo)?.quotedMessage as Json | undefined,
  ]

  for (const nestedValue of prioritizedNestedValues) {
    const nestedMeta = walk(nestedValue ?? null, visited)
    if (nestedMeta.hasAttachment || nestedMeta.text) {
      return nestedMeta
    }
  }

  for (const [key, nestedValue] of Object.entries(node)) {
    if (NON_CONTENT_KEYS.has(key)) continue
    const nestedMeta = walk(nestedValue ?? null, visited)
    if (nestedMeta.hasAttachment || nestedMeta.text) {
      return nestedMeta
    }
  }

  return {
    text,
    hasAttachment: false,
    attachmentKind: null,
    mimeType: details.mimeType,
    fileName: details.fileName,
    caption: details.caption,
    base64: details.base64,
  }
}

export function extractWhatsAppInboundPayloadMeta(payload: Json | null | undefined): WhatsAppInboundPayloadMeta {
  return walk(payload)
}

export function isWhatsAppInboundPayloadFromMe(payload: Json | null | undefined): boolean {
  const root = asRecord(payload)
  const data = asRecord(root?.data)
  const key = asRecord(root?.key) || asRecord(data?.key)
  const message = asRecord(root?.message) || asRecord(data?.message)
  const messageKey = asRecord(message?.key)

  const candidates = [
    root?.fromMe,
    data?.fromMe,
    key?.fromMe,
    messageKey?.fromMe,
  ]

  return candidates.some((value) => value === true || value === 'true')
}

export function stripWhatsAppInboundMediaContent(payload: Json | null | undefined): Json | null {
  if (payload == null) return null
  if (Array.isArray(payload)) {
    return payload.map((item) => stripWhatsAppInboundMediaContent(item) as Json)
  }
  if (typeof payload !== 'object') return payload

  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => key.toLowerCase() !== 'base64')
      .map(([key, value]) => [key, stripWhatsAppInboundMediaContent(value)])
  ) as Json
}
