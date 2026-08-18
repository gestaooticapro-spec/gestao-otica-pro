import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Sicredi Pix permanece limitado ao ambiente de homologacao', () => {
  const source = readSource('src/lib/pix/sicredi-client.server.ts')

  assert.match(source, /const DEFAULT_HML_BASE_URL = 'https:\/\/api-pix-h\.sicredi\.com\.br'/)
  assert.match(source, /normalizedConfiguredUrl !== DEFAULT_HML_BASE_URL/)
  assert.match(source, /baseUrl: new URL\(DEFAULT_HML_BASE_URL\)/)
  assert.doesNotMatch(source, /process\.env\.client_id/)
  assert.doesNotMatch(source, /process\.env\.client_secret/)
})

test('cobranca Pix exige autorizacao, evita duplicidade e confere o Sicredi antes de recriar', () => {
  const actions = readSource('src/lib/actions/pix-installment.actions.ts')
  const modal = readSource('src/components/modals/PixInstallmentChargeModal.tsx')

  assert.match(actions, /await cancelSicrediImmediateCharge\(charge\.txid\)/)
  assert.doesNotMatch(actions, /getPixChargesForInstallments[\s\S]*?catch \{\s*return \{\}/)
  assert.match(actions, /verifyEmployeeAuthorization\(data\.authorizationToken/)
  assert.match(actions, /status: 'CREATING'/)
  assert.match(actions, /reconcileChargeWithSicredi/)
  assert.match(modal, /reconcileBeforeNewCharge/)
  assert.match(modal, /const authorizationToken = employee\.authorization_token/)
  assert.match(modal, /authorizationToken,/)
})
