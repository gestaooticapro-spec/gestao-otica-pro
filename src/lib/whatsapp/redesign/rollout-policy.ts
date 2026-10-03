import type { WhatsAppAutomationSettings } from '@/lib/store-modules'
import type { WhatsAppRedesignMode } from './contracts'

/** Full routing is deliberately restricted to the first production store. */
export function isStoreOneFullRedesignEnabled(
  storeId: number,
  settings: WhatsAppAutomationSettings | null | undefined
) {
  return storeId === 1 && settings?.ai_redesign?.mode === 'redesign'
    && settings.ai_redesign.safe_replies_enabled === true
}

/** Both modes compute decisions; only the inbound orchestrator sends replies. */
export function canProcessWhatsAppRedesignMode(storeId: number, mode: WhatsAppRedesignMode) {
  return mode === 'shadow' || (storeId === 1 && mode === 'redesign')
}
