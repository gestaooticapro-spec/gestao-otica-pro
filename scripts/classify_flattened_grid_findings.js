import fs from 'fs'

const audit = JSON.parse(fs.readFileSync('tmp/original_catalogs_deep_audit.json', 'utf8'))

function walkFindings(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) walkFindings(item, out)
    return out
  }

  if (!value || typeof value !== 'object') return out
  if (value.type === 'possible_flattened_grid') out.push(value)

  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') walkFindings(child, out)
  }

  return out
}

function classify(row) {
  const version = row.version || ''
  const family = row.family || ''
  const page = row.page || ''

  if (version.startsWith('Haytek')) {
    if (page === 'Pagina 8') {
      return {
        bucket: 'provavel_falso_positivo_fonte_validada',
        reason: 'Haytek pagina 8: VS com grade ampla unica validada durante importacao Haytek.',
      }
    }
    if (page === 'Pagina 9') {
      return {
        bucket: 'provavel_falso_positivo_fonte_validada',
        reason: 'Haytek pagina 9: Transitions Gen S usa grade global por indice validada durante importacao Haytek.',
      }
    }
  }

  if (version.startsWith('HOYA')) {
    return {
      bucket: 'provavel_falso_positivo_fonte_validada',
      reason: 'HOYA ja revisada por blocos/scripts contra fonte; sanidade fechou com 489 ofertas e 489 grades.',
    }
  }

  if (version.startsWith('Optilab')) {
    if (family.includes('EYEZEN') || family === 'Kodak' || family.includes('Lentes Essilor') || family.includes('ESPACE')) {
      return {
        bucket: 'provavel_falso_positivo_fonte_validada',
        reason: 'Optilab: bloco revisado contra scripts/fonte; grade ampla parece regra de bloco, nao achatamento indevido.',
      }
    }
    if (family === 'iTop') {
      return {
        bucket: 'provavel_falso_positivo_fonte_validada',
        reason: 'Optilab iTop paginas 39-40 revisadas; scripts antigos tinham falsos positivos e agora fecham com 0 patches.',
      }
    }
  }

  return {
    bucket: 'precisa_revisao_fonte',
    reason: 'Sem classificacao automatica segura; revisar PDF/imagem antes de alterar BD.',
  }
}

const findings = walkFindings(audit)
const rows = findings.map((row) => ({ ...row, ...classify(row) }))

const counts = {}
const groupCounts = {}

for (const row of rows) {
  counts[row.bucket] = (counts[row.bucket] || 0) + 1
  const key = `${row.bucket} | ${row.version} | ${row.family} | ${row.page}`
  groupCounts[key] = (groupCounts[key] || 0) + 1
}

const lines = [
  '# Triagem de Suspeitas de Grade Achatada',
  '',
  `Gerado em: ${new Date().toISOString()}`,
  '',
  '## Resumo',
  '',
  `- Total de suspeitas: ${rows.length}`,
  ...Object.entries(counts).map(([bucket, count]) => `- ${bucket}: ${count}`),
  '',
  '## Leitura',
  '',
  '- Esta triagem nao altera o BD.',
  '- O objetivo e evitar correcao em massa cega em grades que parecem amplas na heuristica, mas foram validadas na fonte.',
  '- Itens em `provavel_falso_positivo_fonte_validada` devem ser preservados por enquanto.',
  '- Itens em `precisa_revisao_fonte` sao os unicos candidatos reais para reabrir PDF/imagem antes de patch.',
  '',
  '## Grupos',
  '',
]

for (const [key, count] of Object.entries(groupCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  lines.push(`- ${count} | ${key}`)
}

lines.push('', '## Detalhe', '')

for (const row of rows.sort((a, b) => `${a.bucket}${a.version}${a.family}${a.offer}`.localeCompare(`${b.bucket}${b.version}${b.family}${b.offer}`))) {
  lines.push(`- ${row.bucket} | ${row.version} | ${row.family} | ${row.offer} | ${row.page} | ${row.reason}`)
}

fs.writeFileSync('tmp/flattened_grid_findings_triage.json', JSON.stringify(rows, null, 2))
fs.writeFileSync('tmp/flattened_grid_findings_triage.md', lines.join('\n'))

console.log(JSON.stringify({ total: rows.length, counts }, null, 2))
