import { getInstallmentChargeTotal, getInstallmentOutstanding, type InstallmentBalanceInput } from './installment-balance'

export type FinancialSummaryInstallment = {
  numeroParcela: number
  dataVencimento: string
  valor: number
  dataPagamento: string | null
  valorPago: number
  valorRestante: number
  valorTransferido: number
  status: string
}

const money = (value: number) => Number(value.toFixed(2))

export function toFinancialSummaryInstallment(
  installment: InstallmentBalanceInput & {
    numero_parcela: number
    data_vencimento: string
    data_pagamento?: string | null
  },
  latestPaymentDate?: string | null,
): FinancialSummaryInstallment {
  const paid = money(Number(installment.valor_pago || 0))
  return {
    numeroParcela: installment.numero_parcela,
    dataVencimento: installment.data_vencimento,
    valor: getInstallmentChargeTotal(installment),
    dataPagamento: installment.data_pagamento || (paid > 0 ? latestPaymentDate || null : null),
    valorPago: paid,
    valorRestante: getInstallmentOutstanding(installment),
    valorTransferido: money(Number(installment.valor_transferido_saida || 0) + Number(installment.valor_renegociado_saida || 0)),
    status: installment.status || 'Pendente',
  }
}

export function getFinancialSummaryInstallmentStatus(installment: FinancialSummaryInstallment) {
  if (installment.valorRestante <= 0.01) return installment.valorTransferido > 0.01 ? 'Transferido' : 'Pago'
  return installment.valorPago > 0.01 ? 'Parcial' : 'Pendente'
}

export function getFinancialSummaryInstallmentTotals(installments: FinancialSummaryInstallment[]) {
  return {
    valorPago: money(installments.reduce((sum, installment) => sum + installment.valorPago, 0)),
    valorRestante: money(installments.reduce((sum, installment) => sum + installment.valorRestante, 0)),
    parcelasPagas: installments.filter((installment) => installment.valorRestante <= 0.01).length,
    parcelasPendentes: installments.filter((installment) => installment.valorRestante > 0.01).length,
  }
}
