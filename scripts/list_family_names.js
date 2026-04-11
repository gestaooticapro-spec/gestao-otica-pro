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

async function main() {
  if (!versionId) {
    console.error('Use --version-id=<uuid>')
    process.exit(1)
  }

  const { data: families, error } = await supabase
    .from('global_lens_families')
    .select('nome')
    .eq('version_id', versionId)
    .order('nome', { ascending: true })

  if (error) throw error

  console.log('Familias encontradas:')
  for (const family of families || []) {
    console.log(`- ${family.nome}`)
  }
}

main().catch((error) => {
  console.error('Falha ao listar familias:', error.message || error)
  process.exit(1)
})
