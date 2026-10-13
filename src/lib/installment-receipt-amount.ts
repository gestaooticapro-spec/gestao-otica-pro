type ReceiptPaymentAmount = {
  valor_pago: number | null
}

// O recibo impresso soma todos os pagamentos do recebimento. O PDF do
// WhatsApp usa a mesma soma. A distribuicao entre parcelas nao muda aqui.
export function installmentReceiptAmount(input: {
  installmentPayments: ReceiptPaymentAmount[]
  operationPayments: ReceiptPaymentAmount[] | null
  installmentFallbackAmount: number
}) {
  const rows = input.operationPayments && input.operationPayments.length > 0
    ? input.operationPayments
    : input.installmentPayments
  const amount = rows.length > 0
    ? rows.reduce((total, payment) => total + Number(payment.valor_pago || 0), 0)
    : Number(input.installmentFallbackAmount || 0)
  return Number(amount.toFixed(2))
}
