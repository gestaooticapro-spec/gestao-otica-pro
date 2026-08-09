import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import JSZip from 'jszip'

const filePath = resolve(process.argv[2] || '')
if (!process.argv[2]) throw new Error('Uso: node scripts/inspect-ocular-xlsx.mjs <arquivo.xlsx>')

const columnIndex = (reference) => [...reference.replace(/\d+/g, '')].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1
const decode = (value = '') => value
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (_, hex, decimal) => String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10)))

const zip = await JSZip.loadAsync(readFileSync(filePath))
const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string') || ''
const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, item]) => decode([...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join('')))
const workbook = await zip.file('xl/workbook.xml').async('string')
const relationships = await zip.file('xl/_rels/workbook.xml.rels').async('string')
const relId = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1]
const target = relId && new RegExp(`<Relationship[^>]*Id="${relId}"[^>]*Target="([^"]+)"`).exec(relationships)?.[1]
if (!target) throw new Error('Primeira planilha não encontrada.')
const sheet = await zip.file(target.startsWith('xl/') ? target : `xl/${target.replace(/^\.\//, '')}`).async('string')
const rows = [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(([, body]) => {
  const row = []
  for (const [, attributes, cell] of body.matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>/g)) {
    const reference = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1]
    if (!reference) continue
    const type = /\bt="([^"]+)"/.exec(attributes)?.[1]
    const raw = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1] || ''
    row[columnIndex(reference)] = decode(type === 's' ? shared[Number(raw)] || '' : raw).trim()
  }
  return row
})
const [headers, ...data] = rows
console.log(JSON.stringify({ headers, firstRows: data.filter((row) => row.some(Boolean)).slice(0, 3).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || '']))) }, null, 2))
