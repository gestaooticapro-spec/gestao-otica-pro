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

const shouldCommit = process.argv.includes('--commit')

async function main() {
  const { data, error } = await supabase
    .from('global_lens_offers')
    .select(`
      id,
      clinical_category,
      family:global_lens_families!inner(
        id,
        nome,
        clinical_category
      )
    `)

  if (error) throw error

  const candidates = []
  const unresolved = []

  for (const row of data || []) {
    const family = Array.isArray(row.family) ? row.family[0] : row.family
    if (!family) continue

    const familyCategory = family.clinical_category
    const offerCategory = row.clinical_category
    const familyIsDeterministic = familyCategory !== 'mista' && familyCategory !== 'indefinida'

    if (!familyIsDeterministic) continue
    if (offerCategory === familyCategory) continue

    if (offerCategory === 'indefinida') {
      candidates.push({
        offerId: row.id,
        familyName: family.nome,
        from: offerCategory,
        to: familyCategory,
      })
      continue
    }

    unresolved.push({
      offerId: row.id,
      familyName: family.nome,
      offerCategory,
      familyCategory,
    })
  }

  console.log(`Ofertas para corrigir automaticamente: ${candidates.length}`)
  console.log(`Conflitos nao automaticos (revisar manualmente): ${unresolved.length}`)

  if (unresolved.length > 0) {
    for (const row of unresolved.slice(0, 20)) {
      console.log(
        `- ${row.familyName} | offer=${row.offerCategory} | family=${row.familyCategory} | offer_id=${row.offerId}`,
      )
    }
  }

  if (!shouldCommit) {
    console.log('Dry-run finalizado. Use --commit para aplicar as correcoes automáticas.')
    return
  }

  for (const row of candidates) {
    const { error: updateError } = await supabase
      .from('global_lens_offers')
      .update({ clinical_category: row.to })
      .eq('id', row.offerId)

    if (updateError) throw updateError
  }

  console.log(`Atualizacao concluida. ${candidates.length} ofertas corrigidas.`)
}

main().catch((error) => {
  console.error('Falha ao corrigir clinical_category das ofertas:', error.message || error)
  process.exit(1)
})
