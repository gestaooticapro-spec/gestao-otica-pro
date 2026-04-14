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

const args = process.argv.slice(2)
const versionId = args.find((arg) => arg.startsWith('--version-id='))?.split('=')[1]
const laboratorio = args.find((arg) => arg.startsWith('--laboratorio='))?.split('=')[1]

async function main() {
  let versionFilter = null
  if (versionId) {
    versionFilter = { id: versionId }
  } else if (laboratorio) {
    const { data: versions, error } = await supabase
      .from('global_catalog_versions')
      .select('id')
      .eq('laboratorio', laboratorio)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) throw error
    versionFilter = { id: versions?.[0]?.id }
  }

  if (!versionFilter?.id) {
    console.error('Use --version-id=<uuid> ou --laboratorio=<nome>')
    process.exit(1)
  }

  const { data: treatments, error } = await supabase
    .from('global_treatments')
    .select('id,nome,features')
    .eq('version_id', versionFilter.id)
    .order('nome', { ascending: true })

  if (error) throw error

  const missing = (treatments || []).filter((t) => {
    const semantic = t.features?.semantic_profile
    return !semantic || typeof semantic !== 'object'
  })

  console.log(`Tratamentos sem semantica (${missing.length}):`)
  for (const t of missing) {
    console.log(`- ${t.nome}`)
  }
}

main().catch((error) => {
  console.error('Falha ao listar tratamentos sem semantica:', error.message || error)
  process.exit(1)
})
