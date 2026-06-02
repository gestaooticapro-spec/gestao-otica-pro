import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const VERSION_ID = 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'
const CSV_PATH = path.join(process.cwd(), 'tmp', 'gamalab_page23_reextracted_review.csv')

const args = process.argv.slice(2)
const commit = args.includes('--commit')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function parseCsvLine(line) {
  const out = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    const next = line[i + 1]
    if (ch === '"' && inQuotes && next === '"') {
      current += '"'
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  out.push(current)
  return out
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).filter(Boolean)
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']))
  })
}

function normalize(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ﬂﬁ]/g, (m) => (m === 'ﬂ' ? 'fl' : 'fi'))
    .replace(/ï¬‚/g, 'fl')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function stripGradeSuffix(label) {
  return String(label || '').replace(/\s+\[grade .+\]$/i, '').trim()
}

function toNumber(value) {
  if (value === '' || value == null) return null
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function inferFeatures(row, current = {}) {
  const label = normalize(`${row.raw_label} ${row.canonical_label}`)
  const cost = toNumber(row.cost_price)
  return {
    ...current,
    foto: label.includes('fotossens') || label.includes('transitions'),
    solar: false,
    pronta: true,
    blue_uv: label.includes('blue uv'),
    sensity: false,
    espelhada: false,
    espelhado: false,
    acclimates: false,
    cost_price: cost,
    extractive: false,
    polarizado: false,
    photofusion: false,
    sob_demanda: false,
    transitions: label.includes('transitions'),
    antirreflexo: label.includes('ar') || label.includes('antirreflexo'),
    pronta_entrega: true,
    fulfillment_mode: 'pronta',
    longer_lead_time: false,
    antirreflexo_externo: false,
    potential_thinner_lighter: false,
  }
}

function rowToOffer(row, familyId) {
  return {
    family_id: familyId,
    raw_label: row.raw_label,
    canonical_label: row.canonical_label,
    material: row.material || null,
    indice_refracao: toNumber(row.indice_refracao),
    is_atomic_offer: true,
    allows_composition: false,
    already_includes_treatment: true,
    features: inferFeatures(row),
    base_price: toNumber(row.base_price),
    source_page_reference: row.source_page_reference,
    confidence_level: toNumber(row.confidence_level) ?? 0.95,
    import_key: `${row.source_page_reference} | ${row.canonical_label} | ${row.base_price} | ${row.legacy_code}`,
    clinical_category: 'visao_simples',
  }
}

async function main() {
  console.log(`DRY-RUN: ${commit ? 'NAO (aplicando)' : 'SIM'}\n`)

  const rows = readCsv(CSV_PATH)
  const missingRows = rows.filter((r) => r.status_current_import === 'missing')
  const relabelRows = rows.filter((r) => r.status_current_import === 'exists_needs_label_disambiguation')

  const { data: families, error: familyError } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', VERSION_ID)
    .eq('nome', 'Gama Acabadas')
  if (familyError) throw familyError
  if (!families?.length) throw new Error('Familia Gama Acabadas nao encontrada')
  const familyId = families[0].id

  const { data: offers, error: offersError } = await supabase
    .from('global_lens_offers')
    .select('id,raw_label,canonical_label,base_price,import_key,features')
    .eq('family_id', familyId)
    .eq('source_page_reference', 'Pagina 23')
  if (offersError) throw offersError

  const relabelPlans = []
  for (const row of relabelRows) {
    const oldCanonical = `${row.family_name} ${stripGradeSuffix(row.raw_label)}`
    const candidates = offers.filter(
      (offer) =>
        normalize(offer.canonical_label) === normalize(oldCanonical) &&
        Number(offer.base_price) === Number(row.base_price) &&
        String(offer.import_key || '').includes(`| ${row.legacy_code}`)
    )
    if (candidates.length !== 1) {
      throw new Error(`Relabel sem match unico: ${row.canonical_label} encontrou ${candidates.length}`)
    }
    const current = candidates[0]
    relabelPlans.push({
      id: current.id,
      from: current.canonical_label,
      to: row.canonical_label,
      patch: {
        raw_label: row.raw_label,
        canonical_label: row.canonical_label,
        import_key: `${row.source_page_reference} | ${row.canonical_label} | ${row.base_price} | ${row.legacy_code}`,
        features: inferFeatures(row, current.features || {}),
      },
    })
  }

  const insertPlans = missingRows.map((row) => rowToOffer(row, familyId))

  console.log('Resumo:')
  console.log(`  linhas reextraidas: ${rows.length}`)
  console.log(`  ofertas faltantes para inserir: ${insertPlans.length}`)
  console.log(`  ofertas existentes para desambiguar label: ${relabelPlans.length}\n`)

  for (const plan of relabelPlans) {
    console.log(`[relabel] ${plan.from}`)
    console.log(`  -> ${plan.to}`)
  }

  for (const plan of insertPlans) {
    console.log(`[insert offer] ${plan.canonical_label}`)
    console.log(`  price=${plan.base_price} cost=${plan.features.cost_price} import_key="${plan.import_key}"`)
  }

  if (commit) {
    for (const plan of relabelPlans) {
      const { error } = await supabase.from('global_lens_offers').update(plan.patch).eq('id', plan.id)
      if (error) throw error
    }
    if (insertPlans.length) {
      const { error } = await supabase.from('global_lens_offers').insert(insertPlans)
      if (error) throw error
    }
    console.log('\nAplicado.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
