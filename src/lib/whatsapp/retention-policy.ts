import { getPhoneVariants } from './phone'

export function retentionPhoneVariants(phones: string[]) {
  return [...new Set(phones.flatMap((phone) => {
    const variants = getPhoneVariants(phone)
    variants.add(phone)
    // Include local variants of Brazilian numbers with and without the ninth digit.
    for (const variant of [...variants]) {
      if (variant.startsWith('55') && variant.length >= 12) variants.add(variant.slice(2))
    }
    return [...variants].filter(Boolean)
  }))]
}

export function hasProtectedRedesignHumanControl(summary: Record<string, unknown>) {
  // Preserve active/pending human summaries until the conversation flow releases them.
  return summary.customerControlMode === 'force_human'
    || summary.humanControl === 'human_pending'
    || summary.humanControl === 'human_active'
}
