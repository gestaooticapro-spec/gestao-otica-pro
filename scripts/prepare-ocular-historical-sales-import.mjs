import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import JSZip from 'jszip'

const [, , sourceDirArg = '.backupcharles/fechamento-sabado', outputArg = 'tmp/ocular-historical-sales-import-plan.json', ...flags] = process.argv
const sourceDir = resolve(sourceDirArg)
const outputPath = resolve(outputArg)
const writeArtifacts = flags.includes('--write')

// Alguns XLSX exportados pelo sistema intermediário guardam texto UTF-8 como
// Windows-1252. Repara apenas os valores que exibem o padrão clássico "Ã"/"Â".
const windows1252Byte = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
}
const repairMojibake = (value = '') => {
  let repaired = String(value)
  for (let attempt = 0; attempt < 2 && /[ÃÂ]/.test(repaired); attempt += 1) {
    const bytes = Buffer.from([...repaired].map((character) => windows1252Byte[character] ?? character.charCodeAt(0)))
    const candidate = bytes.toString('utf8')
    if (candidate.includes('�')) break
    repaired = candidate
  }
  return repaired
}

const files = readdirSync(sourceDir)
const salesFile = files.find((name) => /^Vendas.*\.xlsx$/i.test(name))
const receivablesFile = files.find((name) => /^Contas a Receber.*\.xlsx$/i.test(name))
if (!salesFile || !receivablesFile) throw new Error('Não localizei as planilhas de Vendas e Contas a Receber.')

const decodeXml = (value = '') => repairMojibake(value
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (_, hex, decimal) => String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10))))
const columnIndex = (reference) => [...reference.replace(/\d+/g, '')].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1

async function readXlsx(filePath) {
  const zip = await JSZip.loadAsync(readFileSync(filePath))
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string') || ''
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, item]) => decodeXml([...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join('')))
  const workbook = await zip.file('xl/workbook.xml').async('string')
  const relationships = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const relId = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1]
  const target = relId ? new RegExp(`<Relationship[^>]*Id="${relId}"[^>]*Target="([^"]+)"[^>]*/>`).exec(relationships)?.[1] : null
  if (!target) throw new Error(`Não consegui abrir a primeira planilha de ${filePath}.`)
  const sheetPath = target.startsWith('xl/') ? target : `xl/${target.replace(/^\.\//, '')}`
  const sheet = await zip.file(sheetPath).async('string')
  const rows = [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(([, body]) => {
    const row = []
    for (const [, attributes, cell] of body.matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>/g)) {
      const reference = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1]
      if (!reference) continue
      const type = /\bt="([^"]+)"/.exec(attributes)?.[1]
      const raw = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1] || /<t[^>]*>([\s\S]*?)<\/t>/.exec(cell)?.[1] || ''
      row[columnIndex(reference)] = decodeXml(type === 's' ? shared[Number(raw)] || '' : raw).trim()
    }
    return row
  })
  const headers = rows[0] || []
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])))
}

const text = (value) => String(value ?? '').trim()
const digits = (value) => text(value).replace(/\D/g, '')
const normalizeMoney = (value) => {
  const raw = text(value).replace(/^R\$\s*/i, '')
  if (!raw) return 0
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const amount = Number(normalized)
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : NaN
}
const parseDate = (value) => {
  const raw = text(value)
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return null
}
const saleReference = (value) => /Venda\s+de\s+N[ºo°]?\s*(\d+)/i.exec(text(value))?.[1] || null
const first = (row, names) => names.map((name) => row[name]).find((value) => text(value) !== '') || ''
const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

const salesPath = join(sourceDir, salesFile)
const receivablesPath = join(sourceDir, receivablesFile)
const [sales, receivables] = await Promise.all([readXlsx(salesPath), readXlsx(receivablesPath)])
const snapshotSha256 = createHash('sha256').update(readFileSync(salesPath)).update(readFileSync(receivablesPath)).digest('hex')

const receivablesBySale = new Map()
const orphanReceivables = []
for (const row of receivables) {
  const reference = saleReference(first(row, ['Histórico', 'Historico']))
  if (!reference) {
    orphanReceivables.push({ reason: 'sem_referencia_de_venda', row })
    continue
  }
  const list = receivablesBySale.get(reference) || []
  list.push(row)
  receivablesBySale.set(reference, list)
}

