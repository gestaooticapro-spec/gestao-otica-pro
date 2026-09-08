import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getLensSegmentServiceUrl,
  issueLensSegmentToken,
  verifyLensSegmentToken,
} from '../src/lib/medidas/lens-segment-token'

const secret = 'lens-segment-internal-secret-for-tests-32'

test('emite token HMAC com store, exp e jti e rejeita assinatura ou prazo vencido', () => {
  const issued = issueLensSegmentToken(7, secret, 1_000_000)
  const parsed = verifyLensSegmentToken(issued.token, secret, 1_000_000)
  assert.deepEqual(parsed, { storeId: 7, exp: issued.exp, jti: issued.jti })
  assert.equal(verifyLensSegmentToken(issued.token, secret, issued.exp + 1), null)
  assert.equal(verifyLensSegmentToken(issued.token.slice(0, -2) + 'aa', secret, 1_000_000), null)
  assert.equal(verifyLensSegmentToken(issued.token, 'other-secret-other-secret-other-xx', 1_000_000), null)
})

test('aceita URL HTTPS publica e HTTP somente para desenvolvimento local', () => {
  const previous = process.env.LENS_SEGMENT_URL
  try {
    process.env.LENS_SEGMENT_URL = 'https://ia.mboptical.com.br/'
    assert.equal(getLensSegmentServiceUrl(), 'https://ia.mboptical.com.br')
    process.env.LENS_SEGMENT_URL = 'http://127.0.0.1:8090/'
    assert.equal(getLensSegmentServiceUrl(), 'http://127.0.0.1:8090')
    process.env.LENS_SEGMENT_URL = 'http://ia.mboptical.com.br'
    assert.equal(getLensSegmentServiceUrl(), null)
  } finally {
    if (previous === undefined) delete process.env.LENS_SEGMENT_URL
    else process.env.LENS_SEGMENT_URL = previous
  }
})
