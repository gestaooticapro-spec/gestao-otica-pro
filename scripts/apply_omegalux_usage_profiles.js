import fs from 'fs'
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

const DRAFT_PATH =
  process.argv.find((arg) => arg.startsWith('--draft='))?.split('=')[1] ||
  'tmp/omegalux_prolife_catalog_draft_2026_07.json'
const VERSION_ID =
  process.argv.find((arg) => arg.startsWith('--version-id='))?.split('=')[1] ||
  '3e375a09-8a6d-4d54-aadb-c4e833e322b8'

const RECOMMENDATION_NOTES = {
  'PRO LIFE VI':
    'Equivalente semantico/geometrico a Hoyalux iD LifeStyle 4. Manter como lente comercial distinta; precos, tratamentos, indices e materiais seguem a CSV OMEGALUX/PRO LIFE.',
  'OMEGALUX 4K':
    'Equivalente semantico a Varilux XR Series e geometrico a Varilux XR Pro. Manter como lente comercial distinta; precos, tratamentos, indices e materiais seguem a CSV OMEGALUX/PRO LIFE.',
  'OMEGALUX DIGITAL':
    'Equivalente semantico/geometrico a Varilux Comfort Max. Manter como lente comercial distinta; precos, tratamentos, indices e materiais seguem a CSV OMEGALUX/PRO LIFE.',
  'OMEGALUX IN':
    'Equivalente semantico/geometrico a Varilux Liberty 3.0. Manter como lente comercial distinta; precos, tratamentos, indices e materiais seguem a CSV OMEGALUX/PRO LIFE.',
}

function readJson(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  return JSON.parse(fs.readFileSync(absolute, 'utf8'))
}

async function main() {
  const draft = readJson(DRAFT_PATH)
  const familyDraftByName = new Map((draft.families || []).map((family) => [family.name, family]))

  const { data: families, error } = await supabase
    .from('global_lens_families')
    .select('id,nome,source_page_reference')
    .eq('version_id', VERSION_ID)

  if (error) throw error

  const targetFamilies = (families || []).filter((family) => familyDraftByName.has(family.nome))
  if (!targetFamilies.length) {
    throw new Error(`Nenhuma familia OMEGALUX / PRO LIFE encontrada para version_id=${VERSION_ID}`)
  }

  const familyIds = targetFamilies.map((family) => family.id)
  const { error: deleteError } = await supabase
    .from('global_usage_profiles')
    .delete()
    .eq('profile_scope', 'family')
    .in('family_id', familyIds)

  if (deleteError) throw deleteError

  const rows = targetFamilies.map((family) => {
    const draftFamily = familyDraftByName.get(family.nome)
    return {
      family_id: family.id,
      offer_id: null,
      profile_scope: 'family',
      usage_tags: draftFamily.usage_tags || [],
      benefit_tags: draftFamily.benefit_tags || [],
      commercial_summary: draftFamily.description_marketing || null,
      recommendation_notes: RECOMMENDATION_NOTES[family.nome] || null,
      source_page_reference: family.source_page_reference || 'CSV OMEGALUX E PROLIFE',
    }
  })

  const { error: insertError } = await supabase.from('global_usage_profiles').insert(rows)
  if (insertError) throw insertError

  console.log(JSON.stringify({
    versionId: VERSION_ID,
    profilesInserted: rows.length,
    families: rows.map((row) => targetFamilies.find((family) => family.id === row.family_id)?.nome),
  }, null, 2))
}

main().catch((error) => {
  console.error('Falha ao aplicar perfis OMEGALUX / PRO LIFE:', error.message || error)
  process.exit(1)
})
