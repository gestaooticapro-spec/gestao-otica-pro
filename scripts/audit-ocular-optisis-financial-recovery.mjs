import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [inputArg = 'tmp/optisis-financial-export.tsv', outputDirArg = 'tmp'] = process.argv.slice(2)
const decode = (value) => Buffer.from(value, 'base64').toString('utf8').trim()
const text = (value) => String(value ?? '').trim()
const money = (value) => {
  const parsed = Number(text(value).replace(',', '.'))
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0
}
const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
const amount = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const rows = readFileSync(resolve(inputArg), 'utf8').trim().split(/\r?\n/).map((line) => {
  const fields = line.split('\t').map(decode)
  return {
    purchaseId: text(fields[0]), customerId: text(fields[1]), date: text(fields[2]),
    lensCode: text(fields[3]), frameCode: text(fields[4]), treatmentCode: text(fields[5]), solarCode: text(fields[6]),
    lensValue: money(fields[7]), frameValue: money(fields[8]), treatmentValue: money(fields[9]), total: money(fields[10]),
    entry: money(fields[11]), remaining: money(fields[12]), installments: Number(text(fields[13]) || 0), installmentValue: money(fields[14]),
    paymentMethod: text(fields[15]), situation: text(fields[16]),
  }
})

const summary = {
  sourceRows: rows.length,
  totalPositive: 0,
  totalZero: 0,
  safeFinancialRecovery: 0,
  totalMatchesComponents: 0,
  totalDiffersComponents: 0,
  totalZeroWithPositiveComponents: 0,
  entryRemainingMatchTotal: 0,
  entryRemainingDifferTotal: 0,
}
const review = []

for (const row of rows) {
  const components = Number((row.lensValue + row.frameValue + row.treatmentValue).toFixed(2))
  const componentsMatch = Math.abs(components - row.total) < 0.005
  const entryRemainingMatch = Math.abs((row.entry + row.remaining) - row.total) < 0.005

  if (row.total > 0) {
    summary.totalPositive += 1
    if (componentsMatch) {
      summary.totalMatchesComponents += 1
      summary.safeFinancialRecovery += 1
    } else {
      summary.totalDiffersComponents += 1
      review.push({ ...row, components, reason: 'total_diferente_da_soma_dos_componentes' })
    }
    if (entryRemainingMatch) summary.entryRemainingMatchTotal += 1
    else {
      summary.entryRemainingDifferTotal += 1
      review.push({ ...row, components, reason: 'sinal_mais_restante_diferente_do_total' })
    }
  } else {
    summary.totalZero += 1
    if (components > 0) {
      summary.totalZeroWithPositiveComponents += 1
      review.push({ ...row, components, reason: 'total_zero_com_componentes_positivos' })
    }
  }
}

mkdirSync(resolve(outputDirArg), { recursive: true })
const reportPath = resolve(outputDirArg, 'ocular-optisis-financial-recovery-audit.md')
const reviewPath = resolve(outputDirArg, 'ocular-optisis-financial-recovery-review.csv')

writeFileSync(reportPath, `# Auditoria financeira — recuperação Optisis\n\nFonte: \`${inputArg}\`\n\n- Compras lidas: ${summary.sourceRows}\n- Com total positivo: ${summary.totalPositive}\n- Com total zerado no próprio Optisis: ${summary.totalZero}\n- Prontas para correção automática (total = lente + armação + tratamento): ${summary.safeFinancialRecovery}\n- Divergências entre total e componentes: ${summary.totalDiffersComponents}\n- Registros zerados com algum componente positivo: ${summary.totalZeroWithPositiveComponents}\n- Total conciliado por sinal + restante: ${summary.entryRemainingMatchTotal}\n- Divergências entre sinal + restante e total: ${summary.entryRemainingDifferTotal}\n\n## Regra proposta\n\nAtualizar somente vendas históricas já existentes cujo identificador seja \`optisis-tabcompra:<Codigocompra>\` e cujo total seja positivo e igual à soma de lente, armação e tratamento no MDB. As divergências ficam fora da atualização automática e entram no CSV de revisão.\n\nOs campos \`Sinal\` e \`Restante\` serão preservados como memória da origem; não criam caixa, comissão, estoque, OS, pagamento nem parcelas novos.\n`, 'utf8')

const header = ['compra_optisis', 'cliente_optisis', 'data', 'motivo', 'valor_lentes', 'valor_armacao', 'valor_tratamento', 'soma_componentes', 'valor_total', 'sinal', 'restante', 'forma_pagamento', 'situacao']
const body = review.map((row) => [row.purchaseId, row.customerId, row.date, row.reason, row.lensValue, row.frameValue, row.treatmentValue, row.components, row.total, row.entry, row.remaining, row.paymentMethod, row.situation].map(csv).join(';'))
writeFileSync(reviewPath, `${header.join(';')}\n${body.join('\n')}\n`, 'utf8')

console.log(JSON.stringify({ summary, reportPath, reviewPath, examples: review.slice(0, 10).map((row) => ({ purchaseId: row.purchaseId, reason: row.reason, total: amount(row.total), components: amount(row.components) })) }, null, 2))
