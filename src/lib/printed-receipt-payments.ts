type ReceiptPaymentId = {
  id: number
}

// A pagina impressa soma os pagamentos recebidos na URL. Quando o recebimento
// se divide entre parcelas, o recibo precisa de todos os pagamentos da mesma
// operacao. A baixa de cada parcela permanece como foi registrada.
export function printedReceiptPaymentIds(input: {
  installmentPayments: ReceiptPaymentId[]
  operationPayments: ReceiptPaymentId[] | null
}) {
  const rows = input.operationPayments && input.operationPayments.length > 0
    ? input.operationPayments
    : input.installmentPayments
  return rows
    .map((payment) => Number(payment.id))
    .filter((id) => Number.isInteger(id) && id > 0)
}
