import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { createClient } from '@supabase/supabase-js'

const sourcePath = resolve(process.argv[2] || 'backup.sql')
const storeId = Number(process.argv[3])
const reportPath = resolve(process.argv[4] || 'tmp/legacy-customer-match-report.json')
const comparisonPath = reportPath.replace(/\.json$/i, '-comparison.csv')
const manifestPath = reportPath.replace(/\.json$/i, '-migration-manifest.csv')

if (!existsSync(sourcePath)) throw new Error(`Arquivo não encontrado: ${sourcePath}`)
if (!Number.isInteger(storeId) || storeId <= 0) throw new Error('Informe um store_id válido.')
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Variáveis do Supabase ausentes no ambiente.')
}

function decodeMysqlString(value) {
  return value
    .replace(/\\0/g, '\0')
    .replace(/\\b/g, '\b')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\Z/g, '\x1a')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

function parseValues(tuple) {
  const values = []
  let index = 0
  while (index < tuple.length) {
    while (index < tuple.length && /[\s,]/.test(tuple[index])) index += 1
    if (index >= tuple.length) break
    if (tuple[index] === "'") {
      index += 1
      let value = ''
      while (index < tuple.length) {
        if (tuple[index] === '\\' && index + 1 < tuple.length) {
          value += tuple.slice(index, index + 2)
          index += 2
        } else if (tuple[index] === "'") {
          if (tuple[index + 1] === "'") {
            value += "'"
            index += 2
          } else {
            index += 1
            break
          }
        } else {
          value += tuple[index]
          index += 1
        }
      }
      values.push(decodeMysqlString(value))
      continue
    }
    const start = index
    while (index < tuple.length && tuple[index] !== ',') index += 1
    const raw = tuple.slice(start, index).trim()
    values.push(raw.toUpperCase() === 'NULL' ? null : raw)
  }
  return values
}

function parseTuples(statement, callback) {
  const valuesStart = statement.indexOf(' VALUES ')
  if (valuesStart === -1) return
  let index = valuesStart + ' VALUES '.length
  let tupleStart = -1
  let depth = 0
  let quoted = false
  while (index < statement.length) {
    const character = statement[index]
    if (quoted) {
      if (character === '\\') {
        index += 2
        continue
      }
      if (character === "'") {
        if (statement[index + 1] === "'") index += 2
        else {
          quoted = false
          index += 1
        }
        continue
      }
      index += 1
      continue
    }
    if (character === "'") quoted = true
    else if (character === '(') {
      if (depth === 0) tupleStart = index + 1
      depth += 1
    } else if (character === ')') {
      depth -= 1
      if (depth === 0 && tupleStart !== -1) {
        callback(parseValues(statement.slice(tupleStart, index)))
        tupleStart = -1
      }
    }
    index += 1
  }
}

const text = (value) => (value || '').trim()
const digits = (value) => text(value).replace(/\D/g, '')
const normalizeName = (value) => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ')
const normalizeDate = (value) => {
  const raw = digits(value)
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  return ''
}
const validDocument = (value) => {
  const normalized = digits(value)
  return (normalized.length === 11 || normalized.length === 14) && !/^(\d)\1+$/.test(normalized)
    ? normalized
    : ''
}
const normalizedPhone = (value) => {
  let normalized = digits(value)
  if (normalized.startsWith('55') && normalized.length >= 12) normalized = normalized.slice(2)
  return normalized.length >= 10 ? normalized : ''
}
const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
const hasMeaningfulDegree = (value) => {
  const normalized = text(value).replace(/\s/g, '').replace(',', '.').replace(/^\+/, '')
  return normalized !== '' && normalized !== '0' && normalized !== '0.0' && normalized !== '0.00'
}
const isUsefulPrescription = (row) => {
  const degreeIndexes = [6, 7, 11, 12, 16, 17, 21, 22, 26, 27]
  return degreeIndexes.some((index) => hasMeaningfulDegree(row[index])) || Boolean(text(row[28]))
}

const legacyCustomers = new Map()
const prescriptionCountByLegacyCustomer = new Map()
const reader = createInterface({ input: createReadStream(sourcePath, { encoding: 'utf8' }), crlfDelay: Infinity })

