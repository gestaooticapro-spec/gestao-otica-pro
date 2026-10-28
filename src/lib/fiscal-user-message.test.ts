import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatFiscalUserMessage } from './fiscal-user-message';

test('communication failure does not claim rejection or recommend a blind reissue', () => {
  for (const detail of ['ECONNRESET', 'ETIMEDOUT', 'fetch failed', 'Tempo esgotado', 'gateway timeout']) {
    const message = formatFiscalUserMessage(detail);
    assert.ok(message.includes('ainda não foi confirmado'));
    assert.ok(message.includes('Consulte esta nota'));
    assert.ok(!message.includes('A nota não foi autorizada'));
  }
});

test('actual fiscal messages are preserved, and technical detail is optional', () => {
  assert.equal(formatFiscalUserMessage('Rejeição: CNPJ inválido'), 'Rejeição: CNPJ inválido');
  assert.ok(formatFiscalUserMessage('ECONNRESET', { includeTechnicalDetail: true }).endsWith('ECONNRESET'));
});
