export function digitsOnly(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '')
}

export function getPhoneLast8(value: string | null | undefined) {
  const digits = digitsOnly(value)
  return digits.length >= 8 ? digits.slice(-8) : ''
}

export function normalizeBrazilianPhone(value: string | null | undefined) {
  let digits = digitsOnly(value)
  if (!digits) return ''

  while (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2)

  return digits.slice(-11)
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

export function phonesMatch(left: string | null | undefined, right: string | null | undefined) {
  const leftVariants = getBrazilianPhoneVariants(left)
  const rightVariants = getBrazilianPhoneVariants(right)

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

export function toEvolutionNumber(value: string | null | undefined) {
  const local = normalizeBrazilianPhone(value)
  return local ? `55${local}` : ''
}
