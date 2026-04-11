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
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const args = process.argv.slice(2)
const shouldCommit = args.includes('--commit')
const positionalArgs = args.filter((arg) => !arg.startsWith('--'))
const laboratorio = positionalArgs[0] || 'Optilab'
const versao = positionalArgs[1] || 'Optilab 06 de abril a 31 de julho de 2026'

function normalizeText(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function inferIndex(row) {
  const text = normalizeText([row.raw_label, row.canonical_label, row.material].filter(Boolean).join(' '))

  if (text.includes('airwear') || text.includes('poly') || text.includes('policarbonato')) {
    return 1.59
  }

  if (text.includes('orma') || text.includes('cr-39')) {
    return 1.5
  }

  return 1.5
}

async function main() {
  const { data: version, error: versionError } = await supabase
    .from('global_catalog_versions')
    .select('id,laboratorio,versao')
    .eq('laboratorio', laboratorio)
    .eq('versao', versao)
    .single()

  if (versionError || !version) {
    throw versionError || new Error('Versão não encontrada.')
  }

  const { data: families, error: familiesError } = await supabase
    .from('global_lens_families')
    .select('id')
    .eq('version_id', version.id)

  if (familiesError) throw familiesError

  const familyIds = (families || []).map((row) => row.id)
  if (!familyIds.length) {
    console.log('Nenhuma família encontrada para a versão.')
    return
  }

  const { data: offers, error: offersError } = await supabase
    .from('global_lens_offers')
    .select('id,raw_label,canonical_label,material,indice_refracao')
    .in('family_id', familyIds)
    .is('indice_refracao', null)

  if (offersError) throw offersError

  const updates = (offers || []).map((offer) => ({
    id: offer.id,
    indice_refracao: inferIndex(offer),
  }))

  console.log(
    JSON.stringify(
      {
        laboratorio: version.laboratorio,
        versao: version.versao,
        nullOffersFound: offers?.length || 0,
        plannedUpdates: updates.length,
        sample: updates.slice(0, 10),
        mode: shouldCommit ? 'commit' : 'dry-run',
      },
      null,
      2,
    ),
  )

  if (!shouldCommit || !updates.length) {
    return
  }

  for (const update of updates) {
    const { error } = await supabase
      .from('global_lens_offers')
      .update({ indice_refracao: update.indice_refracao })
      .eq('id', update.id)

    if (error) throw error
  }

  console.log(`Atualização concluída: ${updates.length} ofertas receberam índice.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
