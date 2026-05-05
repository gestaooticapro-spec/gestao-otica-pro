import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Erro: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTier(value) {
  const n = normalize(value).replace(/-/g, '_').replace(/\s+/g, '_')
  if (!n) return null
  if (n.includes('ultra_premium') || n.startsWith('premium')) return 'premium'
  if (n.includes('intermediaria') || n.includes('intermediario') || n.includes('equilibrado')) {
    return 'intermediaria'
  }
  if (n.includes('entrada') || n.includes('economico') || n.includes('basico')) return 'entrada'
  if (n.includes('especializado')) return 'intermediaria'
  if (n.includes('indefinido')) return null
  return null
}

const EXPECTED_TREATMENT_TIERS = [
  { pattern: /\bcrizal sapphire hr\b/, expected: 'premium', reason: 'Crizal Sapphire HR e AR premium/topo geral.' },
  { pattern: /\bcrizal rock\b/, expected: 'premium', reason: 'Crizal Rock e AR premium focado em durabilidade.' },
  { pattern: /\bcrizal prevencia\b/, expected: 'premium', reason: 'Crizal Prevencia e AR premium com filtragem azul-violeta.' },
  { pattern: /\bcrizal easy pro\b/, expected: 'intermediaria', reason: 'Crizal Easy Pro e pacote Crizal de acesso/intermediario.' },
  { pattern: /\btrio easy clean\b/, expected: 'entrada', reason: 'Trio Easy Clean e AR de entrada.' },
  { pattern: /\bno reflex\b/, expected: 'entrada', reason: 'No Reflex e AR de entrada.' },
  { pattern: /\bverniz\b|\bhc\b/, expected: 'entrada', reason: 'Verniz/HC nao e AR premium.' },
  { pattern: /\bhi[- ]vision meiryo\b|\bmeiryo\b/, expected: 'premium', reason: 'Meiryo e coating HOYA premium.' },
  { pattern: /\bhi[- ]vision longlife bluecontrol\b|\blonglife bluecontrol\b|\blonglife bc\b/, expected: 'premium', reason: 'LongLife BlueControl fica acima de No-Risk na tabela HOYA.' },
  { pattern: /\bhi[- ]vision longlife uvcontrol\b|\blonglife uvcontrol\b|\blonglife uv\b/, expected: 'premium', reason: 'LongLife UVControl e LongLife com controle UV.' },
  { pattern: /\bhi[- ]vision longlife\b|\blonglife\b/, expected: 'intermediaria', reason: 'LongLife sem Blue/UV e intermediario robusto.' },
  { pattern: /\bno[- ]risk bluecontrol\b|\bno[- ]risk\b/, expected: 'intermediaria', reason: 'No-Risk e intermediario na hierarquia HOYA.' },
  { pattern: /\bcleanextra\b|\bclean extra\b/, expected: 'entrada', reason: 'CleanExtra e entrada/superior basica na hierarquia HOYA.' },
  { pattern: /\bhi[- ]vision hard\b|\bhard\b/, expected: 'entrada', reason: 'Hi-Vision Hard e tratamento base.' },
  { pattern: /\bsigma blue\b/, expected: 'premium', reason: 'Sigma Blue agrega filtro azul ao Sigma.' },
  { pattern: /\bsigma light\b/, expected: 'intermediaria', reason: 'Sigma Light e linha intermediaria.' },
  { pattern: /\bsigma premium\b|\bsigma supreme\b/, expected: 'premium', reason: 'Sigma Premium/Supreme sao tiers premium.' },
]

function expectedTierForName(name) {
  const n = normalize(name)
  return EXPECTED_TREATMENT_TIERS.find((rule) => rule.pattern.test(n)) || null
}

function semanticTier(features) {
  const semantic = features?.semantic_profile
  if (!semantic || typeof semantic !== 'object') return null
  return normalizeTier(semantic.positioning) || normalizeTier(semantic.price_tier)
}

function rawSemanticTier(features) {
  const semantic = features?.semantic_profile
  if (!semantic || typeof semantic !== 'object') return null
  return {
    positioning: semantic.positioning ?? null,
    price_tier: semantic.price_tier ?? null,
  }
}

function detectTreatmentWords(label) {
  const n = normalize(label)
  return EXPECTED_TREATMENT_TIERS.filter((rule) => rule.pattern.test(n)).map((rule) => ({
    expected: rule.expected,
    reason: rule.reason,
  }))
}

