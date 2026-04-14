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
const query = args.find((arg) => arg.startsWith('--query='))?.split('=').slice(1).join('=')

if (!versionId || !query) {
  console.error('Uso: node scripts/inspect_offer_grid.js --version-id=UUID --query=termo')
  process.exit(1)
}

async function main() {
  const term = query.toLowerCase()

  const { data: families, error: famError } = await supabase
    .from('global_lens_families')
    .select('id')
    .eq('version_id', versionId)

  if (famError) throw famError
  const familyIds = (families || []).map((f) => f.id)
  if (!familyIds.length) {
    console.log('Nenhuma família encontrada para version_id', versionId)
    return
  }

  const { data: offers, error } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,raw_label,canonical_label,clinical_category,material,indice_refracao,features')
    .in('family_id', familyIds)

  if (error) throw error

  const matches = (offers || []).filter((offer) => {
    const hay = [
      offer.raw_label,
      offer.canonical_label,
      offer.material,
      offer.indice_refracao != null ? String(offer.indice_refracao) : '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(term)
  })

  if (!matches.length) {
    console.log('Nenhuma oferta encontrada para o termo:', query)
    return
  }

  console.log(`Ofertas encontradas: ${matches.length}`)
  for (const offer of matches) {
    console.log('---')
    console.log('id:', offer.id)
    console.log('label:', offer.canonical_label || offer.raw_label)
    console.log('material:', offer.material, 'indice:', offer.indice_refracao)
    const { data: grids, error: gridError } = await supabase
      .from('global_offer_diopter_grids')
      .select('sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata')
      .eq('offer_id', offer.id)

    if (gridError) throw gridError
    const summary = grids || []
    if (!summary.length) {
      console.log('sem grades')
      continue
    }
    const sphMin = Math.min(...summary.map((g) => g.sph_min ?? Infinity))
    const sphMax = Math.max(...summary.map((g) => g.sph_max ?? -Infinity))
    const cylMin = Math.min(...summary.map((g) => g.cyl_min ?? Infinity))
    const cylMax = Math.max(...summary.map((g) => g.cyl_max ?? -Infinity))
    const addMin = Math.min(...summary.map((g) => g.add_min ?? Infinity))
    const addMax = Math.max(...summary.map((g) => g.add_max ?? -Infinity))

    console.log('grades:', summary.length)
    console.log('sph:', [sphMin, sphMax])
    console.log('cyl:', [cylMin, cylMax])
    console.log('add:', [addMin, addMax])
    console.log('metadatas:', summary.slice(0, 3).map((g) => g.metadata))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
