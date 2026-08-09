import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'

const [, , dirArg = '.backupcharles/fechamento-sabado', outputArg = 'tmp/ocular-customers-import-plan.json', ...flags] = process.argv
const dir = resolve(dirArg), output = resolve(outputArg), write = flags.includes('--write')
const file = readdirSync(dir).find((name) => /^clientes.*\.xlsx$/i.test(name))
if (!file) throw new Error('Planilha de clientes não encontrada.')
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
const decode = (value = '') => repairMojibake(value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (_, h, d) => String.fromCodePoint(parseInt(h || d, h ? 16 : 10))))
const col = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
async function readXlsx(path) {
  const zip = await JSZip.loadAsync(readFileSync(path)); const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string') || ''
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, x]) => decode([...x.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')))
  const wb = await zip.file('xl/workbook.xml').async('string'), rels = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const id = /<sheet[^>]*r:id="([^"]+)"/.exec(wb)?.[1], target = id && new RegExp(`<Relationship[^>]*Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
  if (!target) throw new Error('Primeira aba não encontrada.')
  const xml = await zip.file(target.startsWith('xl/') ? target : `xl/${target.replace(/^\.\//, '')}`).async('string')
  const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(([, body]) => { const row = []; for (const [, a, cell] of body.matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>/g)) { const ref = /\br="([A-Z]+\d+)"/.exec(a)?.[1]; if (!ref) continue; const t = /\bt="([^"]+)"/.exec(a)?.[1]; const raw = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1] || ''; row[col(ref)] = decode(t === 's' ? shared[Number(raw)] || '' : raw).trim() } return row })
  const headers = rows[0] || []; return rows.slice(1).filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])))
}
const text = (v) => String(v || '').trim(), digits = (v) => text(v).replace(/\D/g, '')
const nameKey = (v) => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const phone = (v) => { const p = digits(v); return p.length >= 10 ? p : '' }
const rows = await readXlsx(join(dir, file))
const get = (row, options) => options.map((key) => row[key]).find((v) => text(v)) || ''
const cpfCount = new Map(), namePhoneCount = new Map()
for (const row of rows) { const cpf = digits(row.CPF); if (cpf.length === 11) cpfCount.set(cpf, (cpfCount.get(cpf) || 0) + 1); const key = `${nameKey(get(row, ['Nome', 'Cliente']))}|${phone(get(row, ['Celular', 'Telefone', 'Fone']))}`; if (key !== '|') namePhoneCount.set(key, (namePhoneCount.get(key) || 0) + 1) }
const records = rows.map((row, index) => { const name = text(get(row, ['Nome', 'Cliente'])), cpf = digits(row.CPF), mobile = phone(get(row, ['Celular', 'Telefone', 'Fone'])), key = `${nameKey(name)}|${mobile}`, reasons = []; if (!name) reasons.push('sem_nome'); if (cpf && cpf.length !== 11) reasons.push('cpf_invalido'); if (cpf.length === 11 && (cpfCount.get(cpf) || 0) > 1) reasons.push('cpf_duplicado_na_origem'); if (key !== '|' && (namePhoneCount.get(key) || 0) > 1) reasons.push('nome_telefone_duplicado_na_origem'); return { sourceSystem: 'ocular-intermediate-spreadsheets', sourceRecordKey: `intermediate-customer:${createHash('sha256').update(JSON.stringify(row)).digest('hex')}`, rowNumber: index + 2, name, cpf: cpf || null, phone: mobile || null, importStatus: reasons.length ? 'review' : 'ready', reviewReasons: reasons, sourcePayload: row } })
const plan = { generatedAt: new Date().toISOString(), mode: 'read-only-plan', sourceFile: file, sourceSha256: createHash('sha256').update(readFileSync(join(dir, file))).digest('hex'), summary: { sourceRows: rows.length, ready: records.filter((r) => r.importStatus === 'ready').length, review: records.filter((r) => r.importStatus === 'review').length }, records }
if (write) writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ ...plan.summary, output: write ? output : null }, null, 2))
