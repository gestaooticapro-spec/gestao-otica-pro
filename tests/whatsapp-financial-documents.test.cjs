const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
require('tsx/cjs')

// These generators run on the server in production; no Next server is needed
// to render anonymous document fixtures, and the fixtures never send messages.
const Module = require('node:module')
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(this, request === 'server-only' ? 'next/dist/compiled/server-only' : request, ...args)
}
const serverOnlyPath = require.resolve('next/dist/compiled/server-only')
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} }
const { toFinancialSummaryInstallment, getFinancialSummaryInstallmentStatus, getFinancialSummaryInstallmentTotals } = require('../src/lib/financial-summary-document.ts')
const { generateCustomerFinancialSummaryPDF, generateInstallmentReceiptPDF } = require('../src/lib/pdf-generator.ts')
if (process.platform === 'win32') {
  // Next 14's bundled OG renderer joins file: URLs with Windows path.join.
  // Use the same renderer with resolved asset paths for this local test only.
  const rendererPath = require.resolve('next/dist/compiled/@vercel/og/index.node.js')
  const source = fs.readFileSync(rendererPath, 'utf8').replace(
    /fileURLToPath\(join\(import\.meta\.url, "\.\.\/([^\"]+)"\)\)/g,
    (_, asset) => JSON.stringify(path.join(path.dirname(rendererPath), asset)),
  )
  const renderer = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  class LocalImageResponse extends Response {
    constructor(element, options) {
      super(new ReadableStream({ async start(controller) {
        try {
          const { ImageResponse } = await renderer
          const response = new ImageResponse(element, options)
          controller.enqueue(new Uint8Array(await response.arrayBuffer()))
          controller.close()
        } catch (error) { controller.error(error) }
      } }))
    }
  }
  const imageResponsePath = require.resolve('next/og')
  require.cache[imageResponsePath] = { id: imageResponsePath, filename: imageResponsePath, loaded: true, exports: { ImageResponse: LocalImageResponse } }
}
const { generateCustomerFinancialSummaryImages } = require('../src/lib/whatsapp-summary-image.tsx')
const { PDFParse } = require('pdf-parse')

function installment(number, paid, extra = {}) {
  return toFinancialSummaryInstallment({
    numero_parcela: number, data_vencimento: `2026-${String(number + 5).padStart(2, '0')}-19`,
    valor_parcela: 125, valor_pago: paid, status: paid === 125 ? 'Pago' : 'Pendente',
    ...extra,
  }, paid > 0 ? '2026-10-03' : null)
}

const installments = [125, 125, 125, 125, 40, 0].map((paid, i) => installment(i + 1, paid, {
  data_pagamento: ['2026-07-15', '2026-08-13', '2026-09-24', '2026-10-03', null, null][i],
}))
const financing = { id: 1140, vendaId: 349, dataVenda: '2026-05-19', dependenteNames: [], totalParcelas: 6, parcelasPagas: 4, parcelasPendentes: 2, valorFinanciado: 750, parcelas: installments }
const store = { name: 'Ótica de validação', logoFile: null }
const data = { customerName: 'Cliente de validação', store, totals: { ...getFinancialSummaryInstallmentTotals(installments), totalParcelas: 6, valorTotalFinanciado: 750 }, nextDue: { data: '2026-10-19', valor: 85, numeroParcela: 5 }, financiamentos: [financing] }

async function pdfText(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try { return (await parser.getText()).text.replace(/\s+/g, ' ') }
  finally { await parser.destroy() }
}

function saveQa(name, buffer) {
  const directory = process.env.FINANCIAL_DOCUMENT_QA_DIR
  if (!directory) return
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, name), buffer)
}

test('a partial fifth installment is included in paid money, remaining money and payment date', () => {
  assert.deepEqual(getFinancialSummaryInstallmentTotals(installments), { valorPago: 540, valorRestante: 210, parcelasPagas: 4, parcelasPendentes: 2 })
  assert.equal(installments[4].valorPago, 40)
  assert.equal(installments[4].valorRestante, 85)
  assert.equal(installments[4].dataPagamento, '2026-10-03')
  assert.equal(getFinancialSummaryInstallmentStatus(installments[4]), 'Parcial')
})

