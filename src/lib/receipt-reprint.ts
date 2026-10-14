type ReceiptStampPayment = {
  parcela_id?: number | null
  receipt_printed_at?: string | null
}

// A folha e unica. Ela sai sem carimbo somente quando todos os pagamentos
// sao da venda e nenhum deles ja foi impresso. Parcela, ou pagamento ja
// impresso, carimba a folha inteira.
export function shouldStampGroupedReceipt(payments: ReceiptStampPayment[]) {
  return payments.some((payment) => payment.parcela_id != null || payment.receipt_printed_at != null)
}
