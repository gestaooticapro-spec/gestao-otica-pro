export type CustomerPersonType = 'PF' | 'PJ'

export function documentDigits(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '')
}

export function isValidCpf(value?: string | null) {
  const cpf = documentDigits(value)
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  let sum = 0
  for (let index = 0; index < 9; index++) sum += Number(cpf[index]) * (10 - index)
  let digit = 11 - (sum % 11)
  if (digit >= 10) digit = 0
  if (digit !== Number(cpf[9])) return false
  sum = 0
  for (let index = 0; index < 10; index++) sum += Number(cpf[index]) * (11 - index)
  digit = 11 - (sum % 11)
  if (digit >= 10) digit = 0
  return digit === Number(cpf[10])
}

export function isValidCnpj(value?: string | null) {
  const cnpj = documentDigits(value)
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false
  const calculate = (length: number) => {
    let sum = 0
    let weight = length - 7
    for (let index = 0; index < length; index++) {
      sum += Number(cnpj[index]) * weight--
      if (weight < 2) weight = 9
    }
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }
  return calculate(12) === Number(cnpj[12]) && calculate(13) === Number(cnpj[13])
}

export function maskCpfCnpj(value?: string | null) {
  const digits = documentDigits(value).slice(0, 14)
  if (digits.length <= 11) {
    return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}

export function customerDocument(customer: { person_type?: string | null; cpf?: string | null; cnpj?: string | null }) {
  return customer.person_type === 'PJ' ? documentDigits(customer.cnpj) : documentDigits(customer.cpf)
}

export function customerDocumentLabel(personType?: string | null) {
  return personType === 'PJ' ? 'CNPJ' : 'CPF'
}
