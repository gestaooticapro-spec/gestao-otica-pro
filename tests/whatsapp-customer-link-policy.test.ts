import assert from 'node:assert/strict'
import test from 'node:test'
import { findUniqueCustomerPhoneMatch } from '../src/lib/whatsapp/phone'
import { shouldPersistCustomerLink } from '../src/lib/whatsapp/customer-link-policy'

test('consultar uma OS ou identificador nao vincula o titular ao telefone do remetente', () => {
  assert.equal(shouldPersistCustomerLink(1, 'status_lookup', true), false)
  assert.equal(shouldPersistCustomerLink(1, 'identifier_lookup', true), false)
})

test('vinculo automatico exige telefone correspondente e operador pode confirmar manualmente', () => {
  assert.equal(shouldPersistCustomerLink(1, 'phone_match', true), true)
  assert.equal(shouldPersistCustomerLink(1, 'phone_match', false), false)
  assert.equal(shouldPersistCustomerLink(1, 'manual'), true)
})

test('a Loja 1 conserva a regra de identidade legada das outras lojas', () => {
  assert.equal(shouldPersistCustomerLink(2, 'status_lookup'), true)
  assert.equal(shouldPersistCustomerLink(2, 'identifier_lookup'), true)
})

test('reconhece JID brasileiro sem o nono digito como variante do telefone cadastrado', () => {
  const jaime = { id: 2755, full_name: 'JAIME RODRIGUES JUNIOR', fone_movel: '44999261487' }
  assert.equal(findUniqueCustomerPhoneMatch('554499261487', [jaime]), jaime)
})

test('nao associa cliente apenas por coincidencia dos ultimos oito digitos', () => {
  const unrelated = { id: 7, full_name: 'OUTRA PESSOA', fone_movel: '11999261487' }
  assert.equal(findUniqueCustomerPhoneMatch('554499261487', [unrelated]), null)
})

test('nao escolhe arbitrariamente entre cadastros com o mesmo telefone', () => {
  const first = { id: 1, fone_movel: '44999261487' }
  const second = { id: 2, phone: '5544999261487' }
  assert.equal(findUniqueCustomerPhoneMatch('554499261487', [first, second]), null)
})