test('rolling unpaid debt forward does not invent a payment or duplicate the debt', () => {
  const source = installment(1, 50, { status: 'Pago', valor_transferido_saida: 75 })
  const destination = installment(2, 40, { valor_transferido_entrada: 75 })
  assert.equal(source.valorPago, 50)
  assert.equal(source.valorRestante, 0)
  assert.equal(getFinancialSummaryInstallmentStatus(source), 'Transferido')
  assert.equal(destination.valor, 200)
  assert.equal(destination.valorRestante, 160)
  assert.deepEqual(getFinancialSummaryInstallmentTotals([source, destination]), { valorPago: 90, valorRestante: 160, parcelasPagas: 1, parcelasPendentes: 1 })
  const renegotiated = installment(3, 0, { status: 'Pago', valor_renegociado_saida: 125 })
  assert.equal(renegotiated.valorPago, 0)
  assert.equal(renegotiated.valorRestante, 0)
  assert.equal(getFinancialSummaryInstallmentStatus(renegotiated), 'Transferido')
})

test('summary PDF prints the partial amount and balance and totals them accurately', async () => {
  const buffer = await generateCustomerFinancialSummaryPDF(data)
  const text = await pdfText(buffer)
  assert.match(text, /Pago: R\$ 540,00/)
  assert.match(text, /Pendente: R\$ 210,00/)
  assert.match(text, /5 19\/10\/2026 R\$ 125,00 03\/10\/2026 R\$ 40,00 R\$ 85,00 Parcial/)
  saveQa('resumo-parcial.pdf', buffer)
})

test('transferred debt is shown separately from money actually paid in PDFs and images', async () => {
  const rows = [installment(1, 50, { status: 'Pago', valor_transferido_saida: 75 }), installment(2, 40, { valor_transferido_entrada: 75 })]
  const transferData = { ...data, nextDue: { data: rows[1].dataVencimento, numeroParcela: 2, valor: 160 }, totals: { ...getFinancialSummaryInstallmentTotals(rows), totalParcelas: 2, valorTotalFinanciado: 250 }, financiamentos: [{ ...financing, valorFinanciado: 250, parcelas: rows }] }
  const pdf = await generateCustomerFinancialSummaryPDF(transferData)
  const text = await pdfText(pdf)
  assert.match(text, /Pago: R\$ 90,00/)
  assert.match(text, /Pendente: R\$ 160,00/)
  assert.match(text, /R\$ 50,00 R\$ 0,00 Transf\. 75,00/)
  assert.match(text, /R\$ 200,00 .*R\$ 40,00 R\$ 160,00 Parcial/)
  saveQa('resumo-transferencia.pdf', pdf)
  const [image] = await generateCustomerFinancialSummaryImages(transferData)
  saveQa('resumo-transferencia.png', image)
})

test('images and tall PDFs render all financing groups, including the last partial installment', async () => {
  const multi = { ...data, financiamentos: [ { ...financing, id: 1, vendaId: 1 }, { ...financing, id: 2, vendaId: 2 }, financing ], totals: { ...data.totals, valorPago: 1620, valorRestante: 630, totalParcelas: 18, parcelasPagas: 12, parcelasPendentes: 6, valorTotalFinanciado: 2250 } }
  const images = await generateCustomerFinancialSummaryImages(multi)
  assert.equal(images.length, 3)
  for (const [index, image] of images.entries()) {
    assert.equal(image.subarray(1, 4).toString(), 'PNG')
    saveQa(`resumo-${index + 1}.png`, image)
  }
  const buffer = await generateCustomerFinancialSummaryPDF(multi)
  const text = await pdfText(buffer)
  assert.equal((text.match(/Pago: R\$ 540,00/g) || []).length, 3)
  saveQa('resumo-varios-carnes.pdf', buffer)
})

test('receipt PDFs preserve the allocation amounts of the current payment', async () => {
  for (const amount of [110, 40]) {
    const buffer = await generateInstallmentReceiptPDF({ customerName: data.customerName, installmentNumber: amount === 110 ? 4 : 5, totalInstallments: 6, amount, dueDate: amount === 110 ? '2026-09-19' : '2026-10-19', paymentDate: '2026-10-03', store })
    const text = await pdfText(buffer)
    assert.match(text, new RegExp(`R\\$ ${amount},00`))
    saveQa(`recibo-${amount}.pdf`, buffer)
  }
})
