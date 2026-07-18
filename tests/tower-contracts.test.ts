import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractTowerAssetEnrollment,
  normalizeTowerAssetFallbackCode,
  normalizeTowerAssetPublicCode,
} from '../src/lib/tower/asset-enrollment-contract'
import {
  extractTowerActivationSecret,
  normalizeTowerFallbackCode,
} from '../src/lib/tower/device-activation-contract'
import { hashTowerAdminPin, verifyTowerAdminPin } from '../src/lib/tower-admin-pin'

const token = 'A'.repeat(43)

test('extrai ativacao por QR sem aceitar prefixo ou tamanho incorretos', () => {
  assert.equal(extractTowerActivationSecret('qr', `MBTOWER:1:${token}`), token)
  assert.equal(extractTowerActivationSecret('qr', `MBTOWER:2:${token}`), null)
  assert.equal(extractTowerActivationSecret('qr', 'MBTOWER:1:curto'), null)
})

test('normaliza codigo alternativo sem caracteres ambiguos', () => {
  assert.equal(normalizeTowerFallbackCode('abcd efgh'), 'ABCD-EFGH')
  assert.equal(normalizeTowerFallbackCode('ABOI-1234'), 'AB23-4')
  assert.equal(extractTowerActivationSecret('code', 'abcd-efgh'), 'ABCD-EFGH')
})

test('extrai registro fisico somente quando tower_id e segredo coincidem com o contrato', () => {
  const publicCode = 'MBT-2026-000001'
  const payload = `MBTOWER-ASSET:1:${publicCode}:${token}`
  assert.deepEqual(extractTowerAssetEnrollment('qr', '', payload), {
    publicCode,
    secret: token,
  })
  assert.deepEqual(extractTowerAssetEnrollment('code', ' mbt-2026-000001 ', 'abcd-efgh'), {
    publicCode,
    secret: 'ABCD-EFGH',
  })
  assert.equal(extractTowerAssetEnrollment('code', 'MBT-2026-1', 'ABCD-EFGH'), null)
  assert.equal(normalizeTowerAssetPublicCode(' mbt-2026-000001 '), publicCode)
  assert.equal(normalizeTowerAssetFallbackCode('abcd efgh'), 'ABCD-EFGH')
})

test('PIN administrativo usa hash com salt e rejeita PIN incorreto', () => {
  const hash = hashTowerAdminPin('123456')
  assert.match(hash, /^scrypt\$/)
  assert.equal(verifyTowerAdminPin('123456', hash), true)
  assert.equal(verifyTowerAdminPin('654321', hash), false)
})
