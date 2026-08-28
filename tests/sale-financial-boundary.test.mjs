import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const migration = readSource('supabase/migrations/20260828193000_exclude_installment_payments_from_sale_balance.sql')
const summary = readSource('src/components/vendas/ResumoFinanceiro.tsx')
const regularSale = readSource('src/components/vendas/VendaInterface.tsx')
const experimentalSale = readSource('src/components/vendas/VendaInterfaceExperimental.tsx')
const experimentalSalePage = readSource('src/app/dashboard/loja/[storeId]/vendas/[vendaId]/experimental/page.tsx')
const saleActions = readSource('src/lib/actions/vendas.actions.ts')
const commissionActions = readSource('src/lib/actions/commission.actions.ts')

test('sale balance counts direct payments and financing, never installment receipts', () => {
  assert.match(migration, /where venda_id = p_venda_id\s+and parcela_id is null;/)
  assert.match(migration, /v_valor_final - v_total_pago_direto - v_total_financiado/)
  assert.match(migration, /join public\.pagamentos p on p\.venda_id = v\.id and p\.parcela_id is not null/)
  assert.match(migration, /coalesce\(v\.is_historical_import, false\) = false/)
})

test('paid or down-payment total is derived only from direct sale payments', () => {
  assert.match(summary, /if \(pagamento\.parcela_id != null\) return total/)
  assert.match(summary, /total \+ Number\(pagamento\.valor_pago \|\| 0\)/)
  assert.match(regularSale, /pagamentos=\{pagamentos\}/)
  assert.match(experimentalSale, /pagamentos=\{pagamentos\}/)
  assert.doesNotMatch(summary, /venda\.valor_final - \(venda\.valor_restante/)
})

test('manual financing and individual commission keep installment receipts outside sale payments', () => {
  const directPaymentFilters = saleActions.match(/\.is\('parcela_id', null\)/g) || []
  assert.ok(directPaymentFilters.length >= 2)
  assert.match(commissionActions, /pagamentos \( valor_pago, forma_pagamento, parcela_id \)/)
  assert.match(commissionActions, /if \(pg\.parcela_id != null\) return acc/)
})

test('covered sale blocks new direct payment without blocking pending installments', () => {
  assert.match(experimentalSalePage, /const isQuitado = \(venda\.valor_restante \?\? 0\) <= 0\.01/)
  assert.doesNotMatch(experimentalSalePage, /&& !temParcelasPendentes/)
  assert.match(experimentalSale, /isVendaFechadaOuCancelada \|\| isQuitado \? undefined/)
  assert.match(experimentalSale, /isQuitado=\{isCarneQuitado\}/)
  assert.match(regularSale, /isQuitado=\{isCarneQuitado\}/)
})