const knownSaleNumbers = new Set(sales.map((row) => text(first(row, ['Número', 'Numero']))).filter(Boolean))
const saleNumberCounts = new Map()
for (const row of sales) {
  const saleNumber = text(first(row, ['Número', 'Numero']))
  saleNumberCounts.set(saleNumber, (saleNumberCounts.get(saleNumber) || 0) + 1)
}
const records = []
for (const row of sales) {
  const legacySaleNumber = text(first(row, ['Número', 'Numero']))
  const status = text(row.Status)
  const total = normalizeMoney(first(row, ['Valor Total', 'ValorTotal']))
  const customerName = text(first(row, ['Cliente', 'Nome Cliente']))
  const cpf = digits(row.CPF)
  const phone = digits(first(row, ['Celular', 'Telefone']))
  const linkedReceivables = receivablesBySale.get(legacySaleNumber) || []
  const installments = linkedReceivables.map((receivable, index) => ({
    sourceRecordKey: `intermediate-receivable:${text(first(receivable, ['Numero', 'Número'])) || `${legacySaleNumber}-${index + 1}`}`,
    number: index + 1,
    dueDate: parseDate(first(receivable, ['Data Vencimento', 'Vencimento'])),
    amount: normalizeMoney(first(receivable, ['Valor'])),
    status: text(first(receivable, ['Situação', 'Situacao'])) || 'Aberto',
    description: text(first(receivable, ['Histórico', 'Historico'])),
  }))
  const outstanding = Number(installments.reduce((sum, installment) => sum + (Number.isFinite(installment.amount) ? installment.amount : 0), 0).toFixed(2))
  const entry = Number((total - outstanding).toFixed(2))
  const reasons = []
  if (status.toLowerCase() !== 'vendido') reasons.push(`status_${status || 'ausente'}`)
  if (!legacySaleNumber) reasons.push('sem_numero_de_venda')
  if ((saleNumberCounts.get(legacySaleNumber) || 0) > 1) reasons.push('numero_de_venda_duplicado')
  if (!customerName && !cpf) reasons.push('sem_identidade_de_cliente')
  if (!parseDate(row.Data)) reasons.push('sem_data_de_venda')
  if (!Number.isFinite(total) || total < 0) reasons.push('valor_total_invalido')
  if (installments.some((installment) => !Number.isFinite(installment.amount) || installment.amount <= 0 || !installment.dueDate)) reasons.push('parcela_invalida')
  if (outstanding > total + 0.02) reasons.push('parcelas_superam_valor_da_venda')
  records.push({
    sourceSystem: 'ocular-intermediate-spreadsheets',
    sourceRecordKey: `intermediate-sale:${createHash('sha256').update(JSON.stringify(row)).digest('hex')}`,
    legacySaleNumber,
    saleDate: parseDate(row.Data),
    customer: { name: customerName, cpf: cpf || null, phone: phone || null },
    seller: text(row.Vendedor) || null,
    originalStatus: status,
    originalValue: total,
    historicalEntryAmount: entry,
    outstandingInstallmentsAmount: outstanding,
    installments,
    importStatus: reasons.length ? 'review' : 'ready',
    reviewReasons: reasons,
    sourcePayload: row,
  })
}

for (const [legacySaleNumber, rows] of receivablesBySale) {
  if (!knownSaleNumbers.has(legacySaleNumber)) {
    for (const row of rows) orphanReceivables.push({ reason: 'venda_referenciada_nao_encontrada', legacySaleNumber, row })
  }
}

const ready = records.filter((record) => record.importStatus === 'ready')
const review = records.filter((record) => record.importStatus === 'review')
const plan = {
  generatedAt: new Date().toISOString(), mode: 'read-only-plan', sourceSystem: 'ocular-intermediate-spreadsheets', snapshotSha256,
  sources: { salesFile, receivablesFile, sales: sales.length, receivables: receivables.length },
  summary: { salesToImport: ready.length, salesForReview: review.length, installmentsToImport: ready.reduce((sum, record) => sum + record.installments.length, 0), orphanReceivables: orphanReceivables.length },
  records, orphanReceivables,
}

if (writeArtifacts) {
  writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
  const reviewPath = outputPath.replace(/\.json$/i, '-review.csv')
  const orphanPath = outputPath.replace(/\.json$/i, '-orphan-receivables.csv')
  writeFileSync(reviewPath, ['sale_number;customer;total;installments;entry;reasons', ...review.map((record) => [record.legacySaleNumber, record.customer.name, record.originalValue, record.outstandingInstallmentsAmount, record.historicalEntryAmount, record.reviewReasons.join(' | ')].map(csvCell).join(';'))].join('\n'), 'utf8')
  writeFileSync(orphanPath, ['legacy_sale_number;reason;customer;amount;history', ...orphanReceivables.map((item) => [item.legacySaleNumber || '', item.reason, first(item.row, ['Nome Cliente', 'Cliente']), first(item.row, ['Valor']), first(item.row, ['Histórico', 'Historico'])].map(csvCell).join(';'))].join('\n'), 'utf8')
  plan.artifacts = { outputPath, reviewPath, orphanPath }
}

console.log(JSON.stringify({ ...plan.summary, snapshotSha256, artifacts: plan.artifacts || null }, null, 2))
