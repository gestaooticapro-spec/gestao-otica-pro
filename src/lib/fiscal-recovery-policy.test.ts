import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideFiscalRecoveryTransition as decide, type FiscalRecoveryCurrent, type FiscalRecoveryResult, type FiscalRecoveryScope } from './fiscal-recovery-policy';

const scope: FiscalRecoveryScope = { organizationId: 'test-org', storeId: 1, cnpj: '12345678000195',
  environment: 'production', model: '65', series: 2 };
const current: FiscalRecoveryCurrent = { ...scope, documentId: 'doc', originId: 'sale', number: 123, version: 1, status: 'processing' };
const authorized: FiscalRecoveryResult = { ...current, version: 2, status: 'authorized', protocol: '141260000000001',
  origin: 'sefaz', code: '100', evidence: 'authorization_verified', sendState: 'possibly_sent' };

test('verified authorization applies exactly once; old/duplicate responses do not regress', () => {
  const result = decide(scope, current, authorized);
  assert.equal(result.apply, true);
  if (!result.apply) return;
  assert.equal(result.status, 'authorized');
  assert.equal(result.pending, false);
  const saved = { ...current, status: result.status, version: result.version };
  assert.deepEqual(decide(scope, saved, authorized), { apply: false, reason: 'stale' });
  assert.equal(decide(scope, saved, { ...authorized, version: 3, status: 'processing', origin: 'transport' }).apply, false);
});

test('store, tenant, series, model, environment, origin and document are all fenced', () => {
  for (const delta of [{ storeId: 2 }, { organizationId: 'other' }, { series: 3 }, { model: '55' },
    { environment: 'homologation' }, { originId: 'other' }, { documentId: 'other' }, { number: 124 }]) {
    assert.equal(decide(scope, current, { ...authorized, ...delta } as FiscalRecoveryResult).apply, false);
  }
});

test('timeout and 217/204/539 remain pending and preserve reservation', () => {
  for (const code of ['TIMEOUT', '217', '204', '539']) {
    const result = decide(scope, current, { ...authorized, status: 'rejected', code,
      evidence: code === 'TIMEOUT' ? 'none' : 'rejection_verified', origin: code === 'TIMEOUT' ? 'transport' : 'sefaz' });
    assert.equal(result.apply, true);
    if (!result.apply) continue;
    assert.equal(result.status, 'processing');
    assert.equal(result.pending, true);
    assert.equal(result.keepReservation, true);
  }
});

test('internal validation only stops queries with positive before-send evidence', () => {
  const local: FiscalRecoveryResult = { ...authorized, status: 'blocked_local', origin: 'central',
    evidence: 'before_send', sendState: 'not_started_proven', protocol: null, code: 'XSD_INVALID' };
  const proven = decide(scope, current, local);
  assert.equal(proven.apply && proven.status, 'blocked_local');
  assert.equal(proven.apply && proven.pending, false);
  assert.equal(proven.apply && proven.keepReservation, true);
  const uncertain = decide(scope, current, { ...local, sendState: 'possibly_sent' });
  assert.equal(uncertain.apply && uncertain.status, 'processing');
  assert.equal(uncertain.apply && uncertain.keepReservation, true);
});

test('a central error label or an unverified protocol cannot create authorization', () => {
  assert.equal(decide(scope, current, { ...authorized, origin: 'central' }).apply, false);
  assert.equal(decide(scope, current, { ...authorized, protocol: null }).apply, false);
  assert.equal(decide(scope, current, { ...authorized, evidence: 'none' }).apply, false);
});
