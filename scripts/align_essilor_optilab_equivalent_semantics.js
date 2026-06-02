import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const args = process.argv.slice(2)
const commit = args.includes('--commit')

const ESSILOR_VERSION_ID = '99497d03-50bf-46b7-a7ab-8cb19e80db5a'
const OPTILAB_VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078'

const ONE_TO_ONE_FAMILIES = [
  {
    essilor: 'Varilux XR Series',
    optilab: 'VARILUX® XR SERIES',
    canonicalName: 'Varilux XR Series',
    canonicalDesign: 'Progressiva Premium (XR Series)',
  },
  {
    essilor: 'Varilux Physio',
    optilab: 'VARILUX® Physio® Extensee',
    canonicalName: 'Varilux Physio Extensee',
    canonicalDesign: 'Progressiva Digital (Physio Extensee)',
  },
  {
    essilor: 'Varilux Comfort',
    optilab: 'VARILUX® COMFORT',
    canonicalName: 'Varilux Comfort',
  },
  {
    essilor: 'Varilux Comfort Max',
    optilab: 'VARILUX® COMFORT MAX',
    canonicalName: 'Varilux Comfort Max',
  },
  {
    essilor: 'Varilux Liberty',
    optilab: 'VARILUX® LIBERTY',
    canonicalName: 'Varilux Liberty',
  },
  {
    essilor: 'Varilux Liberty 3.0',
    optilab: 'VARILUX® LIBERTY 3.0',
    canonicalName: 'Varilux Liberty 3.0',
  },
]

const GROUPED_FAMILY_PATCHES = {
  'VARILUX® ACTIVITIES': {
    nome: 'Varilux Activities',
    clinical_category: 'mista',
    design: 'Mista (Digitime, Roadpilot, Sport/Sportwrap e coloracao)',
    tags_uso: ['ocupacional', 'computador', 'perto', 'intermediario', 'direcao', 'esporte', 'uso_externo'],
    tags_beneficios: [
      'especializacao_por_tarefa',
      'conforto_intermediario',
      'conforto_perto',
      'conforto_ao_dirigir',
      'campo_visual_esportivo',
      'versatilidade',
    ],
    profile: {
      usage_tags: ['ocupacional', 'computador', 'perto', 'intermediario', 'direcao', 'esporte', 'uso_externo'],
      benefit_tags: [
        'especializacao_por_tarefa',
        'conforto_intermediario',
        'conforto_perto',
        'conforto_ao_dirigir',
        'campo_visual_esportivo',
        'versatilidade',
      ],
      commercial_summary:
        'Familia guarda-chuva para Varilux Activities: Digitime near/mid, Roadpilot, Sport/Sportwrap e opcoes de coloracao.',
      recommendation_notes:
        'Nao tratar como uma unica lente. Digitime near/mid sao ocupacionais; Roadpilot e especial para direcao; Sport/Sportwrap sao multifocais especiais esportivas; linhas de coloracao sao complementos solares/coloridos.',
    },
  },
  'LENTES ESSILOR®': {
    nome: 'Lentes Essilor',
    clinical_category: 'mista',
    design: 'Mista (visao simples surfacada e Interview)',
    tags_uso: ['visao_simples', 'surfacada', 'grau_personalizado', 'ocupacional', 'intermediario', 'uso_diario'],
    tags_beneficios: ['correcao_visual', 'ampla_disponibilidade', 'tratamentos_essilor', 'conforto_intermediario'],
    profile: {
      usage_tags: ['visao_simples', 'surfacada', 'grau_personalizado', 'ocupacional', 'intermediario', 'uso_diario'],
      benefit_tags: ['correcao_visual', 'ampla_disponibilidade', 'tratamentos_essilor', 'conforto_intermediario'],
      commercial_summary:
        'Familia mista de lentes Essilor na Optilab, reunindo visao simples surfacada e Interview intermediaria.',
      recommendation_notes:
        'Usar as categorias das ofertas: VS surfacada como visao simples; Interview como ocupacional/intermediaria.',
    },
  },
  'LENTES KODAK®': {
    nome: 'Kodak',
    clinical_category: 'mista',
    design: 'Nao identificado',
    tags_uso: ['uso diario', 'longe', 'intermediario', 'perto'],
    tags_beneficios: ['visao nitida', 'transicao suave', 'adaptacao', 'desempenho em todas as distancias'],
    profile: {
      usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
      benefit_tags: ['nitidez', 'conforto_visual', 'adaptacao', 'versatilidade'],
      commercial_summary:
        'Portfolio Kodak com ofertas de visao simples e progressivas, variando por rotulo, material e tratamento da oferta selecionada.',
      recommendation_notes:
        'Validar sempre o rotulo da oferta: quando for Single/Visao Simples, tratar como lente monofocal; quando for progressiva, aplicar os beneficios de campo e adaptacao da linha correspondente.',
    },
  },
  'LINHA KIDS': {
    nome: 'Linha Kids',
    clinical_category: 'mista',
    design: 'Mista infantil (Stellest e visao simples kids)',
    tags_uso: ['criancas', 'uso_infantil', 'controle_miopia', 'uso_diario', 'estudo'],
    tags_beneficios: ['controle_da_progressao', 'correcao_da_miopia', 'visao_nitida', 'conforto_visual_infantil'],
    profile: {
      usage_tags: ['criancas', 'uso_infantil', 'controle_miopia', 'uso_diario', 'estudo'],
      benefit_tags: ['controle_da_progressao', 'correcao_da_miopia', 'visao_nitida', 'conforto_visual_infantil'],
      commercial_summary:
        'Linha infantil Optilab com Stellest/Stellest 2.0 para controle de miopia e lentes kids de visao simples.',
      recommendation_notes:
        'Stellest continua controle de miopia; Airwear kids sem Stellest deve ser tratado como visao simples infantil.',
    },
  },
}

