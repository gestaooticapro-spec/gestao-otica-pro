export type InstallmentBalanceInput = {
  status?: string | null
  valor_parcela?: number | string | null
  valor_pago?: number | string | null
  valor_transferido_entrada?: number | string | null
  valor_transferido_saida?: number | string | null
  valor_renegociado_saida?: number | string | null
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
