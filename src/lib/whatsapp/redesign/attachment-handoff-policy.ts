type Outbound = {
  message_type: string
  status: string
  created_at: string
  inbound_message_id: number | null
  payload: unknown
}

/** A later file continues an existing handoff; it does not require another introduction. */
export function shouldSuppressAttachmentHandoff(input: {
  latestOutbound: Outbound | null
  inboundId: number
  forceAi: boolean
  now: string
}) {
  const row = input.latestOutbound
  if (!row || input.forceAi || row.inbound_message_id === input.inboundId
    || !['pending', 'sending', 'sent'].includes(row.status)) return false
  const elapsed = Date.parse(input.now) - Date.parse(row.created_at)
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 48 * 3600000) return false
  const payload = row.payload as { canonical?: { action?: string } } | null
  return ['human_handoff', 'attachment_handoff'].includes(row.message_type)
    || ['human_handoff', 'repeat_handoff', 'acknowledge_attachment'].includes(payload?.canonical?.action ?? '')
}
