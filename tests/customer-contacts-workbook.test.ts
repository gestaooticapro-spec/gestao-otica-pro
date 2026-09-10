import assert from 'node:assert/strict'
import test from 'node:test'

import JSZip from 'jszip'

import { buildCustomerContactsWorkbook, formatCustomerPhone } from '../src/lib/server/customer-contacts-workbook'

test('formata telefones brasileiros e paraguaios sem perder o formato de texto', () => {
  assert.equal(formatCustomerPhone('44999998888'), '(44) 99999-8888')
  assert.equal(formatCustomerPhone('5544999998888'), '+55 (44) 99999-8888')
  assert.equal(formatCustomerPhone('595981234567'), '+595 981 234 567')
  assert.equal(formatCustomerPhone(null), '')
})

test('gera um arquivo xlsx com nome, telefone, filtro e cabecalho congelado', async () => {
  const workbook = await buildCustomerContactsWorkbook([
    { full_name: 'Ana & Cia', fone_movel: '44999998888', phone: '4433221100' },
    { full_name: 'Bruno', fone_movel: null, phone: '4433221100' },
  ])

  assert.equal(workbook[0], 0x50)
  assert.equal(workbook[1], 0x4b)

  const zip = await JSZip.loadAsync(workbook)
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('string')
  const stylesXml = await zip.file('xl/styles.xml')?.async('string')

  assert.ok(sheetXml)
  assert.ok(stylesXml)
  assert.match(sheetXml, /<t>Nome<\/t>/)
  assert.match(sheetXml, /<t>Telefone<\/t>/)
  assert.match(sheetXml, /Ana &amp; Cia/)
  assert.match(sheetXml, /\(44\) 99999-8888/)
  assert.match(sheetXml, /\(44\) 3322-1100/)
  assert.match(sheetXml, /<autoFilter ref="A1:B3"\/>/)
  assert.match(sheetXml, /state="frozen"/)
  assert.match(stylesXml, /numFmtId="49"/)
})
