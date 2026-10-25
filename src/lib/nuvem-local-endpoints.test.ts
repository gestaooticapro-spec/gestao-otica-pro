import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNuvemLocalEndpoints } from './nuvem-local-endpoints';

test('missing API configuration fails before OAuth, even with an auth override', () => {
  assert.throws(() => resolveNuvemLocalEndpoints('production', { NUVEMFISCAL_PROD_AUTH_URL: 'https://auth.nuvemfiscal.com.br/oauth/token' }));
});

test('valid local URLs retain the existing endpoints and environment isolation', () => {
  const env = { NUVEMFISCAL_PROD_URL: 'https://fiscal.example.test/', NUVEMFISCAL_HOM_URL: 'http://localhost:3333' };
  assert.deepEqual(resolveNuvemLocalEndpoints('production', env), {
    apiUrl: 'https://fiscal.example.test', authUrl: 'https://fiscal.example.test/oauth/token'
  });
  assert.equal(resolveNuvemLocalEndpoints('homologation', env).authUrl, 'http://localhost:3333/oauth/token');
});

test('public fallback, credentials in URL, cross-origin OAuth and insecure remote URLs are refused', () => {
  for (const api of ['https://api.nuvemfiscal.com.br', 'https://api.sandbox.nuvemfiscal.com.br',
    'http://fiscal.example.test', 'https://user:secret@fiscal.example.test', 'https://fiscal.example.test/#token',
    'https://fiscal.example.test/?secret=value']) {
    assert.throws(() => resolveNuvemLocalEndpoints('production', { NUVEMFISCAL_PROD_URL: api }));
  }
  for (const auth of ['https://auth.nuvemfiscal.com.br/oauth/token', 'https://fiscal.example.test/redirect',
    'https://user:secret@fiscal.example.test/oauth/token']) {
    assert.throws(() => resolveNuvemLocalEndpoints('production', {
      NUVEMFISCAL_PROD_URL: 'https://fiscal.example.test', NUVEMFISCAL_PROD_AUTH_URL: auth
    }));
  }
});