for await (const line of reader) {
  if (line.startsWith('INSERT INTO `clientes` VALUES ')) {
    parseTuples(line, (row) => {
      const legacyId = text(row[0])
      if (!legacyId) return
      const legalName = text(row[8])
      const displayName = text(row[9])
      legacyCustomers.set(legacyId, {
        legacyId,
        fullName: legalName || displayName,
        displayName,
        cpf: validDocument(row[5]),
        phone: normalizedPhone(row[17]),
        mobilePhone: normalizedPhone(row[19]),
        messagePhone: normalizedPhone(row[21]),
        birthDate: normalizeDate(row[25]),
        email: text(row[26]).toLowerCase(),
      })
    })
  }
  if (line.startsWith('INSERT INTO `otica` VALUES ')) {
    parseTuples(line, (row) => {
      const legacyId = text(row[0])
      if (!legacyId) return
      const counts = prescriptionCountByLegacyCustomer.get(legacyId) || { total: 0, useful: 0 }
      counts.total += 1
      if (isUsefulPrescription(row)) counts.useful += 1
      prescriptionCountByLegacyCustomer.set(legacyId, counts)
    })
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const currentCustomers = []
const pageSize = 1000
for (let from = 0; ; from += pageSize) {
  const { data, error } = await supabase
    .from('customers')
    .select('id, full_name, cpf, phone, fone_movel, email, birth_date')
    .eq('store_id', storeId)
    .order('id')
    .range(from, from + pageSize - 1)
  if (error) throw new Error(error.message)
  currentCustomers.push(...(data || []))
  if (!data || data.length < pageSize) break
}

function addToIndex(index, key, customer) {
  if (!key) return
  const values = index.get(key) || []
  values.push(customer)
  index.set(key, values)
}

const byCpf = new Map()
const byPhone = new Map()
const byName = new Map()
for (const customer of currentCustomers) {
  addToIndex(byCpf, validDocument(customer.cpf), customer)
  addToIndex(byPhone, normalizedPhone(customer.phone), customer)
  addToIndex(byPhone, normalizedPhone(customer.fone_movel), customer)
  addToIndex(byName, normalizeName(customer.full_name), customer)
}

const setFrom = (values) => new Map(values.map((customer) => [customer.id, customer]))
const intersect = (left, right) => new Map([...left].filter(([id]) => right.has(id)))
const results = []

for (const legacy of legacyCustomers.values()) {
  const legacyPhones = [legacy.phone, legacy.mobilePhone, legacy.messagePhone].filter(Boolean)
  const cpfCandidates = setFrom(byCpf.get(legacy.cpf) || [])
  const phoneCandidates = setFrom(legacyPhones.flatMap((phone) => byPhone.get(phone) || []))
  const nameCandidates = setFrom(
    [...new Set([legacy.fullName, legacy.displayName].map(normalizeName).filter(Boolean))]
      .flatMap((name) => byName.get(name) || []),
  )
  const namePhoneCandidates = intersect(nameCandidates, phoneCandidates)
  const nameBirthCandidates = new Map(
    [...nameCandidates].filter(([, candidate]) => legacy.birthDate && candidate.birth_date === legacy.birthDate),
  )

  let status = 'new_customer_candidate'
  let matchedCustomer = null
  let candidates = []

  if (cpfCandidates.size === 1) {
    status = 'match_cpf'
    matchedCustomer = [...cpfCandidates.values()][0]
  } else if (cpfCandidates.size > 1) {
    status = 'review_cpf_ambiguous'
    candidates = [...cpfCandidates.values()]
  } else if (namePhoneCandidates.size === 1) {
    status = 'match_name_phone'
    matchedCustomer = [...namePhoneCandidates.values()][0]
  } else if (nameBirthCandidates.size === 1) {
    status = 'match_name_birth_date'
    matchedCustomer = [...nameBirthCandidates.values()][0]
  } else if (phoneCandidates.size === 1) {
    status = 'new_customer_candidate_shared_phone'
  } else if (nameCandidates.size === 1) {
    status = 'match_name_confirmed'
    matchedCustomer = [...nameCandidates.values()][0]
  } else if (phoneCandidates.size || nameCandidates.size) {
    status = 'review_multiple_candidates'
    candidates = [...new Map([...phoneCandidates, ...nameCandidates]).values()]
  }

  results.push({
    ...legacy,
    prescriptionCount: prescriptionCountByLegacyCustomer.get(legacy.legacyId)?.total || 0,
    usefulPrescriptionCount: prescriptionCountByLegacyCustomer.get(legacy.legacyId)?.useful || 0,
    status,
    matchedCustomerId: matchedCustomer?.id || null,
    candidateCustomerIds: candidates.map((candidate) => candidate.id),
    candidateCustomers: matchedCustomer ? [matchedCustomer] : candidates,
  })
}

const byStatus = Object.fromEntries(
  [...new Set(results.map((result) => result.status))]
    .sort()
    .map((status) => [status, results.filter((result) => result.status === status).length]),
)
const matched = results.filter((result) => result.matchedCustomerId)
const migrationCandidates = results.filter((result) => result.usefulPrescriptionCount > 0)
const orphanPrescriptionCounts = [...prescriptionCountByLegacyCustomer.entries()]
  .filter(([legacyId]) => !legacyCustomers.has(legacyId))
  .reduce((counts, [, value]) => ({
    total: counts.total + value.total,
    useful: counts.useful + value.useful,
  }), { total: 0, useful: 0 })
const report = {
  generatedAt: new Date().toISOString(),
  source: sourcePath,
  targetStoreId: storeId,
  currentCustomersInStore: currentCustomers.length,
  legacyCustomers: results.length,
  legacyCustomersWithPrescriptions: results.filter((result) => result.prescriptionCount > 0).length,
  legacyPrescriptionRows: results.reduce((total, result) => total + result.prescriptionCount, 0),
  legacyUsefulPrescriptionRows: results.reduce((total, result) => total + result.usefulPrescriptionCount, 0),
  orphanLegacyPrescriptionRows: orphanPrescriptionCounts.total,
  orphanLegacyUsefulPrescriptionRows: orphanPrescriptionCounts.useful,
  matchSummary: byStatus,
  safeMatches: matched.length,
  prescriptionsLinkedBySafeMatches: matched.reduce((total, result) => total + result.prescriptionCount, 0),
  migrationSummary: {
    eligibleLegacyCustomers: migrationCandidates.length,
    linkExistingCustomer: migrationCandidates.filter((result) => result.matchedCustomerId).length,
    createCustomer: migrationCandidates.filter((result) => !result.matchedCustomerId).length,
    eligiblePrescriptionRows: migrationCandidates.reduce((total, result) => total + result.usefulPrescriptionCount, 0),
    excludedEmptyPrescriptionRows: results.reduce((total, result) => total + result.prescriptionCount - result.usefulPrescriptionCount, 0),
  },
  comparisonFile: comparisonPath,
  migrationManifestFile: manifestPath,
  warnings: [
    'Nenhum cliente foi criado, alterado ou vinculado nesta execução.',
    'Telefone isolado nunca é usado para mesclar clientes: ele pode ser compartilhado por pessoas diferentes.',
    'Para esta migração, a confirmação do responsável autoriza vínculo por nome normalizado igual quando houver um único candidato na loja.',
    'O arquivo CSV comparativo contém dados pessoais e deve permanecer local.',
  ],
}

const comparisonRows = results
  .filter((result) => result.status !== 'new_customer_candidate')
  .flatMap((result) => result.candidateCustomers.map((candidate) => [
    result.status,
    result.legacyId,
    result.fullName,
    result.displayName,
    result.cpf,
    [result.phone, result.mobilePhone, result.messagePhone].filter(Boolean).join(' | '),
    result.birthDate,
    result.prescriptionCount,
    candidate.id,
    candidate.full_name,
    candidate.cpf || '',
    candidate.phone || '',
    candidate.fone_movel || '',
    candidate.birth_date || '',
  ]))

const csvContents = [
  [
    'classification',
    'legacy_customer_id',
    'legacy_name',
    'legacy_display_name',
    'legacy_cpf',
    'legacy_phones',
    'legacy_birth_date',
    'legacy_prescription_count',
    'current_customer_id',
    'current_name',
    'current_cpf',
    'current_phone',
    'current_mobile_phone',
    'current_birth_date',
  ].map(csv).join(';'),
  ...comparisonRows.map((row) => row.map(csv).join(';')),
].join('\n') + '\n'

const manifestRows = migrationCandidates.map((result) => [
  result.matchedCustomerId ? 'link_existing_customer' : 'create_customer',
  result.status,
  result.legacyId,
  result.fullName,
  result.displayName,
  result.cpf,
  [result.phone, result.mobilePhone, result.messagePhone].filter(Boolean).join(' | '),
  result.birthDate,
  result.matchedCustomerId || '',
  result.matchedCustomerId ? result.candidateCustomers[0]?.full_name || '' : '',
  result.prescriptionCount,
  result.usefulPrescriptionCount,
  result.prescriptionCount - result.usefulPrescriptionCount,
])

const manifestContents = [
  [
    'action',
    'match_method',
    'legacy_customer_id',
    'legacy_name',
    'legacy_display_name',
    'legacy_cpf',
    'legacy_phones',
    'legacy_birth_date',
    'target_customer_id',
    'target_customer_name',
    'legacy_prescription_count',
    'useful_prescription_count',
    'excluded_empty_prescription_count',
  ].map(csv).join(';'),
  ...manifestRows.map((row) => row.map(csv).join(';')),
].join('\n') + '\n'

mkdirSync(dirname(reportPath), { recursive: true })
let actualComparisonPath = comparisonPath
try {
  writeFileSync(actualComparisonPath, csvContents, 'utf8')
} catch (error) {
  if (error?.code !== 'EBUSY') throw error
  actualComparisonPath = comparisonPath.replace(/\.csv$/i, `-updated-${Date.now()}.csv`)
  writeFileSync(actualComparisonPath, csvContents, 'utf8')
}
report.comparisonFile = actualComparisonPath
let actualManifestPath = manifestPath
try {
  writeFileSync(actualManifestPath, manifestContents, 'utf8')
} catch (error) {
  if (error?.code !== 'EBUSY') throw error
  actualManifestPath = manifestPath.replace(/\.csv$/i, `-updated-${Date.now()}.csv`)
  writeFileSync(actualManifestPath, manifestContents, 'utf8')
}
report.migrationManifestFile = actualManifestPath
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
