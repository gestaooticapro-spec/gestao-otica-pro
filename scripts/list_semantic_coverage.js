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

async function main() {
  const { data: versions, error: versionsError } = await supabase
    .from('global_catalog_versions')
    .select('id,laboratorio,versao')
    .order('laboratorio', { ascending: true })

  if (versionsError) throw versionsError

  const versionById = new Map((versions || []).map((v) => [v.id, v]))

  const { data: families, error: familiesError } = await supabase
    .from('global_lens_families')
    .select('id,version_id,nome')

  if (familiesError) throw familiesError

  const { data: usageProfiles, error: usageError } = await supabase
    .from('global_usage_profiles')
    .select('id,family_id,profile_scope')

  if (usageError) throw usageError

  const { data: treatments, error: treatmentsError } = await supabase
    .from('global_treatments')
    .select('id,version_id,nome,features')

  if (treatmentsError) throw treatmentsError

  const familyById = new Map((families || []).map((f) => [f.id, f]))

  const usageByVersion = new Map()
  for (const profile of usageProfiles || []) {
    const family = familyById.get(profile.family_id)
    if (!family) continue
    const version = versionById.get(family.version_id)
    if (!version) continue
    const key = `${version.laboratorio} | ${version.versao}`
    const entry = usageByVersion.get(key) || { families: new Set(), profiles: 0 }
    entry.families.add(family.id)
    entry.profiles += 1
    usageByVersion.set(key, entry)
  }

  const treatmentByVersion = new Map()
  for (const treatment of treatments || []) {
    const version = versionById.get(treatment.version_id)
    if (!version) continue
    const key = `${version.laboratorio} | ${version.versao}`
    const entry =
      treatmentByVersion.get(key) || { total: 0, withSemantic: 0 }
    entry.total += 1
    const semantic = treatment.features?.semantic_profile
    if (semantic && typeof semantic === 'object') {
      entry.withSemantic += 1
    }
    treatmentByVersion.set(key, entry)
  }

  console.log('Cobertura de semantica por versao:')
  for (const version of versions || []) {
    const key = `${version.laboratorio} | ${version.versao}`
    const usage = usageByVersion.get(key) || { families: new Set(), profiles: 0 }
    const treatmentsEntry = treatmentByVersion.get(key) || { total: 0, withSemantic: 0 }
    console.log(`- ${key}`)
    console.log(`  Familias com uso: ${usage.families.size} (perfis: ${usage.profiles})`)
    console.log(`  Tratamentos com semantica: ${treatmentsEntry.withSemantic}/${treatmentsEntry.total}`)
  }
}

main().catch((error) => {
  console.error('Falha ao listar cobertura de semantica:', error.message || error)
  process.exit(1)
})
