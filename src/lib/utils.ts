// Caminho: src/lib/utils.ts

export const formatCurrency = (value: number | null | undefined): string => {
  return (value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/**
 * Formats a phone number for WhatsApp and returns a full wa.me URL.
 * Handles international numbers (prefixed with +) and Brazilian numbers.
 * - If the raw phone starts with '+', strips the '+' and uses remaining digits (already has country code).
 * - Otherwise, strips non-digits. If the result is shorter than 12 digits, prepends '55' (Brazil).
 */
export function getWhatsAppLink(phone: string, message?: string): string {
  const raw = phone.trim()
  let digits: string

  if (raw.startsWith('+')) {
    digits = raw.replace(/\D/g, '')
  } else {
    digits = raw.replace(/\D/g, '')
    if (digits.length < 12) {
      digits = `55${digits}`
    }
  }

  const base = `https://wa.me/${digits}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}