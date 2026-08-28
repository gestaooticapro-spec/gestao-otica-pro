import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getPixInstallmentActionLabel,
  shouldOpenExistingPixInstallmentCharge,
} from '../src/lib/pix/installment-charge-presentation'
import type { PixInstallmentCharge } from '../src/lib/actions/pix-installment.actions'

function charge(
  status: PixInstallmentCharge['status'],
  settlementStatus: PixInstallmentCharge['settlementStatus'] = 'PENDING',
): PixInstallmentCharge {
  return {
    id: 1,
    installmentId: 10,
    txid: '12345678901234567890123456',
    status,
    amount: 9,
    interestAmount: 0,
    strategy: 'quitacao_total',
    pixCopyPaste: null,
    location: null,
    expiresAt: null,
    createdAt: new Date(0).toISOString(),
    paidAt: status === 'PAID' ? new Date(0).toISOString() : null,
    settlementStatus,
    settledAt: settlementStatus === 'COMPLETED' ? new Date(0).toISOString() : null,
  }
}

test('orienta conferir pagamento quando o Pix foi pago mas a baixa esta pendente', () => {
  const pendingSettlement = charge('PAID', 'ERROR')

  assert.equal(getPixInstallmentActionLabel(pendingSettlement, 9), 'Conferir pagamento')
  assert.equal(shouldOpenExistingPixInstallmentCharge(pendingSettlement, 9), true)
})

test('permite novo QR quando a baixa anterior terminou e ainda existe saldo', () => {
  const completed = charge('PAID', 'COMPLETED')

  assert.equal(getPixInstallmentActionLabel(completed, 9), 'Gerar QR Code')
  assert.equal(shouldOpenExistingPixInstallmentCharge(completed, 9), false)
})

test('direciona estados inseguros para a cobranca existente', () => {
  assert.equal(getPixInstallmentActionLabel(charge('ERROR'), 9), 'Conferir situação')
  assert.equal(getPixInstallmentActionLabel(charge('PENDING'), 9), 'Ver Pix')
  assert.equal(shouldOpenExistingPixInstallmentCharge(charge('ERROR'), 9), true)
})
