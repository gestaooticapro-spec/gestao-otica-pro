import assert from 'node:assert/strict'
import test from 'node:test'
import { nfceRecipient } from '../src/lib/nfce-recipient'

const customer = {
    person_type: 'PF', full_name: 'Cliente da venda', cpf: '529.982.247-25',
    email: 'cliente@example.test', rua: 'Rua do cadastro', numero: 10,
    cidade: 'Curitiba', uf: 'PR', codigo_municipio_ibge: '4106902',
}

test('outro CPF não herda nome, contato ou endereço da cliente da venda', () => {
    assert.deepEqual(nfceRecipient('123.456.789-09', customer), { cpf_cnpj: '12345678909', nome: '' })
})

test('cliente sem CPF não fornece dados pessoais para documento digitado', () => {
    assert.deepEqual(nfceRecipient('12345678909', { ...customer, cpf: null }), { cpf_cnpj: '12345678909', nome: '' })
})

test('documento avulso e nota sem identificação não incluem dados do cadastro', () => {
    assert.deepEqual(nfceRecipient('52998224725'), { cpf_cnpj: '52998224725', nome: '' })
    assert.deepEqual(nfceRecipient('', customer), { cpf_cnpj: '', nome: '' })
})

test('documento do cadastro preserva nome, contato e endereço da mesma pessoa', () => {
    const result = nfceRecipient('52998224725', customer)
    assert.equal(result.nome, customer.full_name)
    assert.equal(result.email, customer.email)
    assert.equal(result.endereco?.logradouro, customer.rua)
    assert.equal(result.endereco?.numero, '10')
    assert.equal(result.endereco?.inscricao_estadual, undefined)
})

test('pessoa jurídica usa somente os dados ligados ao CNPJ cadastrado', () => {
    const pj = { ...customer, person_type: 'PJ', cnpj: '11.222.333/0001-81',
        razao_social: 'Empresa do cadastro', nome_fantasia: 'Empresa', inscricao_estadual: '123' }
    const result = nfceRecipient('11222333000181', pj)
    assert.equal(result.nome, pj.razao_social)
    assert.equal(result.razao_social, pj.razao_social)
    assert.equal(result.endereco?.inscricao_estadual, '123')
    assert.deepEqual(nfceRecipient(customer.cpf, pj), { cpf_cnpj: '52998224725', nome: '' })
})
