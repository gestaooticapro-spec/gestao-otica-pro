const SICREDI_PILOT_CNPJ = '23758870000120'

export function normalizeCnpj(value: string | null | undefined) {
  return String(value || '').replace(/\D/g, '')
}

export function isSicrediPilotStoreCnpj(cnpj: string | null | undefined) {
  return normalizeCnpj(cnpj) === SICREDI_PILOT_CNPJ
}
