import assert from 'node:assert/strict'
import test from 'node:test'
import {
  escapeAccountantCsvCell,
  escapeAccountantEmailHtml,
  getAccountantClosingPeriodBounds,
  getAccountantXmlFileName,
} from '../src/lib/accounting/monthly-closing'

test('apura o mês contábil no fuso de São Paulo', () => {
  assert.deepEqual(getAccountantClosingPeriodBounds(2026, 2), {
    start: '2026-02-01T03:00:00.000Z',
    end: '2026-03-01T03:00:00.000Z',
  })
})

test('neutraliza fórmulas em valores de CSV', () => {
  assert.equal(escapeAccountantCsvCell('=HYPERLINK("https://example.com")'), `"'=HYPERLINK(""https://example.com"")"`)
  assert.equal(escapeAccountantCsvCell('+123'), "'+123")
  assert.equal(escapeAccountantCsvCell('texto;completo'), '"texto;completo"')
})

test('gera nome de XML sem colisão entre modelo e série', () => {
  assert.equal(getAccountantXmlFileName({
    id: 10,
    tipo_documento: 'NFCe',
    direction: 'output',
    serie: '2',
    numero: '123',
    chave_acesso: null,
  }), 'NFCe_output_S2_123')
})

test('escapa dados da loja no HTML do e-mail', () => {
  assert.equal(escapeAccountantEmailHtml('<Loja & Filhos>'), '&lt;Loja &amp; Filhos&gt;')
})
