import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'tmp')
const SEMANTICS_PATH = path.join(TMP_DIR, 'haytek_semantics_2025_09.json')
const OUT_PATH = path.join(TMP_DIR, 'haytek_catalog_import_2025_09.json')
const PAGES = [3, 4, 5, 6, 7, 8, 9, 11]
const STANDARD_TREATMENT_COLUMNS = [
  ['ar_verde', 'AR Verde'],
  ['ar_azul', 'AR Azul'],
  ['ar_premium_verde', 'AR Premium Verde'],
  ['ar_premium_azul', 'AR Premium Azul'],
]

function parseCsvLine(line) {
  const values = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
      continue
    }
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === ',' && !quoted) {
      values.push(current)
      current = ''
      continue
    }
    current += char
  }

  values.push(current)
  return values
}

function readCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const headers = parseCsvLine(lines[0])

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

function toNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeMaterial(value) {
  return value || null
}

function familyKey(name) {
  return (name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function loadSemantics() {
  const payload = JSON.parse(fs.readFileSync(SEMANTICS_PATH, 'utf8'))
  return new Map((payload.families || []).map((family) => [familyKey(family.name), family]))
}

function getFamilyRecord(families, semanticsByName, name) {
  if (families.has(name)) return families.get(name)

  const semantic = semanticsByName.get(familyKey(name))
  const family = {
    name,
    clinical_category: name === 'Haytek Visao Simples Acabadas' ? 'mista' : semantic?.clinical_category || 'indefinida',
    design: semantic?.design || 'Nao identificado',
    description_marketing: semantic?.commercial_summary || semantic?.summary || null,
    usage_tags: semantic?.usage_tags || [],
    benefit_tags: semantic?.benefit_tags || [],
    source_page_reference: semantic?.source_pages?.map((page) => `Pagina ${page}`).join(', ') || null,
    offers: [],
  }
  families.set(name, family)
  return family
}

function buildGrid(row, extraMetadata = {}) {
  return {
    sph_min: toNumber(row.sph_min),
    sph_max: toNumber(row.sph_max),
    cyl_min: toNumber(row.cyl_min),
    cyl_max: toNumber(row.cyl_max),
    add_min: toNumber(row.add_min),
    add_max: toNumber(row.add_max),
    metadata: {
      source_page: toNumber(row.source_page),
      segment: toNumber(row.segment),
      diameter: row.diameter || null,
      min_fitting_height_mm: row.min_fitting_height_mm || null,
      corridors_available_mm: row.corridors_available_mm || null,
      notes: row.notes || null,
      ...extraMetadata,
    },
  }
}

function gridLookupKey(row) {
  return [
    row.source_page,
    row.family,
    row.index,
    normalizeMaterial(row.material) || '',
    row.variant || '',
  ].join('|')
}

function buildStandardGridLookup(gridRows) {
  const lookup = new Map()
  for (const row of gridRows) {
    const key = gridLookupKey(row)
    if (!lookup.has(key)) lookup.set(key, [])
    lookup.get(key).push(buildGrid(row, { variant: row.variant || null, photo_colors: row.photo_colors || null }))
  }
  return lookup
}

function priceFeatureFlags(row) {
  const text = [row.variant, row.product, row.notes, row.photo_colors].filter(Boolean).join(' ').toLowerCase()
  return {
    embedded_variant: row.variant || row.product || null,
    blue_uv: /filtro azul|blue uv/.test(text),
    foto: /foto|transitions/.test(text),
    fotossensivel: /foto|transitions/.test(text),
    transitions: /transitions/.test(text),
    photo_colors: row.photo_colors ? row.photo_colors.split('|') : undefined,
  }
}

function buildStandardOffer(row, grids) {
  const material = normalizeMaterial(row.material)
  const labelParts = [row.index, material, row.variant, row.photo_colors].filter(Boolean)
  const rawLabel = labelParts.join(' ')
  const categoryByFamily = {
    'Haytek Drive': 'ocupacional',
    'Haytek Easy': 'visao_simples',
    'Haytek Go!': 'multifocal',
    'Haytek Light': 'multifocal',
    'Haytek Office': 'ocupacional',
    'Haytek Pro ID': 'multifocal',
    'Haytek Smart': 'multifocal',
    'Haytek Top': 'multifocal',
    'Haytek Visao Simples': 'visao_simples',
    'Haytek Visao Simples ID': 'visao_simples',
    'Haytek VS Freeform': 'visao_simples',
  }
  const familyCategory = categoryByFamily[row.family] || null
  return {
    legacy_code: null,
    raw_label: rawLabel,
    canonical_label: `${row.family} ${rawLabel}`,
    clinical_category: familyCategory,
    material,
    indice_refracao: toNumber(row.index),
    is_atomic_offer: false,
    allows_composition: true,
    already_includes_treatment: false,
    features: {
      ...priceFeatureFlags(row),
      price_model: 'final_by_lens_variant_and_treatment',
      source_photo: row.source_photo || null,
    },
    base_price: toNumber(row.antirrisco),
    source_page_reference: `Pagina ${row.source_page}`,
    confidence_level: 0.95,
    diopter_grids: grids,
    compatible_treatments: STANDARD_TREATMENT_COLUMNS.map(([column, name]) => ({
      treatment_name: name,
      special_price: toNumber(row[column]),
      price_mode: 'final',
    })).filter((item) => item.special_price != null),
  }
}

function intersectCylinder(grid, bandMin, bandMax) {
  const sourceMin = grid.cyl_min ?? 0
  const sourceMax = grid.cyl_max ?? 0
  const cylMin = Math.max(sourceMin, bandMin)
  const cylMax = Math.min(sourceMax, bandMax)
  if (cylMin > cylMax) return null

  return {
    ...grid,
    cyl_min: cylMin,
    cyl_max: cylMax,
  }
}

function page11BandLabel(band) {
  if (band === 'cil_until_minus_2') return 'Cil. ate -2.00'
  if (band === 'cil_minus_2_25_to_minus_4') return 'Cil. -2.25 a -4.00'
  if (band === 'super_cil_minus_4_25_to_minus_6') return 'Super Cil. -4.25 a -6.00'
  return 'Preco/par'
}

function buildPage11Grids(productGrids, band) {
  if (band === 'price_pair') return productGrids

  const limits = {
    cil_until_minus_2: [-2, 0],
    cil_minus_2_25_to_minus_4: [-4, -2.25],
    super_cil_minus_4_25_to_minus_6: [-6, -4.25],
  }[band]

  if (!limits) return productGrids
  return productGrids
    .map((grid) => intersectCylinder(grid, limits[0], limits[1]))
    .filter(Boolean)
    .map((grid) => ({
      ...grid,
      metadata: {
        ...grid.metadata,
        price_band: band,
      },
    }))
}

function buildPage11Offer(row, productGrids, band, price) {
  const material = normalizeMaterial(row.material)
  const bandLabel = page11BandLabel(band)
  const rawLabel = band === 'price_pair' ? `${row.index} ${row.product}` : `${row.index} ${row.product} ${bandLabel}`
  const isProgressive = row.family === 'Haytek Progressivas Acabadas'
  const isSolar = /solar/i.test(row.product)

  return {
    legacy_code: null,
    raw_label: rawLabel,
    canonical_label: `${row.family} ${rawLabel}`,
    clinical_category: isSolar ? 'plana_solar' : isProgressive ? 'multifocal' : 'visao_simples',
    material,
    indice_refracao: toNumber(row.index),
    is_atomic_offer: true,
    allows_composition: false,
    already_includes_treatment: true,
    features: {
      ...priceFeatureFlags(row),
      design: row.design || null,
      price_band: band,
      price_band_label: bandLabel,
      fulfillment_mode: 'pronta',
      pronta: true,
      pronta_entrega: true,
      acabada: true,
      includes_treatment: true,
    },
    base_price: price,
    source_page_reference: 'Pagina 11',
    confidence_level: 0.95,
    diopter_grids: buildPage11Grids(productGrids, band),
    compatible_treatments: [],
  }
}

function page11GridLookup(rows) {
  const lookup = new Map()
  for (const row of rows) {
    const key = [row.family, row.product, row.index, normalizeMaterial(row.material) || ''].join('|')
    if (!lookup.has(key)) lookup.set(key, [])
    lookup.get(key).push(buildGrid(row, {
      product: row.product,
      design: row.design,
      base_curve: row.base_curve || null,
      price_band: row.price_band || null,
    }))
  }
  return lookup
}

function addStandardPages(families, semanticsByName, prices, grids) {
  const gridLookup = buildStandardGridLookup(grids)
  const missingGrids = []

  for (const row of prices) {
    const keyWithVariant = gridLookupKey(row)
    const keyWithoutVariant = [row.source_page, row.family, row.index, normalizeMaterial(row.material) || '', ''].join('|')
    const offerGrids = gridLookup.get(keyWithVariant) || gridLookup.get(keyWithoutVariant) || []
    if (offerGrids.length === 0) missingGrids.push(`${row.source_page}|${row.family}|${row.index}|${row.material}|${row.variant}`)

    const family = getFamilyRecord(families, semanticsByName, row.family)
    family.offers.push(buildStandardOffer(row, offerGrids))
  }

  return missingGrids
}

function addPage11(families, semanticsByName, prices, grids) {
  const lookup = page11GridLookup(grids)
  const missingGrids = []

  for (const row of prices) {
    const family = getFamilyRecord(families, semanticsByName, row.family)
    const key = [row.family, row.product, row.index, normalizeMaterial(row.material) || ''].join('|')
    const productGrids = lookup.get(key) || []
    if (productGrids.length === 0) missingGrids.push(key)

    const bandPrices = [
      ['price_cil_until_minus_2', 'cil_until_minus_2'],
      ['price_cil_minus_2_25_to_minus_4', 'cil_minus_2_25_to_minus_4'],
      ['price_super_cil_minus_4_25_to_minus_6', 'super_cil_minus_4_25_to_minus_6'],
      ['price_pair', 'price_pair'],
    ]

    const populated = bandPrices
      .map(([column, band]) => ({ band, price: toNumber(row[column]) }))
      .filter((item) => item.price != null)

    if (
      populated.length === 2 &&
      populated[0].band === 'cil_until_minus_2' &&
      populated[1].band === 'cil_minus_2_25_to_minus_4' &&
      populated[0].price === populated[1].price
    ) {
      family.offers.push(buildPage11Offer(row, productGrids, 'price_pair', populated[0].price))
      continue
    }

    for (const item of populated) {
      family.offers.push(buildPage11Offer(row, productGrids, item.band, item.price))
    }
  }

  return missingGrids
}

function buildTreatments() {
  return [
    {
      name: 'AR Verde',
      type: 'antirreflexo',
      tags: ['antirreflexo'],
      features: { antirreflexo: true, color_reflex: 'verde' },
    },
    {
      name: 'AR Azul',
      type: 'antirreflexo',
      tags: ['antirreflexo'],
      features: { antirreflexo: true, color_reflex: 'azul' },
    },
    {
      name: 'AR Premium Verde',
      type: 'antirreflexo_premium',
      tags: ['antirreflexo', 'premium'],
      features: { antirreflexo: true, premium: true, color_reflex: 'verde' },
    },
    {
      name: 'AR Premium Azul',
      type: 'antirreflexo_premium',
      tags: ['antirreflexo', 'premium'],
      features: { antirreflexo: true, premium: true, color_reflex: 'azul' },
    },
  ]
}

function buildSourceDocument() {
  const files = PAGES.flatMap((page) => [
    path.join(TMP_DIR, `haytek_page${page}_prices_review.csv`),
    path.join(TMP_DIR, `haytek_page${page}_grids_review.csv`),
  ])
  const hash = crypto
    .createHash('sha256')
    .update(files.map((file) => fs.readFileSync(file)).join('\n'))
    .digest('hex')

  return {
    document_name: 'tabela haytek 09-2025.pdf + fotos de preco',
    source_path: '.tabelas/tabela haytek 09-2025.pdf',
    document_hash: `haytek-2025-09-${hash}`,
    extraction_engine: 'scripts/build_haytek_catalog_from_csv.js',
    extracted_text: null,
    pages: PAGES.map((page) => ({
      page_number: page,
      text: `Haytek Setembro 2025 - pagina ${page} validada por CSV/foto.`,
      chunks: [],
    })),
  }
}

function validatePayload(payload, missingGrids) {
  const errors = []
  for (const family of payload.families) {
    for (const offer of family.offers || []) {
      if (offer.base_price == null) errors.push(`Oferta sem preco: ${family.name} | ${offer.raw_label}`)
      if (!offer.raw_label) errors.push(`Oferta sem raw_label: ${family.name}`)
      if (!offer.diopter_grids || offer.diopter_grids.length === 0) errors.push(`Oferta sem grade: ${family.name} | ${offer.raw_label}`)
      for (const grid of offer.diopter_grids || []) {
        if (grid.sph_min == null || grid.sph_max == null) errors.push(`Grade sem esferico: ${family.name} | ${offer.raw_label}`)
      }
    }
  }
  return [...errors, ...missingGrids.map((item) => `Grade nao encontrada: ${item}`)]
}

function main() {
  const semanticsByName = loadSemantics()
  const families = new Map()
  const allPrices = []
  const allGrids = []
  const missingGrids = []

  for (const page of PAGES) {
    const prices = readCsv(path.join(TMP_DIR, `haytek_page${page}_prices_review.csv`))
    const grids = readCsv(path.join(TMP_DIR, `haytek_page${page}_grids_review.csv`))
    allPrices.push(...prices)
    allGrids.push(...grids)

    if (page === 11) {
      missingGrids.push(...addPage11(families, semanticsByName, prices, grids))
    } else {
      missingGrids.push(...addStandardPages(families, semanticsByName, prices, grids))
    }
  }

  const payload = {
    catalog_version: {
      laboratorio: 'Haytek',
      versao: 'Haytek Setembro 2025',
      source_kind: 'pdf+photos',
      status: 'draft',
      notes: 'Importado a partir de CSVs revisados pagina a pagina. Grades dioptricas preservadas sem achatamento.',
    },
    source_document: buildSourceDocument(),
    treatments: buildTreatments(),
    families: [...families.values()].sort((left, right) => left.name.localeCompare(right.name)),
    metadata: {
      source_prices_rows: allPrices.length,
      source_grid_rows: allGrids.length,
      generated_by: 'scripts/build_haytek_catalog_from_csv.js',
    },
  }

  const validationErrors = validatePayload(payload, missingGrids)
  if (validationErrors.length > 0) {
    console.error('Validacao falhou:')
    for (const error of validationErrors.slice(0, 50)) console.error(`- ${error}`)
    if (validationErrors.length > 50) console.error(`... +${validationErrors.length - 50} erros`)
    process.exit(1)
  }

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const offerCount = payload.families.reduce((total, family) => total + family.offers.length, 0)
  const gridCount = payload.families.reduce(
    (total, family) => total + family.offers.reduce((sum, offer) => sum + offer.diopter_grids.length, 0),
    0,
  )

  console.log('Haytek catalog JSON gerado:')
  console.table({
    output: path.relative(ROOT, OUT_PATH),
    families: payload.families.length,
    offers: offerCount,
    grids: gridCount,
    treatments: payload.treatments.length,
    source_prices_rows: allPrices.length,
    source_grid_rows: allGrids.length,
  })
}

main()