async function fetchAll(table, select) {
  const pageSize = 1000
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}

async function main() {
  const [versions, treatments, offers, families] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_treatments', 'id,version_id,nome,tipo,features'),
    fetchAll('global_lens_offers', 'id,family_id,raw_label,canonical_label,features,already_includes_treatment'),
    fetchAll('global_lens_families', 'id,version_id,nome'),
  ])

  const versionById = new Map(versions.map((v) => [v.id, v]))
  const familyById = new Map(families.map((family) => [family.id, family]))
  const treatmentFindings = []
  const missingSemantic = []
  const rawTierOddities = []

  for (const treatment of treatments) {
    const semantic = treatment.features?.semantic_profile
    const version = versionById.get(treatment.version_id)
    const expected = expectedTierForName(treatment.nome)
    const tier = semanticTier(treatment.features)
    const rawTier = rawSemanticTier(treatment.features)

    if (!semantic || typeof semantic !== 'object') {
      missingSemantic.push({ treatment, version })
    }

    if (rawTier && (rawTier.positioning || rawTier.price_tier) && !tier) {
      rawTierOddities.push({ treatment, version, rawTier })
    }

    if (expected && tier && expected.expected !== tier) {
      treatmentFindings.push({
        treatment,
        version,
        expected,
        actual: tier,
        rawTier,
      })
    }
  }

  const embeddedOfferFindings = []
  for (const offer of offers) {
    const label = `${offer.raw_label || ''} ${offer.canonical_label || ''}`
    const detected = detectTreatmentWords(label)
    if (!detected.length) continue

    const family = familyById.get(offer.family_id)
    const version = versionById.get(family?.version_id)
    const flags = offer.features || {}
    const hasOnlyGenericEmbedded =
      offer.already_includes_treatment &&
      (flags.blue_uv || flags.blue_control || flags.fotossensivel || flags.sensity || flags.antirreflexo)

    embeddedOfferFindings.push({
      offer,
      version,
      detected,
      hasOnlyGenericEmbedded,
    })
  }

  console.log('AUDITORIA PROFUNDA DE TRATAMENTOS')
  console.log(`Versoes: ${versions.length}`)
  console.log(`Tratamentos: ${treatments.length}`)
  console.log(`Ofertas: ${offers.length}`)

  console.log('\n1) Tratamentos com tier diferente do esperado por nome conhecido')
  if (!treatmentFindings.length) {
    console.log('- Nenhum mismatch encontrado nos tratamentos cadastrados.')
  } else {
    for (const item of treatmentFindings) {
      console.log(
        `- [${item.version?.laboratorio || 'sem lab'} | ${item.version?.versao || 'sem versao'}] ${item.treatment.nome}: esperado=${item.expected.expected}, atual=${item.actual}, raw=${JSON.stringify(item.rawTier)} | ${item.expected.reason}`,
      )
    }
  }

  console.log('\n2) Tratamentos sem semantic_profile')
  for (const item of missingSemantic.slice(0, 80)) {
    console.log(`- [${item.version?.laboratorio || 'sem lab'} | ${item.version?.versao || 'sem versao'}] ${item.treatment.nome}`)
  }
  if (missingSemantic.length > 80) console.log(`- ... mais ${missingSemantic.length - 80}`)

  console.log('\n3) Tiers escritos em formato nao normalizado')
  if (!rawTierOddities.length) {
    console.log('- Nenhum raw tier estranho encontrado.')
  } else {
    for (const item of rawTierOddities) {
      console.log(
        `- [${item.version?.laboratorio || 'sem lab'} | ${item.version?.versao || 'sem versao'}] ${item.treatment.nome}: raw=${JSON.stringify(item.rawTier)}`,
      )
    }
  }

  console.log('\n4) Ofertas atomicas/embutidas cujo rotulo contem nome especifico de tratamento')
  for (const item of embeddedOfferFindings.slice(0, 120)) {
    console.log(
      `- [${item.version?.laboratorio || 'sem lab'} | ${item.version?.versao || 'sem versao'}] ${item.offer.raw_label} | embedded_generico=${item.hasOnlyGenericEmbedded} | detectado=${item.detected.map((d) => d.expected).join('/')}`,
    )
  }
  if (embeddedOfferFindings.length > 120) console.log(`- ... mais ${embeddedOfferFindings.length - 120}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
