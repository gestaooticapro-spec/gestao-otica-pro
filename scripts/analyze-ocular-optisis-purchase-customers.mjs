import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'

const [inputArg = 'tmp/optisis-degrees-export.tsv', tenantId, storeIdArg, outputArg = 'tmp/ocular-optisis-purchase-customer-study.csv', ...flags] = process.argv.slice(2)
const storeId = Number(storeIdArg)
const databaseUrl = flags.includes('--production-db') ? process.env.SUPABASE_DB_URL : process.env.LOCAL_SUPABASE_DB_URL
if (!databaseUrl || !tenantId || !Number.isInteger(storeId) || storeId <= 0) throw new Error('Uso: node --env-file=.env.local scripts/analyze-ocular-optisis-purchase-customers.mjs <export.tsv> <tenant-id> <store-id> [saida.csv] [--production-db]')

const text = (value) => String(value ?? '').trim()
const digits = (value) => text(value).replace(/\D/g, '')
const decode = (value) => Buffer.from(value, 'base64').toString('utf8')
const nameKey = (value) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const phoneKey = (value) => { const valueDigits = digits(value); return valueDigits.length >= 10 ? valueDigits : '' }
const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
const add = (map, key, id) => { if (!key) return; const values = map.get(key) || new Set(); values.add(Number(id)); map.set(key, values) }
const unique = (map, key) => { const values = [...(map.get(key) || [])]; return values.length === 1 ? values[0] : null }

const customers = new Map()
const purchases = []
for (const line of readFileSync(resolve(inputArg), 'utf8').trim().split(/\r?\n/)) {
  const [kind, ...encoded] = line.split('\t')
  const fields = encoded.map(decode)
  if (kind === 'C') customers.set(text(fields[0]), { id: text(fields[0]), name: text(fields[1]), cpf: text(fields[2]), mobile: text(fields[3]), phone: text(fields[4]), birthDate: text(fields[5]) })
  if (kind === 'P') purchases.push({ id: text(fields[0]), customerId: text(fields[1]), date: text(fields[2]) })
}

const client = new Client({ connectionString: databaseUrl })
await client.connect()
try {
  const [targetResult, referenceResult] = await Promise.all([
    client.query('SELECT id,full_name,cpf,phone,fone_movel,birth_date FROM public.customers WHERE tenant_id=$1 AND store_id=$2', [tenantId, storeId]),
    client.query("SELECT source_customer_id,customer_id FROM public.customer_external_references WHERE store_id=$1 AND source_system='optisis-ocular'", [storeId]),
  ])
  const byCpf = new Map(), byNamePhone = new Map(), byNameBirth = new Map(), byName = new Map()
  for (const target of targetResult.rows) {
    const name = nameKey(target.full_name)
    const phone = phoneKey(target.phone || target.fone_movel)
    add(byCpf, digits(target.cpf), target.id)
    add(byNamePhone, `${name}|${phone}`, target.id)
    add(byNameBirth, `${name}|${target.birth_date || ''}`, target.id)
    add(byName, name, target.id)
  }
  const external = new Map(referenceResult.rows.map((row) => [String(row.source_customer_id), Number(row.customer_id)]))
  const rows = []
  for (const purchase of purchases) {
    const source = customers.get(purchase.customerId)
    const name = nameKey(source?.name)
    const phone = phoneKey(source?.mobile) || phoneKey(source?.phone)
    const cpf = digits(source?.cpf)
    const birthDate = source?.birthDate || ''
    const externalTarget = external.get(purchase.customerId)
    const candidates = [
      ['external_reference', externalTarget],
      ['cpf', unique(byCpf, cpf)],
      ['name_phone', unique(byNamePhone, `${name}|${phone}`)],
      ['name_birth_date', unique(byNameBirth, `${name}|${birthDate}`)],
      ['unique_name', unique(byName, name)],
    ]
    const selected = candidates.find(([, id]) => id) || null
    rows.push({
      purchaseId: purchase.id,
      purchaseDate: purchase.date,
      sourceCustomerId: purchase.customerId,
      sourceName: source?.name || '',
      targetCustomerId: selected?.[1] || null,
      method: selected?.[0] || 'review_unmatched_or_ambiguous',
    })
  }
  const summary = {
    purchases: rows.length,
    linked: rows.filter((row) => row.targetCustomerId).length,
    review: rows.filter((row) => !row.targetCustomerId).length,
    byMethod: Object.fromEntries([...new Set(rows.map((row) => row.method))].sort().map((method) => [method, rows.filter((row) => row.method === method).length])),
  }
  const header = 'compra_optisis;data;cliente_optisis_id;cliente_optisis;cliente_mb_id;metodo'
  writeFileSync(resolve(outputArg), `${header}\n${rows.map((row) => [row.purchaseId, row.purchaseDate, row.sourceCustomerId, row.sourceName, row.targetCustomerId || '', row.method].map(csv).join(';')).join('\n')}\n`, 'utf8')
  writeFileSync(resolve(outputArg).replace(/\.csv$/i, '.json'), `${JSON.stringify({ summary, rows }, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(summary, null, 2))
} finally {
  await client.end()
}
