import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'

const sourcePath = resolve(process.argv[2] || 'backup.sql')
const reportPath = resolve(process.argv[3] || 'tmp/legacy-prescription-study.json')
const importPlanPath = reportPath.replace(/\.json$/i, '-import-plan.json')

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

function asText(value) {
  return (value || '').trim()
}

function hasDegree(values) {
  return values.some((value) => asText(value) !== '' && asText(value) !== '0,00' && asText(value) !== '+0,00')
}

function isUsefulPrescription(prescription) {
  return hasDegree([
    prescription.rightDistanceSphere,
    prescription.rightDistanceCylinder,
    prescription.leftDistanceSphere,
    prescription.leftDistanceCylinder,
    prescription.rightNearSphere,
    prescription.rightNearCylinder,
    prescription.leftNearSphere,
    prescription.leftNearCylinder,
    prescription.rightAddition,
    prescription.leftAddition,
  ]) || Boolean(prescription.serviceDescription)
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

const customers = new Map()
const prescriptions = []
let customerRows = 0
let prescriptionRows = 0
let sourceRow = 0

if (!existsSync(sourcePath)) {
  throw new Error(`Arquivo não encontrado: ${sourcePath}`)
}

const reader = createInterface({
  input: createReadStream(sourcePath, { encoding: 'utf8' }),
  crlfDelay: Infinity,
})

for await (const line of reader) {
  if (line.startsWith('INSERT INTO `clientes` VALUES ')) {
    parseTuples(line, (row) => {
      customerRows += 1
      const legacyCustomerId = asText(row[0])
      if (!legacyCustomerId) return
      customers.set(legacyCustomerId, {
        fullName: asText(row[9]) || asText(row[8]),
        phone: asText(row[17]),
        mobilePhone: asText(row[19]),
        messagePhone: asText(row[21]),
        email: asText(row[26]),
      })
    })
  }

  if (line.startsWith('INSERT INTO `otica` VALUES ')) {
    parseTuples(line, (row) => {
      prescriptionRows += 1
      sourceRow += 1
      const legacyCustomerId = asText(row[0])
      const canonical = JSON.stringify({
        legacyCustomerId,
        serviceOrder: asText(row[1]),
        prescriptionDate: asText(row[2]),
        values: row.slice(6, 31).map(asText),
      })
      const sourceRecordHash = createHash('sha256').update(canonical).digest('hex')

      prescriptions.push({
        sourceRow,
        sourceRecordHash,
        legacyCustomerId,
        legacyServiceOrder: asText(row[1]),
        prescriptionDate: asText(row[2]),
        rightDistanceSphere: asText(row[6]),
        rightDistanceCylinder: asText(row[7]),
        rightDistanceAxis: asText(row[8]),
        rightDnp: asText(row[9]),
        rightHeight: asText(row[10]),
        leftDistanceSphere: asText(row[11]),
        leftDistanceCylinder: asText(row[12]),
        leftDistanceAxis: asText(row[13]),
        leftDnp: asText(row[14]),
        leftHeight: asText(row[15]),
        rightNearSphere: asText(row[16]),
        rightNearCylinder: asText(row[17]),
        rightNearAxis: asText(row[18]),
        leftNearSphere: asText(row[21]),
        leftNearCylinder: asText(row[22]),
        leftNearAxis: asText(row[23]),
        rightAddition: asText(row[26]),
        leftAddition: asText(row[27]),
        serviceDescription: asText(row[28]),
        receivedDate: asText(row[29]),
        receivedTime: asText(row[30]),
      })
    })
  }
}

const duplicateHashes = new Map()
const prescriptionsPerCustomer = new Map()
const dates = []
let linkedToCustomer = 0
let missingCustomer = 0
let missingName = 0
let missingPhone = 0
let withDegree = 0
let withDescription = 0

for (const prescription of prescriptions) {
  duplicateHashes.set(
    prescription.sourceRecordHash,
    (duplicateHashes.get(prescription.sourceRecordHash) || 0) + 1,
  )

  const customer = customers.get(prescription.legacyCustomerId)
  prescriptionsPerCustomer.set(
    prescription.legacyCustomerId,
    (prescriptionsPerCustomer.get(prescription.legacyCustomerId) || 0) + 1,
  )
  if (customer) {
    linkedToCustomer += 1
    if (!customer.fullName) missingName += 1
    if (!customer.phone && !customer.mobilePhone && !customer.messagePhone) missingPhone += 1
  } else {
    missingCustomer += 1
  }

  if (/^20\d{6}$/.test(prescription.prescriptionDate)) dates.push(prescription.prescriptionDate)
  if (hasDegree([
    prescription.rightDistanceSphere,
    prescription.rightDistanceCylinder,
    prescription.leftDistanceSphere,
    prescription.leftDistanceCylinder,
    prescription.rightNearSphere,
    prescription.rightNearCylinder,
    prescription.leftNearSphere,
    prescription.leftNearCylinder,
    prescription.rightAddition,
    prescription.leftAddition,
  ])) withDegree += 1
  if (prescription.serviceDescription) withDescription += 1
}

const repeatedSourceRecords = [...duplicateHashes.values()].filter((count) => count > 1)
const prescriptionCounts = [...prescriptionsPerCustomer.values()]
const customersWithMultiplePrescriptions = prescriptionCounts.filter((count) => count > 1)
const linkedPrescriptionCounts = [...prescriptionsPerCustomer.entries()]
  .filter(([legacyCustomerId]) => customers.has(legacyCustomerId))
  .map(([, count]) => count)
const linkedCustomersWithMultiplePrescriptions = linkedPrescriptionCounts.filter((count) => count > 1)
const report = {
  generatedAt: new Date().toISOString(),
  source: sourcePath,
  sourceSha256: await sha256File(sourcePath),
  customers: { rows: customerRows, uniqueLegacyIds: customers.size },
  prescriptions: {
    rows: prescriptionRows,
    linkedToCustomer,
    missingCustomer,
    withDegree,
    withoutDegree: prescriptionRows - withDegree,
    withServiceDescription: withDescription,
    withoutServiceDescription: prescriptionRows - withDescription,
    earliestDate: dates.sort()[0] || null,
    latestDate: dates.sort().at(-1) || null,
    repeatedContentGroups: repeatedSourceRecords.length,
    repeatedContentRows: repeatedSourceRecords.reduce((sum, count) => sum + count, 0),
    customersWithAtLeastOneRecord: prescriptionsPerCustomer.size,
    customersWithMultipleRecords: customersWithMultiplePrescriptions.length,
    maximumRecordsForOneCustomer: Math.max(...prescriptionCounts),
    linkedCustomersWithAtLeastOneRecord: linkedPrescriptionCounts.length,
    linkedCustomersWithMultipleRecords: linkedCustomersWithMultiplePrescriptions.length,
    linkedMaximumRecordsForOneCustomer: Math.max(...linkedPrescriptionCounts),
  },
  linkedCustomerData: { missingName, missingAnyPhone: missingPhone },
  notes: [
    'Este relatório não contém dados pessoais; os registros são processados apenas em memória.',
    'A chave de origem final deve combinar o hash do conteúdo com a ocorrência na fonte para não eliminar receitas idênticas legítimas.',
    'O vínculo com customers no banco será validado em staging usando source_customer_id, CPF normalizado e critérios aprovados de nome/telefone.',
  ],
}

const sourceSha256 = report.sourceSha256
const importPlan = {
  generatedAt: report.generatedAt,
  sourceSystem: 'legacy_optica_backup',
  sourceSha256,
  notes: [
    'Plano somente local. Nao executa insercoes em nenhum banco.',
    'A associacao ao customer_id sera feita pelo manifesto aprovado antes de qualquer carga.',
    'Registros sem grau e sem descricao de servico foram excluidos.',
  ],
  records: prescriptions
    .filter((prescription) => customers.has(prescription.legacyCustomerId) && isUsefulPrescription(prescription))
    .map((prescription) => ({
      sourceRecordKey: `${prescription.sourceRecordHash}:${prescription.sourceRow}`,
      sourceCustomerId: prescription.legacyCustomerId,
      sourceCustomerName: customers.get(prescription.legacyCustomerId).fullName,
      sourceServiceOrderId: prescription.legacyServiceOrder || null,
      prescriptionDate: /^20\d{6}$/.test(prescription.prescriptionDate)
        ? `${prescription.prescriptionDate.slice(0, 4)}-${prescription.prescriptionDate.slice(4, 6)}-${prescription.prescriptionDate.slice(6, 8)}`
        : null,
      receivedAt: /^20\d{6}$/.test(prescription.receivedDate)
        ? `${prescription.receivedDate.slice(0, 4)}-${prescription.receivedDate.slice(4, 6)}-${prescription.receivedDate.slice(6, 8)}${prescription.receivedTime ? `T${prescription.receivedTime}` : ''}`
        : null,
      receita_longe_od_esferico: prescription.rightDistanceSphere || null,
      receita_longe_od_cilindrico: prescription.rightDistanceCylinder || null,
      receita_longe_od_eixo: prescription.rightDistanceAxis || null,
      receita_longe_oe_esferico: prescription.leftDistanceSphere || null,
      receita_longe_oe_cilindrico: prescription.leftDistanceCylinder || null,
      receita_longe_oe_eixo: prescription.leftDistanceAxis || null,
      receita_perto_od_esferico: prescription.rightNearSphere || null,
      receita_perto_od_cilindrico: prescription.rightNearCylinder || null,
      receita_perto_od_eixo: prescription.rightNearAxis || null,
      receita_perto_oe_esferico: prescription.leftNearSphere || null,
      receita_perto_oe_cilindrico: prescription.leftNearCylinder || null,
      receita_perto_oe_eixo: prescription.leftNearAxis || null,
      receita_adicao_od: prescription.rightAddition || null,
      receita_adicao_oe: prescription.leftAddition || null,
      medida_dnp_od: prescription.rightDnp || null,
      medida_dnp_oe: prescription.leftDnp || null,
      medida_altura_od: prescription.rightHeight || null,
      medida_altura_oe: prescription.leftHeight || null,
      serviceDescription: prescription.serviceDescription || null,
    })),
}

const markdownReport = `# Relatório de pré-migração — histórico de graus

Gerado em: ${report.generatedAt}

## Fonte analisada

- Arquivo: \`${sourcePath}\`
- SHA-256: \`${report.sourceSha256}\`

## Volume

| Métrica | Quantidade |
| --- | ---: |
| Clientes no backup | ${report.customers.rows} |
| Receitas/registros ópticos | ${report.prescriptions.rows} |
| Clientes com ao menos uma receita | ${report.prescriptions.linkedCustomersWithAtLeastOneRecord} |
| Clientes com mais de uma receita | ${report.prescriptions.linkedCustomersWithMultipleRecords} |
| Maior número de receitas de um cliente | ${report.prescriptions.linkedMaximumRecordsForOneCustomer} |

## Qualidade e vínculo na fonte

| Verificação | Quantidade |
| --- | ---: |
| Receitas vinculadas a um cliente no backup | ${report.prescriptions.linkedToCustomer} |
| Receitas sem cliente correspondente no backup | ${report.prescriptions.missingCustomer} |
| Receitas com algum grau preenchido | ${report.prescriptions.withDegree} |
| Receitas sem grau preenchido | ${report.prescriptions.withoutDegree} |
| Receitas com descrição de serviço | ${report.prescriptions.withServiceDescription} |
| Clientes vinculados sem telefone | ${report.linkedCustomerData.missingAnyPhone} |
| Grupos de conteúdo idêntico | ${report.prescriptions.repeatedContentGroups} |

Período das receitas: ${report.prescriptions.earliestDate || 'não identificado'} a ${report.prescriptions.latestDate || 'não identificado'}.

## Decisões para a migração

- Cada receita será preservada como histórico; não haverá uma coluna única de “grau atual” no cliente.
- Registros serão vinculados ao \`customer_id\` atual da loja; o código legado será mantido somente como referência de origem.
- Clientes existentes nunca terão dados cadastrais sobrescritos automaticamente.
- CPF normalizado, telefone normalizado e combinação nome + telefone serão usados em ordem de confiança. Casos ambíguos irão para revisão manual.
- Receitas idênticas não serão eliminadas automaticamente; a importação manterá uma chave de origem com ocorrência para preservar histórico legítimo.
- As receitas migradas serão consultadas junto às OS reais no histórico de graus, sem criar OS artificiais.

## Próxima validação

Cruzar este backup com uma exportação somente leitura dos clientes da loja-alvo no sistema atual. O resultado classificará cada código legado como: vinculado com segurança, novo cliente, ambíguo ou sem dados suficientes.
`

mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
writeFileSync(reportPath.replace(/\.json$/i, '.md'), markdownReport, 'utf8')
writeFileSync(importPlanPath, `${JSON.stringify(importPlan, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
