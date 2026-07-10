import assert from 'node:assert/strict'
import { describeOpenOs } from '../src/lib/whatsapp/os-status'
import {
  getBrazilianPhoneVariants,
  phonesMatch,
  toEvolutionNumber,
  normalizePhone,
  detectPhoneCountry,
} from '../src/lib/whatsapp/phone'

// Testes BR (existentes)
assert.equal(toEvolutionNumber('(11) 99999-1234'), '5511999991234')
assert.equal(toEvolutionNumber('+55 11 99999-1234'), '5511999991234')
assert.equal(phonesMatch('5511999991234', '11999991234'), true)
assert.equal(phonesMatch('5511999991234', '1199991234'), true)
assert.equal(phonesMatch('5511999991234', '21999991234'), false)
assert.deepEqual(
  [...getBrazilianPhoneVariants('5511999991234')].sort(),
  ['1199991234', '11999991234']
)

// Testes PY (novos - Paraguai)
console.log('\n=== Testes Paraguai ===')

// Detectar país
assert.equal(detectPhoneCountry('595991234567'), 'PY')
assert.equal(detectPhoneCountry('0991234567'), 'PY')
assert.equal(detectPhoneCountry('5511999991234'), 'BR')

// Normalizar número PY
const pyParsed = normalizePhone('+595 991 234 567')
assert.deepEqual(pyParsed, {
  country: 'PY',
  countryCode: '595',
  localNumber: '991234567',
  fullNumber: '595991234567'
})

// toEvolutionNumber deve preservar código PY
assert.equal(toEvolutionNumber('+595991234567'), '595991234567')
assert.equal(toEvolutionNumber('0991234567'), '595991234567')  // formato local PY
assert.equal(toEvolutionNumber('(099) 1234-567'), '595991234567')  // formatado

// phonesMatch deve funcionar entre formatos PY
assert.equal(phonesMatch('+595991234567', '0991234567'), true)
assert.equal(phonesMatch('595991234567', '991234567'), true)

// Não deve confundir BR com PY
assert.equal(phonesMatch('595991234567', '5511999991234'), false)

console.log('✅ Todos os testes passaram (BR + PY)')

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
