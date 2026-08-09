import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import JSZip from 'jszip'

const file = resolve(process.argv[2] || '.backupcharles/produtos_06-08-2026.xlsx')
const col = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
const decode = (v = '') => v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
const zip = await JSZip.loadAsync(readFileSync(file))
const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string') || ''
const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, x]) => decode([...x.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')))
const workbook = await zip.file('xl/workbook.xml').async('string')
const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string')
const id = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1]
const target = new RegExp(`<Relationship[^>]*Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
const xml = await zip.file(target.startsWith('xl/') ? target : `xl/${target.replace(/^\.\//, '')}`).async('string')
const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(([, body]) => {
  const row = []
  for (const [, attrs, cell] of body.matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>/g)) {
    const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]; if (!ref) continue
    const raw = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1] || /<t[^>]*>([\s\S]*?)<\/t>/.exec(cell)?.[1] || ''
    row[col(ref)] = /t="s"/.test(attrs) ? shared[Number(raw)] || '' : raw
  }
  return row
})
const [headers, ...data] = rows
const records = data.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])))
const countBy = (key) => Object.fromEntries([...records.reduce((map, row) => map.set(row[key] || '(vazio)', (map.get(row[key] || '(vazio)') || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]))
const duplicates = (key) => [...records.reduce((map, row) => { const value = row[key] || ''; if (value) map.set(value, (map.get(value) || 0) + 1); return map }, new Map())].filter(([, n]) => n > 1)
const duplicateReferenceValues = new Set(duplicates('Referência').map(([value]) => value))
const duplicateNameValues = new Set(duplicates('Nome do Produto').map(([value]) => value))
const reviewRows = []
for (const row of records) {
  const reasons = []
  const referenceRows = records.filter((item) => item['Referência'] && item['Referência'] === row['Referência'])
  const nameRows = records.filter((item) => item['Nome do Produto'] && item['Nome do Produto'] === row['Nome do Produto'])
  if (duplicateReferenceValues.has(row['Referência'])) {
    const signatures = new Set(referenceRows.map((item) => [item['Nome do Produto'], item['Preço de Venda'], item['Controla Estoque'], item['Estoque Atual']].join('|')))
    reasons.push(signatures.size > 1 ? 'referencia_duplicada_com_conflito' : 'referencia_duplicada_identica')
  }
  if (duplicateNameValues.has(row['Nome do Produto'])) reasons.push('nome_duplicado')
  const stock = Number(String(row['Estoque Atual'] || '').replace(',', '.'))
  if (Number.isFinite(stock) && stock < 0) reasons.push('estoque_negativo')
  if (String(row['Controla Estoque']).toLowerCase() === 'sim' && !String(row['Estoque Atual']).trim()) reasons.push('controla_estoque_sem_quantidade')
  if (!String(row['Preço de Venda']).trim()) reasons.push('preco_venda_ausente')
  if (!String(row['Referência']).trim()) reasons.push('referencia_ausente')
  if (!String(row.NCM).trim()) reasons.push('ncm_ausente')
  if (!String(row.Fornecedor).trim()) reasons.push('fornecedor_ausente')
  if (reasons.length) reviewRows.push({ row: records.indexOf(row) + 2, reference: row['Referência'], name: row['Nome do Produto'], category: row.Categoria, brand: row.Marca, salePrice: row['Preço de Venda'], stockControl: row['Controla Estoque'], stock: row['Estoque Atual'], ncm: row.NCM, supplier: row.Fornecedor, reasons: reasons.join(' | ') })
}
if (process.argv[3]) {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = ['linha;referencia;nome;categoria;marca;preco_venda;controla_estoque;estoque;ncm;fornecedor;motivos', ...reviewRows.map((row) => [row.row, row.reference, row.name, row.category, row.brand, row.salePrice, row.stockControl, row.stock, row.ncm, row.supplier, row.reasons].map(quote).join(';'))].join('\n')
  writeFileSync(resolve(process.argv[3]), `${csv}\n`, 'utf8')
}
console.log(JSON.stringify({ file, rows: records.length, headers, byCategory: countBy('Categoria'), byActive: countBy('Ativo'), byStockControl: countBy('Controla Estoque'), byStore: countBy('Ótica'), duplicateReferences: duplicates('Referência'), duplicateReferenceDetails: records.filter((row) => duplicateReferenceValues.has(row['Referência'])), duplicateNames: duplicates('Nome do Produto'), duplicateNameDetails: records.filter((row) => duplicateNameValues.has(row['Nome do Produto'])), first: records.slice(0, 3), last: records.slice(-3) }, null, 2))
