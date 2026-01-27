
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const envPath = path.resolve(process.cwd(), '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
const env: Record<string, string> = {}

envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=')
    if (key && value) env[key.trim()] = value.trim()
})

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL']!, env['SUPABASE_SERVICE_ROLE_KEY']!)

async function checkDubai() {
    console.log('Listing "dubai" ARMACAO products...')
    const { data } = await supabase
        .from('products')
        .select('id, nome, marca, tipo_produto, created_at')
        .or('nome.ilike.%dubai%,marca.ilike.%dubai%')
        .eq('tipo_produto', 'Armacao')
        .order('id', { ascending: true })
        .limit(5)

    console.table(data)
}

checkDubai()