const GROUPED_FAMILY_ALIASES = {
  'VARILUXÂ® ACTIVITIES': ['VARILUXÂ® ACTIVITIES', 'Varilux Activities'],
  'LENTES ESSILORÂ®': ['LENTES ESSILORÂ®', 'Lentes Essilor'],
  'LENTES KODAKÂ®': ['LENTES KODAKÂ®', 'Kodak'],
  'LINHA KIDS': ['LINHA KIDS', 'Linha Kids'],
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™]/g, '')
    .replace(/[^a-z0-9.]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function sameArray(a, b) {
  return JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort())
}

function sameProfile(existing, next) {
  return (
    sameArray(existing?.usage_tags, next.usage_tags) &&
    sameArray(existing?.benefit_tags, next.benefit_tags) &&
    String(existing?.commercial_summary || '') === String(next.commercial_summary || '') &&
    String(existing?.recommendation_notes || '') === String(next.recommendation_notes || '')
  )
}

async function fetchFamilies() {
  const { data, error } = await supabase
    .from('global_lens_families')
    .select('id,version_id,nome,design,clinical_category,tags_uso,tags_beneficios')
    .in('version_id', [ESSILOR_VERSION_ID, OPTILAB_VERSION_ID])
  if (error) throw error
  return data || []
}

async function fetchProfiles(familyIds) {
  const { data, error } = await supabase
    .from('global_usage_profiles')
    .select('id,family_id,profile_scope,usage_tags,benefit_tags,commercial_summary,recommendation_notes,source_page_reference')
    .in('family_id', familyIds)
    .eq('profile_scope', 'family')
  if (error) throw error
  return data || []
}

function findFamilyByNames(familyByKey, versionId, names) {
  for (const name of names) {
    const family = familyByKey.get(`${versionId}:${normalize(name)}`)
    if (family) return family
  }
  return null
}

async function upsertProfile(family, nextProfile, existingProfile, label) {
  const row = {
    family_id: family.id,
    offer_id: null,
    profile_scope: 'family',
    usage_tags: nextProfile.usage_tags,
    benefit_tags: nextProfile.benefit_tags,
    commercial_summary: nextProfile.commercial_summary,
    recommendation_notes: nextProfile.recommendation_notes,
    source_page_reference: 'Alinhado Essilor x Optilab',
  }

  if (existingProfile) {
    if (sameProfile(existingProfile, row)) return false
    console.log('[profile:update]', label)
    if (commit) {
      const { error } = await supabase.from('global_usage_profiles').update(row).eq('id', existingProfile.id)
      if (error) throw error
    }
    return true
  }

  console.log('[profile:insert]', label)
  if (commit) {
    const { error } = await supabase.from('global_usage_profiles').insert(row)
    if (error) throw error
  }
  return true
}

function buildFamilyPatch(family, patch) {
  const next = {}
  for (const key of ['nome', 'design', 'clinical_category']) {
    if (patch[key] != null && family[key] !== patch[key]) next[key] = patch[key]
  }
  if (patch.tags_uso && !sameArray(family.tags_uso, patch.tags_uso)) next.tags_uso = patch.tags_uso
  if (patch.tags_beneficios && !sameArray(family.tags_beneficios, patch.tags_beneficios))
    next.tags_beneficios = patch.tags_beneficios
  return next
}

