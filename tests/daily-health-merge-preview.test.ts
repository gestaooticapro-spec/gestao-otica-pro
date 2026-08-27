import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMergeFieldComplements, buildMergeFieldConflicts, mergeDependenciesFor } from '../src/lib/daily-health-merge-preview'

test('normalizes product reference spacing without hiding a distinct suffix', () => {
  const compatible = buildMergeFieldConflicts('duplicate_product', [
    { id: 1, nome: 'Ray Ban', marca: 'Ray Ban', referencia: 'RB 7195', tipo_produto: 'Armacao' },
    { id: 2, nome: 'Ray Ban', marca: 'Ray Ban', referencia: 'RB7195', tipo_produto: 'Armacao' },
  ])
  const blocked = buildMergeFieldConflicts('duplicate_product', [
    { id: 1, nome: 'Ray Ban', marca: 'Ray Ban', referencia: 'RB 7195', tipo_produto: 'Armacao' },
    { id: 2, nome: 'Ray Ban', marca: 'Ray Ban', referencia: 'RB7195L', tipo_produto: 'Armacao' },
  ])

  assert.equal(compatible.some((item) => item.field === 'referencia'), false)
  assert.equal(blocked.find((item) => item.field === 'referencia')?.severity, 'blocker')
})

test('treats different customer documents as blockers and finds safe complements', () => {
  const records = [
    { id: 10, full_name: 'Maria de Jesus', cpf: '111.111.111-11', email: null },
    { id: 11, full_name: 'Maria de Jesus', cpf: '22222222222', email: 'maria@example.com' },
  ]
  const conflicts = buildMergeFieldConflicts('duplicate_customer', records)
  const complements = buildMergeFieldComplements('duplicate_customer', records, 10)

  assert.equal(conflicts.find((item) => item.field === 'cpf')?.severity, 'blocker')
  assert.deepEqual(complements, [{ field: 'email', label: 'E-mail', fromId: 11, value: 'maria@example.com' }])
})

test('keeps the dependency inventory broad enough for operational history', () => {
  const customerTables = new Set(mergeDependenciesFor('duplicate_customer').map((item) => item.table))
  const productTables = new Set(mergeDependenciesFor('duplicate_product').map((item) => item.table))

  assert.equal(customerTables.has('vendas'), true)
  assert.equal(customerTables.has('service_orders'), true)
  assert.equal(customerTables.has('financiamento_parcelas'), true)
  assert.equal(customerTables.has('tower_sessions'), true)
  assert.equal(productTables.has('venda_itens'), true)
  assert.equal(productTables.has('stock_movements'), true)
  assert.equal(productTables.has('product_variants'), true)
})
