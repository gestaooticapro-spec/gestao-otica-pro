import type { PixInstallmentCharge } from '@/lib/actions/pix-installment.actions'

export function getPixInstallmentActionLabel(
  charge: PixInstallmentCharge | undefined,
  outstanding: number,
) {
  if (!charge) return 'Gerar QR Code'
  if (charge.status === 'PENDING') return 'Ver Pix'
  if (charge.status === 'PAID' && charge.settlementStatus !== 'COMPLETED') return 'Conferir pagamento'
  if (charge.status === 'PAID') return outstanding > 0.01 ? 'Gerar QR Code' : 'Pagamento concluído'
  if (charge.status === 'CREATING') return 'Verificar geração'
  if (charge.status === 'ERROR' || charge.status === 'DIVERGENT') return 'Conferir situação'
  if (charge.status === 'EXPIRED' || charge.status === 'CANCELLED') return 'Gerar novo QR Code'
  return 'Gerar QR Code'
}

export function shouldOpenExistingPixInstallmentCharge(
  charge: PixInstallmentCharge | undefined,
  outstanding: number,
) {
  if (!charge) return false
  return !(charge.status === 'PAID' && charge.settlementStatus === 'COMPLETED' && outstanding > 0.01)
}
