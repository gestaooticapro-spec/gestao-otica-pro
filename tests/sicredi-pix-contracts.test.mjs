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
  const client = readSource('src/lib/pix/sicredi-client.server.ts')
  const actions = readSource('src/lib/actions/pix-installment.actions.ts')
  const modal = readSource('src/components/modals/PixInstallmentChargeModal.tsx')
  const parcelas = readSource('src/components/financeiro/ParcelasInterface.tsx')
  const parcelasActions = readSource('src/lib/actions/parcelas.actions.ts')
  const webhook = readSource('src/app/api/webhooks/sicredi/pix/route.ts')
  const migration = readSource('supabase/migrations/20260818140000_sicredi_pix_automatic_settlement.sql')

  assert.match(actions, /await cancelSicrediImmediateCharge\(charge\.txid\)/)
  assert.doesNotMatch(actions, /getPixChargesForInstallments[\s\S]*?catch \{\s*return \{\}/)
  assert.match(actions, /verifyEmployeeAuthorization\(data\.authorizationToken/)
  assert.match(actions, /status: 'CREATING'/)
  assert.match(actions, /reconcileChargeWithSicredi/)
  assert.match(actions, /recoverCreatingCharge/)
  assert.match(actions, /receive_installment_payment/)
  assert.match(actions, /settlement_idempotency_key/)
  assert.match(actions, /processSicrediPixWebhookPayload/)
  assert.match(webhook, /processSicrediPixWebhookPayload/)
  assert.match(migration, /settlement_status/)
  assert.match(migration, /settlement_idempotency_key/)
  assert.match(actions, /SicrediPixHttpError.*statusCode !== 404/s)
  assert.match(client, /'GET' \| 'POST' \| 'PUT' \| 'PATCH'/)
  assert.match(client, /input\.txid \? 'PUT' : 'POST'/)
  assert.match(modal, /reconcileBeforeNewCharge/)
  assert.match(modal, /Recuperar geração/)
  assert.match(modal, /const authorizationToken = employee\.authorization_token/)
  assert.match(modal, /authorizationToken,/)
  assert.match(parcelasActions, /anexarStatusPix/)
  assert.match(parcelas, /QR Code gerado/)
  assert.match(parcelas, /Quitado por Pix Sicredi/)
})
