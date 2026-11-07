import assert from 'node:assert/strict'
import test from 'node:test'
import { SaleReturnRequestSchema } from '../src/lib/sale-return-request'

const request = {
  store_id: 1, venda_id: 10, customer_id: 20, employee_id: 5,
  tipo_reembolso: 'Carteira', idempotency_key: '00000000-0000-4000-8000-000000000001',
  authorization_token: 'synthetic',
  itens: [{ venda_item_id: 100, condicao: 'Intacto' }],
}

test('solicitação aceita somente referências e condições; preço e quantidade vêm do banco', () => {
  const result = SaleReturnRequestSchema.parse({ ...request,
    itens: [{ ...request.itens[0], product_id: 999, quantidade: 999, valor_unitario: 999 }],
  })
  assert.deepEqual(result.itens, [{ venda_item_id: 100, condicao: 'Intacto' }])
})

test('itens repetidos, lista vazia e identificadores inválidos são recusados', () => {
  assert.equal(SaleReturnRequestSchema.safeParse({ ...request, itens: [] }).success, false)
  assert.equal(SaleReturnRequestSchema.safeParse({ ...request, itens: [...request.itens, ...request.itens] }).success, false)
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(SaleReturnRequestSchema.safeParse({ ...request, venda_id: id }).success, false)
  }
})

test('sobras exigem diâmetro válido e olho identificado', () => {
  for (const details of [undefined, { diametro: 0, olho: 'OD' }, { diametro: 65, olho: '??' }]) {
    assert.equal(SaleReturnRequestSchema.safeParse({ ...request,
      itens: [{ venda_item_id: 100, condicao: 'Sobra', detalhes_sobra: details }],
    }).success, false)
  }
  assert.equal(SaleReturnRequestSchema.safeParse({ ...request,
    itens: [{ venda_item_id: 100, condicao: 'Sobra', detalhes_sobra: { diametro: 65, olho: 'OE' } }],
  }).success, true)
})

test('tentativa e autorização são obrigatórias', () => {
  assert.equal(SaleReturnRequestSchema.safeParse({ ...request, idempotency_key: undefined }).success, false)
  assert.equal(SaleReturnRequestSchema.safeParse({ ...request, authorization_token: '' }).success, false)
})
