export type CustomerLinkEvidence = 'phone_match' | 'status_lookup' | 'identifier_lookup' | 'manual'

/** An OS lookup identifies its owner, not necessarily the WhatsApp sender. */
export function shouldPersistCustomerLink(
  storeId: number,
  evidence: CustomerLinkEvidence,
  hasCanonicalPhoneMatch = false
) {
  if (storeId !== 1) return true
  return evidence === 'manual' || (evidence === 'phone_match' && hasCanonicalPhoneMatch)
}
