import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const commit = process.argv.includes('--commit')
const AUDIT_JSON = path.join('tmp', 'original_catalogs_deep_audit.json')
const OUT_MD = path.join('tmp', 'flattened_grid_findings_resolved_review.md')
const OUT_JSON = path.join('tmp', 'flattened_grid_findings_resolved_review.json')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

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
  const metadata = row.grid?.metadata && typeof row.grid.metadata === 'object' ? row.grid.metadata : {}

  if (version.startsWith('Haytek') && page === 'Pagina 8') {
    return {
      status: 'source_validated_not_flattening',
      evidence: 'Haytek p.8 mostra grade unica ampla por indice para visao simples, incluindo 1.67/1.74.',
    }
  }

  if (version.startsWith('Haytek') && page === 'Pagina 9') {
    return {
      status: 'source_validated_not_flattening',
      evidence: 'Haytek p.9 usa bloco global Transitions Gen S por indice; grade ampla foi validada na importacao.',
    }
  }

  if (version.startsWith('Gamalab') && ['Dynamic Single', 'Visão Simples Surfaçadas Digital'].includes(family)) {
    return {
      status: 'inferred_source_validated_not_flattening',
      evidence:
        'Gamalab p.17/p.19 nao exibem grade tecnica; grade foi inferida provisoriamente da Haytek Visao Simples p.8, cuja fonte mostra grade unica ampla.',
    }
  }

  if (version.startsWith('HOYA') && metadata.raw_grade) {
    return {
      status: 'source_validated_not_flattening',
      evidence: `HOYA importou raw_grade da fonte (${metadata.raw_grade}); a amplitude da grade e regra do catalogo, nao achatamento detectado.`,
    }
  }

  if (version.startsWith('Optilab')) {
    if (family === 'Lentes Essilor' && page === 'Pagina 28') {
      return {
        status: 'source_validated_not_flattening',
        evidence:
          'Optilab p.28 mostra nota lateral: Orma ate cil -4; Airwear/Stylis 1.67/Stylis 1.74 ate cil -8. Grades amplas de Stylis/Airwear estao coerentes.',
      }
    }

    if (family.includes('EYEZEN')) {
      return {
        status: 'source_validated_not_flattening',
        evidence: 'Optilab p.22-25 Eyezen Boost/Start foram revisadas; fonte informa cilindrico ate -6 e altura minima 18mm.',
      }
    }

    if (family === 'Kodak' || family === 'LENTES ESPACE®' || family === 'iTop') {
      return {
        status: 'source_validated_not_flattening',
        evidence:
          'Optilab: grupo ja revisado por scripts especificos contra fonte local; a grade unica ampla e regra da linha/material.',
      }
    }
  }

  return {
    status: 'needs_manual_review',
    evidence: 'Sem evidencia local suficiente para marcar como falso positivo.',
  }
}

async function main() {
  const audit = JSON.parse(fs.readFileSync(AUDIT_JSON, 'utf8'))
  const findings = walkFindings(audit)
  const reviewedAt = new Date().toISOString()

  const rows = findings.map((finding) => ({
    ...finding,
    grid_id: finding.grid?.id,
    ...classify(finding),
  }))

  const unresolved = rows.filter((row) => row.status === 'needs_manual_review')
  if (unresolved.length) {
    throw new Error(`Ainda ha ${unresolved.length} possible_flattened_grid sem classificacao segura.`)
  }

  const updates = rows.map((row) => {
    const metadata = row.grid?.metadata && typeof row.grid.metadata === 'object' ? row.grid.metadata : {}
    return {
      id: row.grid_id,
      metadata: {
        ...metadata,
        flattened_grid_review_status: row.status,
        flattened_grid_reviewed_at: reviewedAt,
        flattened_grid_review_evidence: row.evidence,
      },
    }
  })

  if (commit) {
    for (const update of updates) {
      const { error } = await supabase.from('global_offer_diopter_grids').update({ metadata: update.metadata }).eq('id', update.id)
      if (error) throw error
    }
  }

  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1
    return acc
  }, {})

  const groups = rows.reduce((acc, row) => {
    const key = `${row.status} | ${row.version} | ${row.family} | ${row.page}`
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const report = {
    generated_at: reviewedAt,
    commit,
    findings_count: rows.length,
    updates_count: updates.length,
    counts,
    groups,
    rows: rows.map((row) => ({
      status: row.status,
      version: row.version,
      family: row.family,
      offer: row.offer,
      page: row.page,
      grid_id: row.grid_id,
      evidence: row.evidence,
    })),
  }

  const md = [
    '# Revisao dos Possible Flattened Grid',
    '',
    `Gerado em: ${reviewedAt}`,
    `Modo: ${commit ? 'COMMIT aplicado' : 'dry-run'}`,
    '',
    '## Resumo',
    '',
    `- Suspeitas revisadas: ${rows.length}`,
    `- Grades a marcar/marcadas: ${updates.length}`,
    ...Object.entries(counts).map(([status, count]) => `- ${status}: ${count}`),
    '',
    '## Decisao',
    '',
    '- Nenhuma grade foi alterada em faixa esf/cil/add.',
    '- As suspeitas foram resolvidas como falso positivo operacional ou inferencia fonte-validada.',
    '- O BD recebeu apenas metadados de revisao para auditoria futura.',
    '',
    '## Grupos',
    '',
    ...Object.entries(groups)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => `- ${count} | ${key}`),
  ].join('\n')

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2))
  fs.writeFileSync(OUT_MD, md)
  console.log(md)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
