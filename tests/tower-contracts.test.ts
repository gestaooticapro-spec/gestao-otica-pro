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
import { normalizeTowerRemoteConfig } from '../src/lib/tower/remote-config'
import { createAdminClient } from '../src/lib/supabase/admin'

const token = 'A'.repeat(43)

test('cliente administrativo sem cache encaminha no-store para o Supabase', async (t) => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  const previousFetch = globalThis.fetch
  let receivedCache: RequestCache | undefined

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  globalThis.fetch = (async (_input, init) => {
    receivedCache = init?.cache
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
    if (previousServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole
    globalThis.fetch = previousFetch
  })

  const { error } = await createAdminClient({ noStore: true })
    .from('global_catalog_versions')
    .select('id')

  assert.equal(error, null)
  assert.equal(receivedCache, 'no-store')
})

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

test('configuracao remota herda experiencias antigas e aplica defaults versionados', () => {
  const config = normalizeTowerRemoteConfig({
    tower_experiences: {
      visagismo: false,
      campo_visual: true,
      medidas: false,
      informacoes_uteis: true,
    },
  })

  assert.equal(config.version, 1)
  assert.equal(config.experiences.visagismo, false)
  assert.equal(config.experiences.medidas, false)
  assert.equal(config.information.comparativoCampos, true)
  assert.equal(config.commercial.mode, 'consultive')
})

test('configuracao remota limita textos e ignora tipos invalidos', () => {
  const config = normalizeTowerRemoteConfig({
    tower_remote_config: {
      commercial: {
        mode: 'campaign',
        headline: '  Campanha da loja  ',
        supportingText: 123,
        offerText: 'x'.repeat(300),
      },
      interface: { mostrarConfiguracoes: false },
    },
  })

  assert.equal(config.commercial.headline, 'Campanha da loja')
  assert.equal(config.commercial.offerText.length, 240)
  assert.equal(config.interface.mostrarConfiguracoes, false)
  assert.match(config.commercial.supportingText, /Escolha como deseja/)
})
