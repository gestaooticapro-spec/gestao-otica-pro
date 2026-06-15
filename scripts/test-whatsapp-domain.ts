import assert from 'node:assert/strict'
import { describeOpenOs } from '../src/lib/whatsapp/os-status'
import {
  getBrazilianPhoneVariants,
  phonesMatch,
  toEvolutionNumber,
} from '../src/lib/whatsapp/phone'

assert.equal(toEvolutionNumber('(11) 99999-1234'), '5511999991234')
assert.equal(toEvolutionNumber('+55 11 99999-1234'), '5511999991234')
assert.equal(phonesMatch('5511999991234', '11999991234'), true)
assert.equal(phonesMatch('5511999991234', '1199991234'), true)
assert.equal(phonesMatch('5511999991234', '21999991234'), false)
assert.deepEqual(
  [...getBrazilianPhoneVariants('5511999991234')].sort(),
  ['1199991234', '11999991234']
)

const baseOs = {
  id: 10,
  created_at: '2026-06-15T12:00:00.000Z',
  dependente_name: 'João da Silva',
  dt_pedido_em: null,
  dt_lente_chegou: null,
  dt_montado_em: null,
  armacao_com_cliente: false,
}

assert.equal(describeOpenOs('Maria Souza', baseOs).statusCode, 'preparing')
assert.equal(
  describeOpenOs('Maria Souza', { ...baseOs, dt_pedido_em: '2026-06-15' }).statusCode,
  'at_lab'
)
assert.equal(
  describeOpenOs('Maria Souza', { ...baseOs, dt_lente_chegou: '2026-06-15' }).statusCode,
  'lens_arrived_assembling'
)
assert.equal(
  describeOpenOs('Maria Souza', {
    ...baseOs,
    dt_lente_chegou: '2026-06-15',
    armacao_com_cliente: true,
  }).statusCode,
  'lens_arrived_needs_frame'
)
assert.equal(
  describeOpenOs('Maria Souza', { ...baseOs, dt_montado_em: '2026-06-15' }).statusCode,
  'ready_for_pickup'
)

console.log('WhatsApp domain tests passed.')
