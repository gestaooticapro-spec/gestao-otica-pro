import fs from 'fs/promises'
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
const inputPath =
  args.find((arg) => !arg.startsWith('--')) ||
  '.tabelas/auditoria_tratamentos_semantica_correcoes.json'
const apply = args.includes('--apply')
const severityFilter = args
  .find((arg) => arg.startsWith('--severity='))
  ?.split('=')[1]
  ?.split(',')
  .map((value) => value.trim())
  .filter(Boolean)

function mergeFeatures(currentFeatures, proposedSemanticProfile) {
  return {
    ...(currentFeatures || {}),
    semantic_profile: {
      ...((currentFeatures || {}).semantic_profile || {}),
      ...proposedSemanticProfile,
    },
  }
}

async function loadPayload() {
  const raw = await fs.readFile(inputPath, 'utf-8')
  return JSON.parse(raw)
}

async function main() {
  const payload = await loadPayload()
  const corrections = (payload.corrections || []).filter((item) => {
    if (!severityFilter?.length) return true
    return severityFilter.includes(item.severity)
  })

  console.log(apply ? 'APLICANDO correcoes de semantica' : 'DRY-RUN de correcoes de semantica')
  console.log(`Arquivo: ${inputPath}`)
  console.log(`Correcoes selecionadas: ${corrections.length}`)
  if (severityFilter?.length) {
    console.log(`Filtro de severidade: ${severityFilter.join(', ')}`)
  }

  if (!corrections.length) return

  const ids = corrections.map((item) => item.treatment_id)
  const { data: treatments, error } = await supabase
    .from('global_treatments')
    .select('id,nome,features')
    .in('id', ids)

  if (error) throw error
  const treatmentById = new Map((treatments || []).map((treatment) => [treatment.id, treatment]))

  let updated = 0
  const skipped = []

  for (const correction of corrections) {
    const treatment = treatmentById.get(correction.treatment_id)
    if (!treatment) {
      skipped.push({ nome: correction.nome, reason: 'tratamento nao encontrado' })
      continue
    }

    const nextFeatures = mergeFeatures(
      treatment.features,
      correction.full_proposed_semantic_profile,
    )

    const line = [
      correction.severity,
      correction.laboratorio || 'sem_lab',
      correction.nome,
      `${correction.current_normalized_tier || 'sem_tier'}=>${correction.proposed.positioning}`,
    ].join(' | ')

    if (!apply) {
      console.log(`- ${line}`)
      continue
    }

    const { error: updateError } = await supabase
      .from('global_treatments')
      .update({ features: nextFeatures })
      .eq('id', correction.treatment_id)

    if (updateError) throw updateError
    updated += 1
    console.log(`- atualizado: ${line}`)
  }

  if (skipped.length) {
    console.log('Ignorados:')
    for (const item of skipped) {
      console.log(`- ${item.nome}: ${item.reason}`)
    }
  }

  console.log(apply ? `Atualizados: ${updated}` : 'Nenhuma alteracao aplicada.')
  if (!apply) {
    console.log('Para aplicar: node scripts/apply_treatment_semantic_corrections.js --apply')
    console.log('Para aplicar apenas alta confianca: node scripts/apply_treatment_semantic_corrections.js --severity=alta --apply')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
