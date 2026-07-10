import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const commit = process.argv.includes('--commit')
const HOYA_VERSION_ID = '08f91e88-40f5-4521-b476-d09c7f1955cf'

const PROFILES = {
  ARGOS: {
    tags_uso: ['multifocal', 'uso_diario', 'rotina_basica'],
    tags_beneficios: ['visao_progressiva', 'custo_beneficio', 'adaptacao'],
    commercial_summary: 'Progressiva HOYA standard para uso diario.',
    recommendation_notes: 'Indicar como multifocal de linha standard; validar material/tratamento pela oferta.',
  },
  Amplitude: {
    tags_uso: ['multifocal', 'uso_diario', 'entrada_progressiva'],
    tags_beneficios: ['visao_progressiva', 'custo_beneficio', 'adaptacao'],
    commercial_summary: 'Progressiva HOYA standard de entrada para uso diario.',
    recommendation_notes: 'Indicar como alternativa progressiva de entrada; validar material/tratamento pela oferta.',
  },
  Pentax: {
    tags_uso: ['visao_simples', 'pronta_entrega', 'uso_diario'],
    tags_beneficios: ['correcao_visual', 'rapidez', 'praticidade'],
    commercial_summary: 'Lente pronta/asferica de visao simples.',
    recommendation_notes: 'Tratar como visao simples pronta; validar disponibilidade de grau e diametro.',
  },
  'NULUX Prontas Asfericas EYAS 2.0': {
    tags_uso: ['visao_simples', 'pronta_entrega', 'uso_diario'],
    tags_beneficios: ['correcao_visual', 'rapidez', 'praticidade'],
    commercial_summary: 'NULUX pronta asferica EYAS 2.0 de visao simples.',
    recommendation_notes: 'Tratar como visao simples pronta/asferica; validar disponibilidade de grau e diametro.',
  },
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

async function main() {
  const names = Object.keys(PROFILES)
  const { data: families, error: familiesError } = await supabase
    .from('global_lens_families')
    .select('id,nome,tags_uso,tags_beneficios')
    .eq('version_id', HOYA_VERSION_ID)
    .in('nome', names)
  if (familiesError) throw familiesError

  const { data: profiles, error: profilesError } = await supabase
    .from('global_usage_profiles')
    .select('id,family_id,profile_scope,usage_tags,benefit_tags,commercial_summary,recommendation_notes')
    .in(
      'family_id',
      (families || []).map((family) => family.id),
    )
    .eq('profile_scope', 'family')
  if (profilesError) throw profilesError

  const profileByFamilyId = new Map((profiles || []).map((profile) => [profile.family_id, profile]))
  let familyUpdates = 0
  let profileChanges = 0

  for (const family of families || []) {
    const template = PROFILES[family.nome]
    const familyPatch = {}
    if (!sameArray(family.tags_uso, template.tags_uso)) familyPatch.tags_uso = template.tags_uso
    if (!sameArray(family.tags_beneficios, template.tags_beneficios)) familyPatch.tags_beneficios = template.tags_beneficios

    if (Object.keys(familyPatch).length) {
      familyUpdates += 1
      console.log('[family:update]', family.nome, JSON.stringify(familyPatch))
      if (commit) {
        const { error } = await supabase.from('global_lens_families').update(familyPatch).eq('id', family.id)
        if (error) throw error
      }
    }

    const row = {
      family_id: family.id,
      offer_id: null,
      profile_scope: 'family',
      usage_tags: template.tags_uso,
      benefit_tags: template.tags_beneficios,
      commercial_summary: template.commercial_summary,
      recommendation_notes: template.recommendation_notes,
      source_page_reference: 'HOYA Dezembro 2025 - perfil conservador por familia',
    }
    const existing = profileByFamilyId.get(family.id)
    if (existing && sameProfile(existing, row)) continue
    profileChanges += 1
    console.log(existing ? '[profile:update]' : '[profile:insert]', family.nome)
    if (commit) {
      const query = existing
        ? supabase.from('global_usage_profiles').update(row).eq('id', existing.id)
        : supabase.from('global_usage_profiles').insert(row)
      const { error } = await query
      if (error) throw error
    }
  }

  console.log('Resumo:')
  console.log('- Familias HOYA atualizadas:', familyUpdates)
  console.log('- Perfis HOYA inseridos/atualizados:', profileChanges)
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
