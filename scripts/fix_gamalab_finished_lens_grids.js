import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const VERSION_ID = 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'
const CSV_PATH = path.join(process.cwd(), 'tmp', 'gamalab_offers_review_v2026.csv')
const PAGE23_REEXTRACTED_PATH = path.join(process.cwd(), 'tmp', 'gamalab_page23_reextracted_review.csv')
const TARGET_PAGES = new Set(['Pagina 22', 'Pagina 23', 'Pagina 24'])

const args = process.argv.slice(2)
const commit = args.includes('--commit')
const includeEmBreve = args.includes('--include-em-breve')
const fullPreview = args.includes('--full-preview')
const allowIncompleteSource = args.includes('--allow-incomplete-source')

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

function loadRowsWithReextractedPage23() {
  let rows = readCsv(CSV_PATH)
  if (fs.existsSync(PAGE23_REEXTRACTED_PATH)) {
    const page23Rows = readCsv(PAGE23_REEXTRACTED_PATH)
    rows = rows.filter((row) => !(row.source_page_reference === 'Pagina 23' && row.family_name === 'Gama Acabadas'))
    rows.push(...page23Rows)
  }
  return rows
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

function numbers(text) {
  return [...String(text || '').matchAll(/[+-]?\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')))
}

function parseAvailability(rawText) {
  const raw = String(rawText || '').trim()
  const lower = normalize(raw)
  const notes = []

  if (!raw) return { error: 'availability_text vazio' }
  if (lower.includes('em breve')) notes.push('em_breve')
  if (lower.includes('soma do esferico')) notes.push('soma_esferico_cilindrico_ate_-4.00')
  if (raw.includes('/')) notes.push('lista_esfericos_discretos')

  const cilMatch = raw.match(/(?:^|\s)cil(?:\s|$)/i)
  const sphPartRaw = cilMatch ? raw.slice(0, cilMatch.index).trim() : raw
  const cylPartRaw = cilMatch ? raw.slice(cilMatch.index + cilMatch[0].length).trim() : ''
  const sphNums = numbers(sphPartRaw)
  const cylNums = numbers(cylPartRaw.split('(')[0])

  if (!sphNums.length) return { error: `nao consegui ler esferico em "${raw}"` }

  const sphMin = Math.min(...sphNums)
  const sphMax = Math.max(...sphNums)

  let cylMin = 0
  let cylMax = 0
  if (cylNums.length === 1) {
    cylMin = Math.min(cylNums[0], 0)
    cylMax = Math.max(cylNums[0], 0)
  } else if (cylNums.length > 1) {
    cylMin = Math.min(...cylNums)
    cylMax = Math.max(...cylNums)
  } else {
    notes.push('cilindro_nao_informado_assumido_plano')
  }

  return {
    sph_min: sphMin,
    sph_max: sphMax,
    cyl_min: cylMin,
    cyl_max: cylMax,
    add_min: null,
    add_max: null,
    metadata: {
      raw_grade: raw,
      source: 'tmp/gamalab_offers_review_v2026.csv',
      source_kind: 'gamalab_finished_lens_availability',
      notes,
    },
  }
}

async function fetchAll(table, select, queryBuilder) {
  const pageSize = 1000
  let from = 0
  let all = []
  while (true) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (queryBuilder) query = queryBuilder(query)
    const { data, error } = await query
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function main() {
  console.log(`DRY-RUN: ${commit ? 'NAO (aplicando)' : 'SIM'}`)
  console.log(`Incluir Em Breve: ${includeEmBreve ? 'SIM' : 'NAO'}\n`)

  const rows = loadRowsWithReextractedPage23().filter(
    (row) => TARGET_PAGES.has(row.source_page_reference) && String(row.availability_text || '').trim()
  )

  const families = await fetchAll('global_lens_families', 'id,nome', (q) => q.eq('version_id', VERSION_ID))
  const familyIds = families.map((f) => f.id)
  const familyById = new Map(families.map((f) => [f.id, f]))

  const offers = await fetchAll(
    'global_lens_offers',
    'id,family_id,canonical_label,raw_label,source_page_reference',
    (q) => q.in('family_id', familyIds).in('source_page_reference', [...TARGET_PAGES])
  )
  const offerByKey = new Map()
  for (const offer of offers) {
    const family = familyById.get(offer.family_id)
    const keys = [
      `${offer.source_page_reference}|${normalize(family?.nome)}|${normalize(offer.canonical_label)}`,
      `${offer.source_page_reference}|${normalize(family?.nome)}|${normalize(offer.raw_label)}`,
    ]
    for (const key of keys) {
      if (!offerByKey.has(key)) offerByKey.set(key, [])
      offerByKey.get(key).push(offer)
    }
  }

  const offerIds = offers.map((o) => o.id)
  const grids = await fetchAll('global_offer_diopter_grids', 'id,offer_id,sph_min,sph_max,cyl_min,cyl_max,metadata', (q) =>
    q.in('offer_id', offerIds)
  )
  const gridsByOfferId = new Map()
  for (const grid of grids) {
    if (!gridsByOfferId.has(grid.offer_id)) gridsByOfferId.set(grid.offer_id, [])
    gridsByOfferId.get(grid.offer_id).push(grid)
  }

  const inserts = []
  const skipped = []
  const unmatched = []
  const parseErrors = []

  for (const row of rows) {
    const parsed = parseAvailability(row.availability_text)
    const isEmBreve = normalize(`${row.raw_label} ${row.availability_text}`).includes('em breve')
    if (parsed.error) {
      parseErrors.push({ row, error: parsed.error })
      continue
    }
    if (isEmBreve && !includeEmBreve) {
      skipped.push({ reason: 'em_breve', row, parsed })
      continue
    }

    const keys = [
      `${row.source_page_reference}|${normalize(row.family_name)}|${normalize(row.canonical_label)}`,
      `${row.source_page_reference}|${normalize(row.family_name)}|${normalize(row.raw_label)}`,
    ]
    const matches = keys.flatMap((key) => offerByKey.get(key) || [])
    const uniqueMatches = [...new Map(matches.map((offer) => [offer.id, offer])).values()]

    if (uniqueMatches.length !== 1) {
      unmatched.push({ row, matches: uniqueMatches.length })
      continue
    }

    const offer = uniqueMatches[0]
    const existing = gridsByOfferId.get(offer.id) || []
    if (existing.length > 0) {
      skipped.push({ reason: 'grid_ja_existe', row, parsed, offer, existing_count: existing.length })
      continue
    }

    inserts.push({
      offer_id: offer.id,
      sph_min: parsed.sph_min,
      sph_max: parsed.sph_max,
      cyl_min: parsed.cyl_min,
      cyl_max: parsed.cyl_max,
      add_min: parsed.add_min,
      add_max: parsed.add_max,
      metadata: parsed.metadata,
      _label: offer.canonical_label,
      _page: row.source_page_reference,
    })
  }

  console.log('Resumo:')
  console.log(`  linhas CSV com disponibilidade: ${rows.length}`)
  console.log(`  inserts planejados: ${inserts.length}`)
  console.log(`  puladas: ${skipped.length}`)
  console.log(`  sem match unico no BD: ${unmatched.length}`)
  console.log(`  erros de parser: ${parseErrors.length}\n`)

  const previewItems = fullPreview ? inserts : inserts.slice(0, 20)
  for (const item of previewItems) {
    console.log(`[insert] ${item._page} | ${item._label}`)
    console.log(`  sph=[${item.sph_min}, ${item.sph_max}] cyl=[${item.cyl_min}, ${item.cyl_max}] raw="${item.metadata.raw_grade}"`)
  }
  if (!fullPreview && inserts.length > 20) console.log(`... ${inserts.length - 20} inserts restantes omitidos no preview\n`)

  if (unmatched.length) {
    console.log('\nSem match unico:')
    for (const item of unmatched.slice(0, 20)) {
      console.log(`  ${item.row.source_page_reference} | ${item.row.family_name} | ${item.row.canonical_label} | matches=${item.matches}`)
    }
  }

  if (parseErrors.length) {
    console.log('\nErros de parser:')
    for (const item of parseErrors) console.log(`  ${item.row.canonical_label}: ${item.error}`)
  }

  if (commit && (unmatched.length || parseErrors.length) && !allowIncompleteSource) {
    throw new Error(
      `Commit bloqueado: ${unmatched.length} linha(s) sem match unico e ${parseErrors.length} erro(s) de parser.`
    )
  }

  if (commit && inserts.length) {
    const cleanInserts = inserts.map(({ _label, _page, ...row }) => row)
    const { error } = await supabase.from('global_offer_diopter_grids').insert(cleanInserts)
    if (error) throw error
    console.log(`\nInseridas ${cleanInserts.length} grades.`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
