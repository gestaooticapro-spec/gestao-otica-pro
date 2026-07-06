export type PhoneCountry = 'BR' | 'PY'

export interface ParsedPhone {
  country: PhoneCountry
  countryCode: string  // '55' ou '595'
  localNumber: string  // número sem código do país
  fullNumber: string   // código + local (para Evolution API)
}

/**
 * Detecta o país do telefone baseado nos dígitos
 * - BR: começa com 55 ou não tem código internacional
 * - PY: começa com 595 ou começa com 09 (formato local PY)
 */
export function detectPhoneCountry(digits: string): PhoneCountry | null {
  if (!digits) return null
  if (digits.startsWith('595')) return 'PY'
  if (digits.startsWith('55') && digits.length >= 12) return 'BR'
  // Números locais paraguaios começam com 09
  if (digits.startsWith('09') && (digits.length === 10 || digits.length === 9)) return 'PY'
  // Default: assume Brasil para compatibilidade
  return 'BR'
}

export function digitsOnly(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '')
}

export function getPhoneLast8(value: string | null | undefined) {
  const digits = digitsOnly(value)
  return digits.length >= 8 ? digits.slice(-8) : ''
}

/**
 * Normaliza telefone detectando automaticamente o país
 * Preserva o código do país correto
 */
export function normalizePhone(value: string | null | undefined): ParsedPhone | null {
  let digits = digitsOnly(value)
  if (!digits) return null

  // Detecta o país ANTES de remover zeros (PY usa formato 09X...)
  const country = detectPhoneCountry(digits)

  if (country === 'PY') {
    // Remove 595 se existir para pegar número local
    let local = digits
    if (local.startsWith('595')) {
      local = local.slice(3)
    }
    // Remove zero à esquerda se existir (formato local PY: 09X...)
    while (local.startsWith('0') && local.length > 1) {
      local = local.slice(1)
    }
    // Números PY têm 9 dígitos (incluindo o 9 inicial)
    // Formato: 9XXXXXXX (9 dígitos)
    local = local.slice(-9)
    return {
      country: 'PY',
      countryCode: '595',
      localNumber: local,
      fullNumber: `595${local}`
    }
  }

  // Brasil (default/compatibilidade) - remove zeros primeiro
  while (digits.startsWith('0') && digits.length > 1) {
    digits = digits.slice(1)
  }

  let local = digits
  if (local.startsWith('55') && local.length >= 12) {
    local = local.slice(2)
  }
  // Números BR: DDD (2) + 9 opcional + telefone (8) = 10 ou 11 dígitos
  local = local.slice(-11)
  
  return {
    country: 'BR',
    countryCode: '55',
    localNumber: local,
    fullNumber: `55${local}`
  }
}

// Mantém compatibilidade com código existente que usa apenas BR
export function normalizeBrazilianPhone(value: string | null | undefined) {
  const parsed = normalizePhone(value)
  return parsed?.localNumber ?? ''
}

export function getBrazilianPhoneVariants(value: string | null | undefined) {
  const local = normalizeBrazilianPhone(value)
  const variants = new Set<string>()
  if (!local) return variants

  variants.add(local)

  if (local.length === 11 && local[2] === '9') {
    variants.add(`${local.slice(0, 2)}${local.slice(3)}`)
  } else if (local.length === 10) {
    variants.add(`${local.slice(0, 2)}9${local.slice(2)}`)
  }

  return variants
}

/**
 * Gera variantes de telefone considerando o país detectado
 * Inclui variantes com/sem o 9 para BR
 */
export function getPhoneVariants(value: string | null | undefined): Set<string> {
  const parsed = normalizePhone(value)
  const variants = new Set<string>()
  if (!parsed) return variants

  // Adiciona o número completo (código + local)
  variants.add(parsed.fullNumber)
  // Adiciona só o local
  variants.add(parsed.localNumber)

  // Variantes específicas do Brasil (com/sem 9)
  if (parsed.country === 'BR') {
    const local = parsed.localNumber
    if (local.length === 11 && local[2] === '9') {
      variants.add(`55${local.slice(0, 2)}${local.slice(3)}`)
    } else if (local.length === 10) {
      variants.add(`55${local.slice(0, 2)}9${local.slice(2)}`)
    }
  }

  return variants
}

export function phonesMatch(left: string | null | undefined, right: string | null | undefined) {
  const leftVariants = getPhoneVariants(left)
  const rightVariants = getPhoneVariants(right)

  for (const variant of leftVariants) {
    if (rightVariants.has(variant)) return true
  }

  return false
}

export function phonesMatchLast8(left: string | null | undefined, right: string | null | undefined) {
  const leftLast8 = getPhoneLast8(left)
  const rightLast8 = getPhoneLast8(right)
  return Boolean(leftLast8) && leftLast8 === rightLast8
}

/**
 * Converte telefone para formato da Evolution API
 * Agora detecta automaticamente o país e usa o código correto
 */
export function toEvolutionNumber(value: string | null | undefined): string {
  const parsed = normalizePhone(value)
  return parsed?.fullNumber ?? ''
}
