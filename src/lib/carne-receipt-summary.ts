import { getInstallmentOutstanding, type InstallmentBalanceInput } from '@/lib/installment-balance'

export type CarneReceiptSummary = {
  contractAmount: number
  paidAmount: number
  remainingAmount: number
}

const money = (value: number) => Number(value.toFixed(2))

// Valor do contrato e o carnê formalizado. Valor pago soma o dinheiro
// recebido nas parcelas. Ainda falta usa o saldo efetivo de cada parcela,
// o mesmo calculo da baixa, sem tratar transferencia como novo pagamento.
export function buildCarneReceiptSummary(input: {
  contractAmount: number
  installments: InstallmentBalanceInput[]
}): CarneReceiptSummary {
  const paidAmount = input.installments.reduce(
    (total, installment) => total + Number(installment.valor_pago || 0),
    0,
  )
  const remainingAmount = input.installments.reduce(
    (total, installment) => total + getInstallmentOutstanding(installment),
    0,
  )
  return {
    contractAmount: money(Number(input.contractAmount || 0)),
    paidAmount: money(paidAmount),
    remainingAmount: money(remainingAmount),
  }
}
