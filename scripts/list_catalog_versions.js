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
  const { data, error } = await supabase
    .from('global_catalog_versions')
    .select('id,laboratorio,versao,created_at')
    .order('created_at', { ascending: false })

  if (error) throw error

  console.log('Catalogos globais:')
  for (const row of data || []) {
    console.log(`- ${row.laboratorio} | ${row.versao} | ${row.id}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