async function main() {
  const families = await fetchFamilies()
  const familyByKey = new Map(families.map((family) => [`${family.version_id}:${normalize(family.nome)}`, family]))
  const profiles = await fetchProfiles(families.map((family) => family.id))
  const profileByFamilyId = new Map(profiles.map((profile) => [profile.family_id, profile]))

  let familyUpdates = 0
  let profileChanges = 0
  let offerUpdates = 0

  for (const item of ONE_TO_ONE_FAMILIES) {
    const essilor = findFamilyByNames(familyByKey, ESSILOR_VERSION_ID, [item.essilor])
    const optilab = findFamilyByNames(familyByKey, OPTILAB_VERSION_ID, [item.optilab, item.canonicalName])
    if (!essilor || !optilab) {
      console.log('[skip:missing]', item.essilor, item.optilab)
      continue
    }

    const essilorProfile = profileByFamilyId.get(essilor.id)
    const patch = {
      nome: item.canonicalName,
      design: item.canonicalDesign || essilor.design,
      clinical_category: essilor.clinical_category,
      tags_uso: essilor.tags_uso || [],
      tags_beneficios: essilor.tags_beneficios || [],
    }
    const familyPatch = buildFamilyPatch(optilab, patch)
    if (Object.keys(familyPatch).length) {
      familyUpdates += 1
      console.log('[family:update]', optilab.nome, '=>', JSON.stringify(familyPatch))
      if (commit) {
        const { error } = await supabase.from('global_lens_families').update(familyPatch).eq('id', optilab.id)
        if (error) throw error
      }
    }

    if (essilorProfile) {
      const changed = await upsertProfile(optilab, essilorProfile, profileByFamilyId.get(optilab.id), item.canonicalName)
      if (changed) profileChanges += 1
    }
  }

  for (const [currentName, patch] of Object.entries(GROUPED_FAMILY_PATCHES)) {
    const family = findFamilyByNames(familyByKey, OPTILAB_VERSION_ID, [
      ...(GROUPED_FAMILY_ALIASES[currentName] || [currentName]),
      patch.nome,
    ])
    if (!family) {
      console.log('[skip:missing-group]', currentName)
      continue
    }
    const familyPatch = buildFamilyPatch(family, patch)
    if (Object.keys(familyPatch).length) {
      familyUpdates += 1
      console.log('[family:update]', family.nome, '=>', JSON.stringify(familyPatch))
      if (commit) {
        const { error } = await supabase.from('global_lens_families').update(familyPatch).eq('id', family.id)
        if (error) throw error
      }
    }
    const changed = await upsertProfile(family, patch.profile, profileByFamilyId.get(family.id), patch.nome)
    if (changed) profileChanges += 1
  }

  const optilabKodak = findFamilyByNames(familyByKey, OPTILAB_VERSION_ID, ['LENTES KODAKÂ®', 'LENTES KODAK', 'Kodak'])
  if (optilabKodak) {
    const { data: offers, error } = await supabase
      .from('global_lens_offers')
      .select('id,canonical_label,raw_label,clinical_category,features')
      .eq('family_id', optilabKodak.id)
    if (error) throw error

    for (const offer of offers || []) {
      const label = normalize(`${offer.canonical_label || ''} ${offer.raw_label || ''}`)
      const isSingleSun = label.includes('single') && (label.includes('sun') || label.includes('solar'))
      if (!isSingleSun || offer.clinical_category === 'plana_solar') continue
      const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
      const nextFeatures = {
        ...features,
        solar: true,
        sun: true,
        ...(label.includes('coloracao') ? { coloracao: true } : {}),
        ...(label.includes('xperio') ? { xperio: true } : {}),
      }
      offerUpdates += 1
      console.log('[offer:kodak-single-sun]', offer.canonical_label || offer.raw_label)
      if (commit) {
        const { error: upErr } = await supabase
          .from('global_lens_offers')
          .update({ clinical_category: 'plana_solar', features: nextFeatures })
          .eq('id', offer.id)
        if (upErr) throw upErr
      }
    }
  }

  const optilabActivities = findFamilyByNames(familyByKey, OPTILAB_VERSION_ID, [
    'VARILUXÂ® ACTIVITIES',
    'Varilux Activities',
  ])
  if (optilabActivities) {
    const { data: offers, error } = await supabase
      .from('global_lens_offers')
      .select('id,canonical_label,raw_label,clinical_category,features')
      .eq('family_id', optilabActivities.id)
    if (error) throw error

    for (const offer of offers || []) {
      const label = normalize(`${offer.canonical_label || ''} ${offer.raw_label || ''}`)
      if (!label.includes('sport') || offer.clinical_category === 'multifocal') continue
      const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
      offerUpdates += 1
      console.log('[offer:activities-sport-multifocal]', offer.canonical_label || offer.raw_label)
      if (commit) {
        const { error: upErr } = await supabase
          .from('global_lens_offers')
          .update({
            clinical_category: 'multifocal',
            features: { ...features, sport: true, sportwrap: label.includes('sportwrap'), multifocal_especial: true },
          })
          .eq('id', offer.id)
        if (upErr) throw upErr
      }
    }
  }

  console.log('Resumo:')
  console.log('- Familias alteradas:', familyUpdates)
  console.log('- Perfis inseridos/atualizados:', profileChanges)
  console.log('- Ofertas alteradas:', offerUpdates)
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
