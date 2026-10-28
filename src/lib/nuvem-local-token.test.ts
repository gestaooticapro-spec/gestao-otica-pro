import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNuvemLocalToken } from './nuvem-local';

test('OAuth never reaches the public service and cached tokens cannot bypass missing configuration', async () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://fiscal.example.test/oauth/token');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    return new Response(JSON.stringify({ access_token: 'test-only-token', expires_in: 3600 }), { status: 200 });
  };
  try {
    process.env.NUVEMFISCAL_PROD_CLIENT_ID = 'test-client';
    process.env.NUVEMFISCAL_PROD_CLIENT_SECRET = 'test-secret';
    delete process.env.NUVEMFISCAL_PROD_URL;
    delete process.env.NUVEMFISCAL_PROD_AUTH_URL;
    await assert.rejects(() => getNuvemLocalToken('production', 'nfe'), /Configure/);
    assert.equal(calls, 0);
    process.env.NUVEMFISCAL_PROD_URL = 'https://fiscal.example.test';
    assert.equal(await getNuvemLocalToken('production', 'nfe'), 'test-only-token');
    assert.equal(await getNuvemLocalToken('production', 'nfe'), 'test-only-token');
    assert.equal(calls, 1);
    delete process.env.NUVEMFISCAL_PROD_URL;
    await assert.rejects(() => getNuvemLocalToken('production', 'nfe'), /Configure/);
    process.env.NUVEMFISCAL_PROD_URL = 'https://api.nuvemfiscal.com.br';
    await assert.rejects(() => getNuvemLocalToken('production', 'nfe'), /Destino/);
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});
