import type { WhatsAppAutomationSettings } from '@/lib/store-modules'
import type { WhatsAppRedesignMode } from './contracts'

/** The redesign is the program default, independent of historical rollout flags. */
export function isWhatsAppFullRedesignEnabled(
  storeId: number,
  _settings?: WhatsAppAutomationSettings | null
) {
  return Number.isInteger(storeId) && storeId > 0
}

/** Store controls decide whether automatic AI attendance runs, not which engine it uses. */
export function canUseWhatsAppAiAttendance(settings: WhatsAppAutomationSettings | null | undefined) {
  return settings?.enabled !== false && settings?.ai_responder?.enabled === true
}

/** Historical shadow turns remain processable; the processor itself never sends. */
export function canProcessWhatsAppRedesignMode(storeId: number, mode: WhatsAppRedesignMode) {
  return isWhatsAppFullRedesignEnabled(storeId) && (mode === 'shadow' || mode === 'redesign')
}

export const usesWhatsAppRedesignPolicies = isWhatsAppFullRedesignEnabled
