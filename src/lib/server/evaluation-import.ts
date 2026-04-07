import 'server-only'

import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { Database } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'

type PreSaleSettings = {
  pre_sale_analysis_enabled?: boolean
}

type ProfileRow = Database['public']['Tables']['profiles']['Row']
type StoreSettingsRow = Pick<Database['public']['Tables']['stores']['Row'], 'settings'>
type QueryError = { message: string }
type SingleResult<T> = Promise<{ data: T | null; error: QueryError | null }>
type StoreTableApi = {
  select: (columns: string) => {
    eq: (column: string, value: number) => {
      single: () => SingleResult<StoreSettingsRow>
    }
  }
}

const execFileAsync = promisify(execFile)

export type OpticalEvaluationPreview = {
  source_document_url: string
  source_document_host: string | null
  source_system: 'ivision'
  status: 'importada'
  parse_status: 'success' | 'partial' | 'failed'
  source_os_number: string | null
  source_exam_type: string | null
  source_exam_datetime: string | null
  patient_name_raw: string | null
  age_years: number | null
  estilo_vida_uso_computador_horas: number | null
  estilo_vida_dirigir_horas: number | null
  estilo_vida_leitura_horas: number | null
  estilo_vida_uso_celular_horas: number | null
  estilo_vida_exposicao_sol_horas: number | null
  estilo_vida_ambiente_interno_horas: number | null
  estilo_vida_ambiente_externo_horas: number | null
  estilo_vida_assistir_tv_horas: number | null
  receita_longe_od_esferico: string | null
  receita_longe_od_cilindrico: string | null
  receita_longe_od_eixo: string | null
  receita_longe_oe_esferico: string | null
  receita_longe_oe_cilindrico: string | null
  receita_longe_oe_eixo: string | null
  receita_adicao: string | null
  recommended_lens_name: string | null
  commercial_recommendation_raw: string | null
  extracted_text: string
  raw_payload_json: Record<string, unknown>
  parse_warning: string | null
  document_hash: string
}

export type EvaluationPreviewResult = {
  success: boolean
  message: string
  data?: OpticalEvaluationPreview
}

const ImportPreviewSchema = z.object({
  storeId: z.coerce.number(),
  sourceUrl: z.string().url('Informe uma URL valida.')
})

