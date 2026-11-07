/** Valida o pagamento integral da Venda Expressa em centavos. */
export function getExpressPaymentError(total: number, paid: number): string | null {
  const totalCents = Math.round(total * 100)
  const paidCents = Math.round(paid * 100)
  if (!Number.isFinite(total) || !Number.isSafeInteger(totalCents) || totalCents <= 0) {
    return 'Total da venda inválido. Confira a cesta.'
  }
  if (!Number.isFinite(paid) || !Number.isSafeInteger(paidCents) || paidCents <= 0) {
    return 'Valor pago inválido.'
  }
  if (paidCents < totalCents) {
    return 'O valor pago não pode ser inferior ao total da Venda Expressa. Para pagamento parcial, use a Venda Experimental.'
  }
  if (paidCents > totalCents) {
    return 'O valor pago não pode superar o total da Venda Expressa. Registre somente o valor líquido, após devolver o troco.'
  }
  return null
}
