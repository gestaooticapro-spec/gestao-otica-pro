export type PhoneCountry = 'PY' | 'BR'

export function detectPhoneCountry(digits: string): PhoneCountry {
  if (digits.startsWith('595')) return 'PY'
  if (digits.startsWith('09') && digits.length <= 10) return 'PY'
  return 'BR'
}

export function maskPhone(value: string, normalize = false) {
  const hasPlus = value.trimStart().startsWith('+')
  let digits = value.replace(/\D/g, '')
  if (!digits) return ''

  const country = hasPlus ? (digits.startsWith('595') ? 'PY' : 'BR') : detectPhoneCountry(digits)

  if (country === 'PY') {
    if (digits.startsWith('0')) digits = '595' + digits.substring(1)
    if (!digits.startsWith('595')) digits = '595' + digits

    return ('+' + digits
      .replace(/^(595)(\d)/, '$1 $2')
      .replace(/^(595 \d{3})(\d)/, '$1 $2')
      .replace(/^(595 \d{3} \d{3})(\d)/, '$1 $2')
    ).substring(0, 16)
  }

  if (normalize) {
    if (digits.length === 8) digits = '449' + digits
    else if (digits.length === 10) digits = digits.slice(0, 2) + '9' + digits.slice(2)
  }

  return digits
    .replace(/^(\d{2})(\d)/g, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .substring(0, 15)
}
