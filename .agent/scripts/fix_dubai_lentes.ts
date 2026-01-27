
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

async function fixDubai() {
    console.log('Fixing "dubai" products (Lente -> Armacao)...')

    // 1. Find them first to log
    const { data: toFix, error: findError } = await supabase
        .from('products')
        .select('id, nome, marca, tipo_produto')
        .or('nome.ilike.%dubai%,marca.ilike.%dubai%')
        .eq('tipo_produto', 'Lente')

    if (findError) {
        console.error('Error finding products:', findError)
        return
    }

    if (!toFix || toFix.length === 0) {
        console.log('No "Dubai" products found with type "Lente".')
        return
    }

    console.log(`Found ${toFix.length} products to fix:`)
    console.table(toFix)

    // 2. Update them
    const ids = toFix.map((p: any) => p.id)
    const { error: updateError } = await supabase
        .from('products')
        .update({
            tipo_produto: 'Armacao',
            categoria: 'Armação'
        })
        .in('id', ids)

    if (updateError) {
        console.error('Error updating products:', updateError)
    } else {
        console.log('Successfully updated products to Armacao.')
    }
}

fixDubai()
