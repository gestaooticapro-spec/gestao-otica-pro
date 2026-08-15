import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { getInstallmentChargeTotal, getInstallmentOutstanding } from '../src/lib/installment-balance'

test('baixa parcial mantem o restante na parcela atual', () => {
  const installment = { valor_parcela: 120, valor_pago: 100 }
  assert.equal(getInstallmentChargeTotal(installment), 120)
  assert.equal(getInstallmentOutstanding(installment), 20)
})

test('saldo transferido encerra a origem e aumenta a cobranca seguinte', () => {
  const origin = {
    valor_parcela: 120,
    valor_pago: 100,
    valor_transferido_saida: 20,
  }
  const destination = {
    valor_parcela: 120,
    valor_pago: 0,
    valor_transferido_entrada: 20,
  }

  assert.equal(getInstallmentOutstanding(origin), 0)
  assert.equal(getInstallmentChargeTotal(destination), 140)
  assert.equal(getInstallmentOutstanding(destination), 140)
})

test('uma parcela com saldo recebido pode transferir novo restante sem alterar o nominal', () => {
  const installment = {
    valor_parcela: 120,
    valor_pago: 100,
    valor_transferido_entrada: 20,
    valor_transferido_saida: 40,
  }

  assert.equal(getInstallmentChargeTotal(installment), 140)
  assert.equal(getInstallmentOutstanding(installment), 0)
})

test('parcela legada marcada como paga nunca volta a ser cobrada por valor_pago ausente', () => {
  assert.equal(getInstallmentOutstanding({
    status: 'Pago',
    valor_parcela: 120,
    valor_pago: null,
  }), 0)
})

test('saldo encerrado por renegociacao nao volta a ser cobrado na parcela antiga', () => {
  assert.equal(getInstallmentOutstanding({
    valor_parcela: 120,
    valor_pago: 80,
    valor_renegociado_saida: 40,
  }), 0)
})

test('migration financeira remove acesso direto de anon e authenticated', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260815130000_secure_installment_rpcs_and_cancelled_sales.sql', import.meta.url),
    'utf8'
  )

  assert.match(sql, /receive_installment_payment[\s\S]+from anon/i)
  assert.match(sql, /receive_installment_payment[\s\S]+from authenticated/i)
  assert.match(sql, /receive_installment_payment_internal[\s\S]+from service_role/i)
})

test('migration bloqueia venda cancelada e estorno de conciliacao legada no banco', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260815130000_secure_installment_rpcs_and_cancelled_sales.sql', import.meta.url),
    'utf8'
  )

  assert.match(sql, /reject_cancelled_sale_financial_entry/i)
  assert.match(sql, /strategy = 'legacy_reconciliation'/i)
  assert.match(sql, /jsonb_typeof\(v_operation\.installments_before\) <> 'array'/i)
})

test('migration protege estorno anterior a renegociacao e serializa a baixa pelo carne', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260815152000_protect_renegotiation_reversals_and_locking.sql', import.meta.url),
    'utf8'
  )

  assert.match(sql, /installment_renegotiations[\s\S]+created_at > v_operation\.created_at/i)
  assert.match(sql, /rename to receive_installment_payment_core/i)
  assert.match(sql, /from public\.financiamento_loja[\s\S]+for update/i)
})

test('migration protege e serializa tambem o estorno legado', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260815153000_lock_and_protect_all_installment_reversals.sql', import.meta.url),
    'utf8'
  )

  assert.match(sql, /reverse_legacy_exact_installment_receipt_internal/i)
  assert.match(sql, /installment_renegotiations[\s\S]+r\.created_at::date >= coalesce\(v_payment_date, current_date\)/i)
  assert.match(sql, /reverse_installment_receipt_operation[\s\S]+financiamento_loja[\s\S]+for update/i)
})
