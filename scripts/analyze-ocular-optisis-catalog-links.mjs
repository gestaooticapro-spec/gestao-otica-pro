import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [inputArg = 'tmp/optisis-degrees-export.tsv', outputDirArg = 'tmp'] = process.argv.slice(2)
const inputPath = resolve(inputArg)
const outputDir = resolve(outputDirArg)

const text = (value) => String(value ?? '').trim()
const decode = (value) => Buffer.from(value, 'base64').toString('utf8')
const normalize = (value) => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim()
const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

const catalogs = {
  lens: new Map(),
  frame: new Map(),
  treatment: new Map(),
}
const purchases = []

for (const line of readFileSync(inputPath, 'utf8').trim().split(/\r?\n/)) {
  const [kind, ...encoded] = line.split('\t')
  const fields = encoded.map(decode)

  if (kind === 'L') catalogs.lens.set(fields[0], text(fields[1]))
  if (kind === 'A') catalogs.frame.set(fields[0], text(fields[1]))
  if (kind === 'T') catalogs.treatment.set(fields[0], text(fields[1]))
  if (kind === 'P') {
    purchases.push({
      id: text(fields[0]),
      customerId: text(fields[1]),
      date: text(fields[2]),
      lensId: text(fields[18]),
      frameId: text(fields[19]),
      treatmentId: text(fields[20]),
    })
  }
}

function analyze(kind, catalog) {
  const usage = new Map()
  let empty = 0
  let unresolved = 0

  for (const purchase of purchases) {
    const sourceId = purchase[`${kind}Id`]
    if (!sourceId) {
      empty += 1
      continue
    }

    const resolvedName = catalog.get(sourceId) || ''
    if (!resolvedName) unresolved += 1
    const key = `${sourceId}\u0000${resolvedName}`
    const entry = usage.get(key) || {
      sourceId,
      sourceName: resolvedName || null,
      normalizedName: normalize(resolvedName),
      purchases: 0,
      examples: [],
    }
    entry.purchases += 1
    if (entry.examples.length < 4) entry.examples.push(purchase.id)
    usage.set(key, entry)
  }

  const rows = [...usage.values()].sort((a, b) => b.purchases - a.purchases || a.sourceId.localeCompare(b.sourceId))
  const normalizedGroups = new Map()
  for (const row of rows) {
    if (!row.normalizedName) continue
    const group = normalizedGroups.get(row.normalizedName) || []
    group.push(row)
    normalizedGroups.set(row.normalizedName, group)
  }

  return {
    catalogRows: catalog.size,
    purchasesWithReference: purchases.length - empty,
    purchasesWithoutReference: empty,
    unresolvedReferences: unresolved,
    distinctReferencedProducts: rows.length,
    normalizedNameCollisions: [...normalizedGroups.values()].filter((group) => group.length > 1).map((group) => ({
      normalizedName: group[0].normalizedName,
      sourceIds: group.map((row) => row.sourceId),
      sourceNames: group.map((row) => row.sourceName),
      purchases: group.reduce((total, row) => total + row.purchases, 0),
    })),
    rows,
  }
}

const lens = analyze('lens', catalogs.lens)
const frame = analyze('frame', catalogs.frame)
const treatment = analyze('treatment', catalogs.treatment)
const summary = {
  inputPath,
  purchases: purchases.length,
  lens: { ...lens, rows: undefined },
  frame: { ...frame, rows: undefined },
  treatment: { ...treatment, rows: undefined },
}

mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'ocular-optisis-product-links-study.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

for (const [kind, result] of Object.entries({ lenses: lens, armacoes: frame, tratamentos: treatment })) {
  const lines = ['codigo_optisis;nome_optisis;nome_normalizado;compras;exemplos_compras']
  for (const row of result.rows) {
    lines.push([
      row.sourceId,
      row.sourceName || '[SEM NOME NO CATÁLOGO]',
      row.normalizedName,
      row.purchases,
      row.examples.join(', '),
    ].map(csv).join(';'))
  }
  writeFileSync(resolve(outputDir, `ocular-optisis-${kind}-study.csv`), `${lines.join('\n')}\n`, 'utf8')
}

console.log(JSON.stringify(summary, null, 2))
