import assert from 'node:assert/strict'
import test from 'node:test'
import { customerDuplicateCandidates, productDuplicateCandidates } from '../src/lib/daily-health-data-quality'

test('joins customer matches into one review group when the evidence overlaps', () => {
  const result = customerDuplicateCandidates([
    { id: 1, full_name: 'Maria de Jesus', cpf: '123.456.789-01', fone_movel: '62999990000' },
    { id: 2, full_name: 'Maria de Jesús', cpf: null, fone_movel: '62999990000' },
    { id: 3, full_name: 'Maria de Jesus', cpf: null, fone_movel: '62988880000' },
  ])

  assert.equal(result.groups.length, 1)
  assert.deepEqual(result.groups[0].ids, [1, 2, 3])
  assert.deepEqual(new Set(result.groups[0].reasons), new Set(['telefone', 'nome']))
})

test('requires name, brand and reference together for product duplication', () => {
  const result = productDuplicateCandidates([
    { id: 10, nome: 'Armação Prisma', marca: 'Prisma', referencia: 'XP-1' },
    { id: 11, nome: 'Armacao Prisma', marca: 'Prisma', referencia: 'XP-1' },
    { id: 20, nome: 'Lente Azul', marca: 'Haytek', referencia: 'AZ-2' },
    { id: 21, nome: 'Lente Azul', marca: 'Haytek', referencia: 'AZ-3' },
  ])

  assert.equal(result.groups.length, 1)
  assert.deepEqual(result.groups.map((group) => group.ids), [[10, 11]])
})

test('normalizes spacing in the reference without collapsing a distinct suffix', () => {
  const result = productDuplicateCandidates([
    { id: 1, nome: 'Ray Ban', marca: 'Ray Ban', referencia: 'RB 7195' },
    { id: 2, nome: 'Ray Bam', marca: 'Ray Ban', referencia: 'RB7195' },
    { id: 3, nome: 'Ray Ban', marca: 'Ray Ban', referencia: 'RB 7195L' },
  ])

  assert.deepEqual(result.groups.map((group) => group.ids), [[1, 2]])
})

test('does not mix products with missing and informed references', () => {
  const result = productDuplicateCandidates([
    { id: 1, nome: 'Ray Ban', marca: 'Ray Ban', referencia: null },
    { id: 2, nome: 'Ray Ban', marca: 'Ray Ban', referencia: 'RB 7270L 8420 56-18 145' },
    { id: 3, nome: 'Ray Ban', marca: 'Ray Ban', referencia: 'RB 7195L 5196 55-18 145' },
    { id: 4, nome: 'Ray Ban', marca: 'Ray Bam', referencia: null },
  ])

  assert.deepEqual(result.groups.map((group) => group.ids), [[1, 4]])
})
