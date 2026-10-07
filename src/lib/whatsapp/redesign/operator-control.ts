import type { WhatsAppConversationIdentity } from './persistence'
import { WhatsAppRedesignConversationStore } from './store'

type OperatorControlStore = Pick<WhatsAppRedesignConversationStore, 'getOrCreateConversation' | 'recordControlEvent'>

export async function releaseHumanPauseForNextAi(input: {
  identity: WhatsAppConversationIdentity
  occurredAt: string
  eventKey: string
  actor: string
}, store: OperatorControlStore = new WhatsAppRedesignConversationStore()) {
  if (input.identity.mode === 'legacy') return
  const conversation = await store.getOrCreateConversation(input.identity)
  // A persisted release wins over earlier confirmed human activity when the
  // next turn reconstructs its memory, including equivalent phone formats.
  await store.recordControlEvent({
    conversationId: conversation.id,
    eventKey: input.eventKey,
    action: 'release',
    occurredAt: input.occurredAt,
    actor: input.actor,
    reason: 'operator_force_ai_next',
  })
}
