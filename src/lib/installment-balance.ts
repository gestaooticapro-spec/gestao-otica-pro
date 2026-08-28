export type InstallmentBalanceInput = {
  status?: string | null
  valor_parcela?: number | string | null
  valor_pago?: number | string | null
  valor_transferido_entrada?: number | string | null
  valor_transferido_saida?: number | string | null
  valor_renegociado_saida?: number | string | null
}

export type InstallmentReceiptStrategy = 'quitacao_total' | 'baixa_parcial' | 'somar_proxima'

export type InstallmentReceiptPreview = {
  receivedAmount: number
  interestAmount: number
  principalAmount: number
  difference: number
  isPartial: boolean
  isOverpayment: boolean
}

const money = (value: unknown) => Number(Number(value || 0).toFixed(2))

export function getInstallmentChargeTotal(installment: InstallmentBalanceInput) {
  return money(
    Number(installment.valor_parcela || 0)
    + Number(installment.valor_transferido_entrada || 0)
  )
}

export function getInstallmentOutstanding(installment: InstallmentBalanceInput) {
  if (String(installment.status || '').trim().toLocaleLowerCase('pt-BR') === 'pago') return 0
  return Math.max(0, money(
    getInstallmentChargeTotal(installment)
    - Number(installment.valor_pago || 0)
    - Number(installment.valor_transferido_saida || 0)
    - Number(installment.valor_renegociado_saida || 0)
  ))
}

export function getInstallmentReceiptPreview(input: {
  outstanding: number
  receivedAmount: number
  interestAmount?: number
}): InstallmentReceiptPreview {
  const outstanding = money(input.outstanding)
  const receivedAmount = money(input.receivedAmount)
  const interestAmount = money(input.interestAmount)
  const principalAmount = money(receivedAmount - interestAmount)
  const difference = money(outstanding - principalAmount)

  return {
    receivedAmount,
    interestAmount,
    principalAmount,
    difference,
    isPartial: difference > 0.01,
    isOverpayment: difference < -0.01,
  }
}

export function getDefaultPartialReceiptStrategy(hasNextInstallment: boolean): Exclude<InstallmentReceiptStrategy, 'quitacao_total'> {
  return hasNextInstallment ? 'somar_proxima' : 'baixa_parcial'
}