function normalizeText(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function toIsoDateTime(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (!match) return null

  const [, dd, mm, yyyy, hh, min] = match
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00.000Z`
}

function parseIvisionText(text: string, sourceUrl: string): OpticalEvaluationPreview {
  const normalizedText = text.replace(/\r/g, '').trim()
  const compactText = collapseWhitespace(normalizedText)
  const lines = normalizedText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const host = (() => {
    try {
      return new URL(sourceUrl).host
    } catch {
      return null
    }
  })()

  const patientOsLine =
    lines.find((line) => line.toUpperCase().startsWith('PACIENTE:')) || compactText
  const patientMatch = compactText.match(/PACIENTE:\s*(.+?)\s+OS\s+([A-Z0-9-]+)/i)
  const patientNameRaw = normalizeText(patientMatch?.[1] || null)
  const sourceOsNumber = normalizeText(patientMatch?.[2] || null)

  const examLine = lines[0] || compactText
  const examMatch =
    compactText.match(/^(.+?)\s+iVISION\s+PACIENTE\b/i) ||
    compactText.match(/^(.+?)\s+\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/)
  const sourceExamType =
    normalizeText(examMatch?.[1] || null) ||
    normalizeText(examLine.replace(/iVISION\s*PACIENTE/i, '').trim()) ||
    normalizeText(examLine)

  const dateLine =
    lines.find((line) => /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(line)) || compactText
  const dateMatch = compactText.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/)
  const sourceExamDatetime = toIsoDateTime(dateMatch?.[1] || null)

  const ageLine = lines.find((line) => /^Idade\s+\d+/i.test(line)) || compactText
  const ageMatch = compactText.match(/Idade\s+(\d+)/i)
  const ageYears = ageMatch ? Number(ageMatch[1]) || null : null
  const computadorMatch = compactText.match(/Uso de Computador\s+(\d+)/i)
  const dirigirMatch = compactText.match(/Dirigir\s+(\d+)/i)
  const leituraMatch = compactText.match(/Leitura\s+(\d+)/i)
  const celularMatch = compactText.match(/Uso de celular\s+(\d+)/i)
  const solMatch = compactText.match(/Exposi\S*\s+ao sol\s+(\d+)/i)
  const ambienteInternoMatch = compactText.match(/Ambiente interno\s+(\d+)/i)
  const ambienteExternoMatch = compactText.match(/Ambiente externo\s+(\d+)/i)
  const assistirTvMatch = compactText.match(/Assistir TV\s+(\d+)/i)

  const esfMatch = compactText.match(/ESF\s+([+\-]?\d+(?:[.,]\d+)?)\s+([+\-]?\d+(?:[.,]\d+)?)/i)
  const cilMatch = compactText.match(/CIL\s+([+\-]?\d+(?:[.,]\d+)?)\s+([+\-]?\d+(?:[.,]\d+)?)/i)
  const eixoMatch = compactText.match(/EIXO\s+(\d+)[°ºÂ]?\s+(\d+)[°ºÂ]?/i)
  const addMatch = compactText.match(/ADI\S*\s+([+\-]?\d+(?:[.,]\d+)?)\s+([+\-]?\d+(?:[.,]\d+)?)/i)

  const recommendedLensMatch = compactText.match(
    /Recomend\S*\s+de\s+lente\s+(.+?)(?:\s+R\$\s*[\d.,]+|\s+Material:|\s+Tratamento:|\s+Computerized Initial Optical Analysis|\s*$)/i
  )
  const materialMatch = compactText.match(
    /Material:\s*(.+?)(?:\s+Tratamento:|\s+Computerized Initial Optical Analysis|\s*$)/i
  )
  const treatmentMatch = compactText.match(
    /Tratamento:\s*(.+?)(?:\s+Computerized Initial Optical Analysis|\s*$)/i
  )
  const recommendedLensLine = normalizeText(recommendedLensMatch?.[1] || null)
  const commercialSummary = [recommendedLensLine, materialMatch?.[1], treatmentMatch?.[1]]
    .map((item) => normalizeText(item || null))
    .filter(Boolean)
    .join(' | ')

  const parseWarnings: string[] = []
  if (!patientNameRaw) parseWarnings.push('Nome do paciente nao foi identificado automaticamente.')
  if (!sourceOsNumber) parseWarnings.push('Numero da OS nao foi identificado automaticamente.')
  if (!esfMatch || !cilMatch || !eixoMatch) {
    parseWarnings.push('Alguns campos de dioptria nao foram extraidos.')
  }
  if (!recommendedLensLine) {
    parseWarnings.push('Lente recomendada nao foi identificada automaticamente.')
  }

  return {
    source_document_url: sourceUrl,
    source_document_host: host,
    source_system: 'ivision',
    status: 'importada',
    parse_status: parseWarnings.length > 0 ? 'partial' : 'success',
    source_os_number: sourceOsNumber,
    source_exam_type: sourceExamType,
    source_exam_datetime: sourceExamDatetime,
    patient_name_raw: patientNameRaw,
    age_years: ageYears,
    estilo_vida_uso_computador_horas: computadorMatch ? Number(computadorMatch[1]) : null,
    estilo_vida_dirigir_horas: dirigirMatch ? Number(dirigirMatch[1]) : null,
    estilo_vida_leitura_horas: leituraMatch ? Number(leituraMatch[1]) : null,
    estilo_vida_uso_celular_horas: celularMatch ? Number(celularMatch[1]) : null,
    estilo_vida_exposicao_sol_horas: solMatch ? Number(solMatch[1]) : null,
    estilo_vida_ambiente_interno_horas: ambienteInternoMatch ? Number(ambienteInternoMatch[1]) : null,
    estilo_vida_ambiente_externo_horas: ambienteExternoMatch ? Number(ambienteExternoMatch[1]) : null,
    estilo_vida_assistir_tv_horas: assistirTvMatch ? Number(assistirTvMatch[1]) : null,
    receita_longe_od_esferico: normalizeText(esfMatch?.[1] || null),
    receita_longe_od_cilindrico: normalizeText(cilMatch?.[1] || null),
    receita_longe_od_eixo: normalizeText(eixoMatch?.[1] || null),
    receita_longe_oe_esferico: normalizeText(esfMatch?.[2] || null),
    receita_longe_oe_cilindrico: normalizeText(cilMatch?.[2] || null),
    receita_longe_oe_eixo: normalizeText(eixoMatch?.[2] || null),
    receita_adicao: normalizeText(addMatch?.[1] || null),
    recommended_lens_name: recommendedLensLine,
    commercial_recommendation_raw: normalizeText(commercialSummary || null),
    extracted_text: normalizedText,
    raw_payload_json: {
      lines,
      compactText,
      patientLine: patientOsLine,
      dateLine,
      ageLine,
      idade: ageYears,
      estiloVida: {
        usoComputadorHoras: computadorMatch ? Number(computadorMatch[1]) : null,
        dirigirHoras: dirigirMatch ? Number(dirigirMatch[1]) : null,
        leituraHoras: leituraMatch ? Number(leituraMatch[1]) : null,
        usoCelularHoras: celularMatch ? Number(celularMatch[1]) : null,
        exposicaoSolHoras: solMatch ? Number(solMatch[1]) : null,
        ambienteInternoHoras: ambienteInternoMatch ? Number(ambienteInternoMatch[1]) : null,
        ambienteExternoHoras: ambienteExternoMatch ? Number(ambienteExternoMatch[1]) : null,
        assistirTvHoras: assistirTvMatch ? Number(assistirTvMatch[1]) : null
      },
      dioptria: {
        esf: esfMatch ? [esfMatch[1], esfMatch[2]] : null,
        cil: cilMatch ? [cilMatch[1], cilMatch[2]] : null,
        eixo: eixoMatch ? [eixoMatch[1], eixoMatch[2]] : null,
        adicao: addMatch ? [addMatch[1], addMatch[2]] : null
      },
      recommendedLensLine,
      material: normalizeText(materialMatch?.[1] || null),
      tratamento: normalizeText(treatmentMatch?.[1] || null)
    },
    parse_warning: parseWarnings.length > 0 ? parseWarnings.join(' ') : null,
    document_hash: createHash('sha256').update(normalizedText).digest('hex')
  }
}

async function getAuthorizedContext(storeId: number) {
  const supabase = createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false as const, message: 'Usuario nao autenticado.' }
  }

  const profile = (await getProfileByAdmin(user.id)) as ProfileRow | null
  if (!profile?.tenant_id) {
    return { ok: false as const, message: 'Perfil do usuario sem tenant.' }
  }

  if (profile.role !== 'admin' && profile.store_id !== storeId) {
    return { ok: false as const, message: 'Acesso negado para esta loja.' }
  }

  return {
    ok: true as const,
    userId: user.id,
    tenantId: profile.tenant_id as string,
    profile
  }
}

async function isPreSaleAnalysisEnabled(storeId: number): Promise<boolean> {
  const storesTable = createAdminClient().from('stores') as unknown as StoreTableApi
  const { data, error } = await storesTable
    .select('settings')
    .eq('id', storeId)
    .single()

  if (error || !data) return false

  const settings = (data.settings || {}) as PreSaleSettings
  return settings.pre_sale_analysis_enabled === true
}

export async function importIvisionEvaluationPreviewInternal(
  input: unknown
): Promise<EvaluationPreviewResult> {
  const validated = ImportPreviewSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, message: validated.error.issues[0]?.message || 'URL invalida.' }
  }

  const auth = await getAuthorizedContext(validated.data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const isEnabled = await isPreSaleAnalysisEnabled(validated.data.storeId)
  if (!isEnabled) {
    return { success: false, message: 'A Analise Pre-Venda nao esta habilitada para esta loja.' }
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(validated.data.sourceUrl)
  } catch {
    return { success: false, message: 'URL invalida.' }
  }

  if (parsedUrl.protocol !== 'https:') {
    return { success: false, message: 'Somente links HTTPS sao permitidos.' }
  }

  const allowedHosts = new Set(['ivision-os.s3.us-east-2.amazonaws.com'])
  if (!allowedHosts.has(parsedUrl.host)) {
    return { success: false, message: 'Host do documento nao permitido para importacao automatica.' }
  }

  try {
    const response = await fetch(validated.data.sourceUrl)
    if (!response.ok) {
      return { success: false, message: `Falha ao baixar o PDF (${response.status}).` }
    }

    const arrayBuffer = await response.arrayBuffer()
    const tempFilePath = path.join(
      tmpdir(),
      `ivision-import-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
    )

    try {
      await writeFile(tempFilePath, Buffer.from(arrayBuffer))

      const scriptPath = path.join(process.cwd(), 'scripts', 'extract-ivision-pdf.mjs')
      const { stdout } = await execFileAsync(process.execPath, [scriptPath, tempFilePath], {
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      })

      const payload = JSON.parse(stdout) as { text?: string; error?: string }

      if (payload.error) {
        return { success: false, message: payload.error }
      }

      const text = payload.text?.trim()

      if (!text) {
        return {
          success: false,
          message: 'O PDF nao possui texto legivel para extracao automatica.'
        }
      }

      return {
        success: true,
        message: 'PDF lido com sucesso.',
        data: parseIvisionText(text, validated.data.sourceUrl)
      }
    } finally {
      await unlink(tempFilePath).catch(() => {})
    }
  } catch (error: unknown) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Erro ao processar o PDF.'
    }
  }
}
