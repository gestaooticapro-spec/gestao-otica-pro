import { createClient } from '@supabase/supabase-js'

const query = (process.argv[2] || '').trim()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!query) throw new Error('Informe parte do nome da loja.')
if (!url || !key) throw new Error('Variáveis do Supabase ausentes no ambiente.')

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await supabase
  .from('stores')
  .select('id, name, tenant_id')
  .ilike('name', `%${query}%`)
  .order('name')

if (error) throw new Error(error.message)
console.table(data || [])
