'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { Database } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'

type PreSaleSettings = {
  pre_sale_analysis_enabled?: boolean
}

type OpticalEvaluationTableRow = Database['public']['Tables']['optical_evaluations']['Row']
type OpticalEvaluationInsert = Database['public']['Tables']['optical_evaluations']['Insert']
type EvaluationJson = OpticalEvaluationTableRow['raw_payload_json']
type StoreSettingsRow = Pick<Database['public']['Tables']['stores']['Row'], 'settings'>
type QueryError = { message: string }
type SingleResult<T> = Promise<{ data: T | null; error: QueryError | null }>
type ManyResult<T> = Promise<{ data: T[] | null; error: QueryError | null }>
type StoreTableApi = {
  select: (columns: string) => {
    eq: (column: string, value: number) => {
      single: () => SingleResult<StoreSettingsRow>
    }
  }
}
type OpticalEvaluationsSelectBuilder = {
  eq: (column: string, value: number) => OpticalEvaluationsSelectBuilder
  order: (column: string, options: { ascending: boolean }) => OpticalEvaluationsSelectBuilder
  limit: (count: number) => ManyResult<OpticalEvaluationTableRow>
}
type OpticalEvaluationsTableApi = {
  select: (columns: string) => OpticalEvaluationsSelectBuilder
  insert: (values: OpticalEvaluationInsert) => {
    select: (columns: string) => {
      single: () => SingleResult<OpticalEvaluationTableRow>
    }
  }
  update: (values: Partial<OpticalEvaluationInsert>) => {
    eq: (column: string, value: number | string) => {
      eq: (column: string, value: number | string) => {
        select: (columns: string) => {
          single: () => SingleResult<OpticalEvaluationTableRow>
        }
      }
    }
  }
}

export type OpticalEvaluationRow = {
  id: number
  created_at: string
  updated_at: string
  tenant_id: string
  store_id: number
  evaluated_customer_id: number | null
  evaluated_dependente_id: number | null
  responsible_customer_id: number | null
  imported_by_user_id: string | null
  source_system: 'manual' | 'ivision'
  status: 'rascunho' | 'concluida' | 'importada' | 'exportada'
  parse_status: 'success' | 'partial' | 'failed'
  source_document_url: string | null
  source_document_host: string | null
  source_os_number: string | null
  source_exam_type: string | null
  source_exam_datetime: string | null
  patient_name_raw: string | null
  evaluated_name_snapshot: string | null
  responsible_name_snapshot: string | null
  relationship_snapshot: string | null
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
  receita_perto_od_esferico: string | null
  receita_perto_od_cilindrico: string | null
  receita_perto_od_eixo: string | null
  receita_perto_oe_esferico: string | null
  receita_perto_oe_cilindrico: string | null
  receita_perto_oe_eixo: string | null
  receita_adicao: string | null
  medida_dnp_od: string | null
  medida_dnp_oe: string | null
  medida_altura_od: string | null
  medida_altura_oe: string | null
  recommended_lens_name: string | null
  commercial_recommendation_raw: string | null
  extracted_text: string | null
  raw_payload_json: EvaluationJson
  parse_warning: string | null
  document_hash: string | null
  exported_service_order_id: number | null
  outcome_status: 'venda_fechada' | 'cliente_pesquisa' | 'perdido_preco' | 'perdido_produto' | 'perdido_prazo' | null
  panic_reason: string | null
  recommended_items: unknown | null
  exported_venda_id: number | null
}

export type OpticalEvaluationListItem = OpticalEvaluationRow & {
  evaluated_patient_name: string | null
  responsible_customer_name: string | null
}

export type OpticalEvaluationImportOption = {
  id: number
  created_at: string
  source_system: 'manual' | 'ivision'
  source_document_url: string | null
  source_exam_type: string | null
  source_os_number: string | null
  evaluated_patient_name: string | null
  recommended_lens_name: string | null
  receita_longe_od_esferico: string | null
  receita_longe_od_cilindrico: string | null
  receita_longe_od_eixo: string | null
  receita_longe_oe_esferico: string | null
  receita_longe_oe_cilindrico: string | null
  receita_longe_oe_eixo: string | null
  receita_adicao: string | null
  exported_service_order_id: number | null
}

export type OpticalEvaluationSummary = {
  id: number
  created_at: string
  source_system: 'manual' | 'ivision'
  source_document_url: string | null
  source_exam_type: string | null
  source_os_number: string | null
  evaluated_patient_name: string | null
}

export type OpticalEvaluationApplyResult = {
  evaluationId: number
  createdAt: string
  sourceSystem: 'manual' | 'ivision'
  sourceDocumentUrl: string | null
  sourceExamType: string | null
  sourceOsNumber: string | null
  evaluatedPatientName: string | null
  recommendedLensName: string | null
  commercialRecommendationRaw: string | null
  receitaLongeOdEsferico: string | null
  receitaLongeOdCilindrico: string | null
  receitaLongeOdEixo: string | null
  receitaLongeOeEsferico: string | null
  receitaLongeOeCilindrico: string | null
  receitaLongeOeEixo: string | null
  receitaPertoOdEsferico: string | null
  receitaPertoOdCilindrico: string | null
  receitaPertoOdEixo: string | null
  receitaPertoOeEsferico: string | null
  receitaPertoOeCilindrico: string | null
  receitaPertoOeEixo: string | null
  receitaAdicao: string | null
  medidaDnpOd: string | null
  medidaDnpOe: string | null
  medidaAlturaOd: string | null
  medidaAlturaOe: string | null
  overwriteFields: string[]
  wouldOverwriteExistingData: boolean
}

export type EvaluationActionResult<T = undefined> = {
  success: boolean
  message: string
  data?: T
}

const SaveEvaluationSchema = z
  .object({
    storeId: z.coerce.number(),
    evaluatedCustomerId: z.coerce.number().nullable().optional(),
    evaluatedDependenteId: z.coerce.number().nullable().optional(),
    responsibleCustomerId: z.coerce.number().nullable().optional(),
    evaluatedNameSnapshot: z.string().min(2, 'Selecione o paciente avaliado.'),
    responsibleNameSnapshot: z.string().nullable().optional(),
    relationshipSnapshot: z.string().nullable().optional(),
    sourceSystem: z.enum(['manual', 'ivision']),
    status: z.enum(['rascunho', 'em_andamento', 'pendente', 'concluida', 'importada', 'exportada']).optional(),
    parseStatus: z.enum(['success', 'partial', 'failed']).default('success'),
    sourceDocumentUrl: z.string().url().nullable().optional(),
    sourceDocumentHost: z.string().nullable().optional(),
    sourceOsNumber: z.string().nullable().optional(),
    sourceExamType: z.string().nullable().optional(),
    sourceExamDatetime: z.string().nullable().optional(),
    patientNameRaw: z.string().nullable().optional(),
    ageYears: z.coerce.number().nullable().optional(),
    estiloVidaUsoComputadorHoras: z.coerce.number().nullable().optional(),
    estiloVidaDirigirHoras: z.coerce.number().nullable().optional(),
    estiloVidaLeituraHoras: z.coerce.number().nullable().optional(),
    estiloVidaUsoCelularHoras: z.coerce.number().nullable().optional(),
    estiloVidaExposicaoSolHoras: z.coerce.number().nullable().optional(),
    estiloVidaAmbienteInternoHoras: z.coerce.number().nullable().optional(),
    estiloVidaAmbienteExternoHoras: z.coerce.number().nullable().optional(),
    estiloVidaAssistirTvHoras: z.coerce.number().nullable().optional(),
    receitaLongeOdEsferico: z.string().nullable().optional(),
    receitaLongeOdCilindrico: z.string().nullable().optional(),
    receitaLongeOdEixo: z.string().nullable().optional(),
    receitaLongeOeEsferico: z.string().nullable().optional(),
    receitaLongeOeCilindrico: z.string().nullable().optional(),
    receitaLongeOeEixo: z.string().nullable().optional(),
    receitaPertoOdEsferico: z.string().nullable().optional(),
    receitaPertoOdCilindrico: z.string().nullable().optional(),
    receitaPertoOdEixo: z.string().nullable().optional(),
    receitaPertoOeEsferico: z.string().nullable().optional(),
    receitaPertoOeCilindrico: z.string().nullable().optional(),
    receitaPertoOeEixo: z.string().nullable().optional(),
    receitaAdicao: z.string().nullable().optional(),
    medidaDnpOd: z.string().nullable().optional(),
    medidaDnpOe: z.string().nullable().optional(),
    medidaAlturaOd: z.string().nullable().optional(),
    medidaAlturaOe: z.string().nullable().optional(),
    recommendedLensName: z.string().nullable().optional(),
    commercialRecommendationRaw: z.string().nullable().optional(),
    recommendedItems: z.array(z.unknown()).nullable().optional(),
    extractedText: z.string().nullable().optional(),
    rawPayloadJson: z.record(z.string(), z.unknown()).nullable().optional(),
    parseWarning: z.string().nullable().optional(),
    documentHash: z.string().nullable().optional(),
    employeeId: z.coerce.number().nullable().optional()
  })
  .superRefine((data, ctx) => {
    const hasCustomer = !!data.evaluatedCustomerId
    const hasDependente = !!data.evaluatedDependenteId

    if (hasCustomer === hasDependente) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selecione exatamente um paciente avaliado.',
        path: ['evaluatedCustomerId']
      })
    }
  })

function normalizeText(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null
}

function hasAnyValue(values: Array<string | null | undefined>) {
  return values.some((value) => !!normalizeText(value))
}

function mapEvaluationToListItem(row: OpticalEvaluationTableRow): OpticalEvaluationListItem {
  return {
    ...row,
    evaluated_patient_name: row.evaluated_name_snapshot || row.patient_name_raw || null,
    responsible_customer_name: row.responsible_name_snapshot || null
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

  const profile = (await getProfileByAdmin(user.id)) as
    | Database['public']['Tables']['profiles']['Row']
    | null

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

export async function isPreSaleAnalysisEnabled(storeId: number): Promise<boolean> {
  const storesTable = createAdminClient().from('stores') as unknown as StoreTableApi
  const { data, error } = await storesTable
    .select('settings')
    .eq('id', storeId)
    .single()

  if (error || !data) return false

  const settings = (data.settings || {}) as PreSaleSettings
  return settings.pre_sale_analysis_enabled === true
}

export async function saveOpticalEvaluation(
  input: z.infer<typeof SaveEvaluationSchema>
): Promise<EvaluationActionResult<OpticalEvaluationRow>> {
  const validated = SaveEvaluationSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, message: validated.error.issues[0]?.message || 'Dados invalidos.' }
  }

  const auth = await getAuthorizedContext(validated.data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const isEnabled = await isPreSaleAnalysisEnabled(validated.data.storeId)
  if (!isEnabled) {
    return { success: false, message: 'A Analise Pre-Venda nao esta habilitada para esta loja.' }
  }

  const opticalEvaluationsTable = createAdminClient().from('optical_evaluations') as unknown as OpticalEvaluationsTableApi
  const data = validated.data
  const derivedStatus = data.status ?? (data.sourceSystem === 'ivision' ? 'importada' : 'concluida')

  const payload: OpticalEvaluationInsert = {
    tenant_id: auth.tenantId,
    store_id: data.storeId,
    evaluated_customer_id: data.evaluatedCustomerId ?? null,
    evaluated_dependente_id: data.evaluatedDependenteId ?? null,
    responsible_customer_id: data.responsibleCustomerId ?? null,
    employee_id: data.employeeId ?? null,
    imported_by_user_id: auth.userId,
    source_system: data.sourceSystem,
    status: derivedStatus,
    parse_status: data.parseStatus,
    source_document_url: normalizeText(data.sourceDocumentUrl),
    source_document_host: normalizeText(data.sourceDocumentHost),
    source_os_number: normalizeText(data.sourceOsNumber),
    source_exam_type: normalizeText(data.sourceExamType),
    source_exam_datetime: data.sourceExamDatetime || null,
    patient_name_raw: normalizeText(data.patientNameRaw),
    evaluated_name_snapshot: normalizeText(data.evaluatedNameSnapshot),
    responsible_name_snapshot: normalizeText(data.responsibleNameSnapshot),
    relationship_snapshot: normalizeText(data.relationshipSnapshot),
    age_years: data.ageYears ?? null,
    estilo_vida_uso_computador_horas: data.estiloVidaUsoComputadorHoras ?? null,
    estilo_vida_dirigir_horas: data.estiloVidaDirigirHoras ?? null,
    estilo_vida_leitura_horas: data.estiloVidaLeituraHoras ?? null,
    estilo_vida_uso_celular_horas: data.estiloVidaUsoCelularHoras ?? null,
    estilo_vida_exposicao_sol_horas: data.estiloVidaExposicaoSolHoras ?? null,
    estilo_vida_ambiente_interno_horas: data.estiloVidaAmbienteInternoHoras ?? null,
    estilo_vida_ambiente_externo_horas: data.estiloVidaAmbienteExternoHoras ?? null,
    estilo_vida_assistir_tv_horas: data.estiloVidaAssistirTvHoras ?? null,
    receita_longe_od_esferico: normalizeText(data.receitaLongeOdEsferico),
    receita_longe_od_cilindrico: normalizeText(data.receitaLongeOdCilindrico),
    receita_longe_od_eixo: normalizeText(data.receitaLongeOdEixo),
    receita_longe_oe_esferico: normalizeText(data.receitaLongeOeEsferico),
    receita_longe_oe_cilindrico: normalizeText(data.receitaLongeOeCilindrico),
    receita_longe_oe_eixo: normalizeText(data.receitaLongeOeEixo),
    receita_perto_od_esferico: normalizeText(data.receitaPertoOdEsferico),
    receita_perto_od_cilindrico: normalizeText(data.receitaPertoOdCilindrico),
    receita_perto_od_eixo: normalizeText(data.receitaPertoOdEixo),
    receita_perto_oe_esferico: normalizeText(data.receitaPertoOeEsferico),
    receita_perto_oe_cilindrico: normalizeText(data.receitaPertoOeCilindrico),
    receita_perto_oe_eixo: normalizeText(data.receitaPertoOeEixo),
    receita_adicao: normalizeText(data.receitaAdicao),
    medida_dnp_od: normalizeText(data.medidaDnpOd),
    medida_dnp_oe: normalizeText(data.medidaDnpOe),
    medida_altura_od: normalizeText(data.medidaAlturaOd),
    medida_altura_oe: normalizeText(data.medidaAlturaOe),
    recommended_lens_name: normalizeText(data.recommendedLensName),
    commercial_recommendation_raw: normalizeText(data.commercialRecommendationRaw),
    extracted_text: normalizeText(data.extractedText),
    raw_payload_json: (data.rawPayloadJson || {}) as EvaluationJson,
    parse_warning: normalizeText(data.parseWarning),
    document_hash: normalizeText(data.documentHash),
    updated_at: new Date().toISOString()
  }

  const { data: inserted, error } = await opticalEvaluationsTable
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    return { success: false, message: error.message }
  }

  revalidatePath(`/dashboard/loja/${data.storeId}/avaliacao`)
  return { success: true, message: 'Avaliacao salva com sucesso.', data: inserted as OpticalEvaluationRow }
}

export async function getOpticalEvaluationsForSubject(input: {
  storeId: number
  customerId?: number | null
  dependenteId?: number | null
}): Promise<OpticalEvaluationListItem[]> {
  const auth = await getAuthorizedContext(input.storeId)
  if (!auth.ok) return []

  const isEnabled = await isPreSaleAnalysisEnabled(input.storeId)
  if (!isEnabled) return []

  const opticalEvaluationsTable = createAdminClient().from('optical_evaluations') as unknown as OpticalEvaluationsTableApi
  let query = opticalEvaluationsTable
    .select('*')
    .eq('store_id', input.storeId)
    .order('created_at', { ascending: false })

  if (input.dependenteId) {
    query = query.eq('evaluated_dependente_id', input.dependenteId)
  } else if (input.customerId) {
    query = query.eq('evaluated_customer_id', input.customerId)
  } else {
    return []
  }

  const { data, error } = await query.limit(30)
  if (error || !data) return []

  return data.map(mapEvaluationToListItem)
}

export async function getOpticalEvaluationsForServiceOrderImport(input: {
  storeId: number
  customerId?: number | null
  dependenteId?: number | null
  serviceOrderId?: number | null
}): Promise<OpticalEvaluationImportOption[]> {
  const rows = await getOpticalEvaluationsForSubject({
    storeId: input.storeId,
    customerId: input.customerId,
    dependenteId: input.dependenteId
  })

  return rows
    .filter((row) => row.exported_service_order_id === null || row.exported_service_order_id === input.serviceOrderId)
    .map((row) => ({
      id: row.id,
      created_at: row.created_at,
      source_system: row.source_system,
      source_document_url: row.source_document_url,
      source_exam_type: row.source_exam_type,
      source_os_number: row.source_os_number,
      evaluated_patient_name: row.evaluated_patient_name,
      recommended_lens_name: row.recommended_lens_name,
      receita_longe_od_esferico: row.receita_longe_od_esferico,
      receita_longe_od_cilindrico: row.receita_longe_od_cilindrico,
      receita_longe_od_eixo: row.receita_longe_od_eixo,
      receita_longe_oe_esferico: row.receita_longe_oe_esferico,
      receita_longe_oe_cilindrico: row.receita_longe_oe_cilindrico,
      receita_longe_oe_eixo: row.receita_longe_oe_eixo,
      receita_adicao: row.receita_adicao,
      exported_service_order_id: row.exported_service_order_id
    }))
}

export async function getOpticalEvaluationSummaryById(input: {
  storeId: number
  evaluationId: number
}): Promise<OpticalEvaluationSummary | null> {
  const auth = await getAuthorizedContext(input.storeId)
  if (!auth.ok) return null

  const opticalEvaluationsTable = createAdminClient().from('optical_evaluations') as unknown as OpticalEvaluationsTableApi
  const { data, error } = await opticalEvaluationsTable
    .select('*')
    .eq('store_id', input.storeId)
    .eq('id', input.evaluationId)
    .limit(1)

  if (error || !data?.[0]) return null

  const row = mapEvaluationToListItem(data[0])
  return {
    id: row.id,
    created_at: row.created_at,
    source_system: row.source_system,
    source_document_url: row.source_document_url,
    source_exam_type: row.source_exam_type,
    source_os_number: row.source_os_number,
    evaluated_patient_name: row.evaluated_patient_name
  }
}

const ApplyEvaluationSchema = z.object({
  storeId: z.coerce.number(),
  evaluationId: z.coerce.number(),
  customerId: z.coerce.number(),
  dependenteId: z.coerce.number().nullable().optional(),
  serviceOrderId: z.coerce.number().nullable().optional(),
  currentReceitaLongeOdEsferico: z.string().nullable().optional(),
  currentReceitaLongeOdCilindrico: z.string().nullable().optional(),
  currentReceitaLongeOdEixo: z.string().nullable().optional(),
  currentReceitaLongeOeEsferico: z.string().nullable().optional(),
  currentReceitaLongeOeCilindrico: z.string().nullable().optional(),
  currentReceitaLongeOeEixo: z.string().nullable().optional(),
  currentReceitaPertoOdEsferico: z.string().nullable().optional(),
  currentReceitaPertoOdCilindrico: z.string().nullable().optional(),
  currentReceitaPertoOdEixo: z.string().nullable().optional(),
  currentReceitaPertoOeEsferico: z.string().nullable().optional(),
  currentReceitaPertoOeCilindrico: z.string().nullable().optional(),
  currentReceitaPertoOeEixo: z.string().nullable().optional(),
  currentReceitaAdicao: z.string().nullable().optional(),
  currentMedidaDnpOd: z.string().nullable().optional(),
  currentMedidaDnpOe: z.string().nullable().optional(),
  currentMedidaAlturaOd: z.string().nullable().optional(),
  currentMedidaAlturaOe: z.string().nullable().optional()
})

export async function applyOpticalEvaluationToServiceOrder(
  input: z.infer<typeof ApplyEvaluationSchema>
): Promise<EvaluationActionResult<OpticalEvaluationApplyResult>> {
  const validated = ApplyEvaluationSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, message: validated.error.issues[0]?.message || 'Dados invalidos.' }
  }

  const data = validated.data
  const auth = await getAuthorizedContext(data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const opticalEvaluationsTable = createAdminClient().from('optical_evaluations') as unknown as OpticalEvaluationsTableApi
  const { data: rows, error } = await opticalEvaluationsTable
    .select('*')
    .eq('store_id', data.storeId)
    .eq('id', data.evaluationId)
    .limit(1)

  const row = rows?.[0]
  if (error || !row) {
    return { success: false, message: 'Avaliacao nao encontrada.' }
  }

  const matchesSubject =
    (data.dependenteId && row.evaluated_dependente_id === data.dependenteId) ||
    (!data.dependenteId && row.evaluated_customer_id === data.customerId)

  if (!matchesSubject) {
    return { success: false, message: 'Esta avaliacao nao pertence ao paciente selecionado na OS.' }
  }

  if (row.exported_service_order_id && row.exported_service_order_id !== data.serviceOrderId) {
    return { success: false, message: 'Esta avaliacao ja esta vinculada a outra OS.' }
  }

  const overwriteFields: string[] = []
  const overwriteChecks: Array<[string, string | null | undefined, string | null | undefined]> = [
    ['OD esférico longe', row.receita_longe_od_esferico, data.currentReceitaLongeOdEsferico],
    ['OD cilíndrico longe', row.receita_longe_od_cilindrico, data.currentReceitaLongeOdCilindrico],
    ['OD eixo longe', row.receita_longe_od_eixo, data.currentReceitaLongeOdEixo],
    ['OE esférico longe', row.receita_longe_oe_esferico, data.currentReceitaLongeOeEsferico],
    ['OE cilíndrico longe', row.receita_longe_oe_cilindrico, data.currentReceitaLongeOeCilindrico],
    ['OE eixo longe', row.receita_longe_oe_eixo, data.currentReceitaLongeOeEixo],
    ['OD esférico perto', row.receita_perto_od_esferico, data.currentReceitaPertoOdEsferico],
    ['OD cilíndrico perto', row.receita_perto_od_cilindrico, data.currentReceitaPertoOdCilindrico],
    ['OD eixo perto', row.receita_perto_od_eixo, data.currentReceitaPertoOdEixo],
    ['OE esférico perto', row.receita_perto_oe_esferico, data.currentReceitaPertoOeEsferico],
    ['OE cilíndrico perto', row.receita_perto_oe_cilindrico, data.currentReceitaPertoOeCilindrico],
    ['OE eixo perto', row.receita_perto_oe_eixo, data.currentReceitaPertoOeEixo],
    ['Adição', row.receita_adicao, data.currentReceitaAdicao],
    ['DNP OD', row.medida_dnp_od, data.currentMedidaDnpOd],
    ['DNP OE', row.medida_dnp_oe, data.currentMedidaDnpOe],
    ['Altura OD', row.medida_altura_od, data.currentMedidaAlturaOd],
    ['Altura OE', row.medida_altura_oe, data.currentMedidaAlturaOe]
  ]

  overwriteChecks.forEach(([label, incoming, current]) => {
    if (normalizeText(incoming) && normalizeText(current)) {
      overwriteFields.push(label)
    }
  })

  return {
    success: true,
    message: overwriteFields.length > 0
      ? 'A avaliacao foi preparada e vai sobrescrever alguns campos da OS.'
      : 'Avaliacao pronta para importacao na OS.',
    data: {
      evaluationId: row.id,
      createdAt: row.created_at,
      sourceSystem: row.source_system,
      sourceDocumentUrl: row.source_document_url,
      sourceExamType: row.source_exam_type,
      sourceOsNumber: row.source_os_number,
      evaluatedPatientName: row.evaluated_name_snapshot || row.patient_name_raw || null,
      recommendedLensName: row.recommended_lens_name,
      commercialRecommendationRaw: row.commercial_recommendation_raw,
      receitaLongeOdEsferico: row.receita_longe_od_esferico,
      receitaLongeOdCilindrico: row.receita_longe_od_cilindrico,
      receitaLongeOdEixo: row.receita_longe_od_eixo,
      receitaLongeOeEsferico: row.receita_longe_oe_esferico,
      receitaLongeOeCilindrico: row.receita_longe_oe_cilindrico,
      receitaLongeOeEixo: row.receita_longe_oe_eixo,
      receitaPertoOdEsferico: row.receita_perto_od_esferico,
      receitaPertoOdCilindrico: row.receita_perto_od_cilindrico,
      receitaPertoOdEixo: row.receita_perto_od_eixo,
      receitaPertoOeEsferico: row.receita_perto_oe_esferico,
      receitaPertoOeCilindrico: row.receita_perto_oe_cilindrico,
      receitaPertoOeEixo: row.receita_perto_oe_eixo,
      receitaAdicao: row.receita_adicao,
      medidaDnpOd: row.medida_dnp_od,
      medidaDnpOe: row.medida_dnp_oe,
      medidaAlturaOd: row.medida_altura_od,
      medidaAlturaOe: row.medida_altura_oe,
      overwriteFields,
      wouldOverwriteExistingData: hasAnyValue(overwriteChecks.map(([, incoming, current]) => normalizeText(incoming) && normalizeText(current) ? '1' : null))
    }
  }
}

export type UpsertEvaluationInput = z.infer<typeof SaveEvaluationSchema> & {
  evaluationId?: number
}

export async function upsertOpticalEvaluation(
  input: UpsertEvaluationInput
): Promise<EvaluationActionResult<OpticalEvaluationRow>> {
  const validated = SaveEvaluationSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, message: validated.error.issues[0]?.message || 'Dados invalidos.' }
  }

  const auth = await getAuthorizedContext(validated.data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const isEnabled = await isPreSaleAnalysisEnabled(validated.data.storeId)
  if (!isEnabled) {
    return { success: false, message: 'A Analise Pre-Venda nao esta habilitada para esta loja.' }
  }

  const opticalEvaluationsTable = createAdminClient().from('optical_evaluations') as unknown as OpticalEvaluationsTableApi
  const data = validated.data
  const derivedStatus = data.status ?? (data.sourceSystem === 'ivision' ? 'importada' : 'em_andamento')

  const payload: Partial<OpticalEvaluationInsert> = {
    tenant_id: auth.tenantId,
    store_id: data.storeId,
    evaluated_customer_id: data.evaluatedCustomerId ?? null,
    evaluated_dependente_id: data.evaluatedDependenteId ?? null,
    responsible_customer_id: data.responsibleCustomerId ?? null,
    employee_id: data.employeeId ?? null,
    imported_by_user_id: auth.userId,
    source_system: data.sourceSystem,
    status: derivedStatus,
    parse_status: data.parseStatus,
    source_document_url: normalizeText(data.sourceDocumentUrl),
    source_document_host: normalizeText(data.sourceDocumentHost),
    source_os_number: normalizeText(data.sourceOsNumber),
    source_exam_type: normalizeText(data.sourceExamType),
    source_exam_datetime: data.sourceExamDatetime || null,
    patient_name_raw: normalizeText(data.patientNameRaw),
    evaluated_name_snapshot: normalizeText(data.evaluatedNameSnapshot),
    responsible_name_snapshot: normalizeText(data.responsibleNameSnapshot),
    relationship_snapshot: normalizeText(data.relationshipSnapshot),
    age_years: data.ageYears ?? null,
    estilo_vida_uso_computador_horas: data.estiloVidaUsoComputadorHoras ?? null,
    estilo_vida_dirigir_horas: data.estiloVidaDirigirHoras ?? null,
    estilo_vida_leitura_horas: data.estiloVidaLeituraHoras ?? null,
    estilo_vida_uso_celular_horas: data.estiloVidaUsoCelularHoras ?? null,
    estilo_vida_exposicao_sol_horas: data.estiloVidaExposicaoSolHoras ?? null,
    estilo_vida_ambiente_interno_horas: data.estiloVidaAmbienteInternoHoras ?? null,
    estilo_vida_ambiente_externo_horas: data.estiloVidaAmbienteExternoHoras ?? null,
    estilo_vida_assistir_tv_horas: data.estiloVidaAssistirTvHoras ?? null,
    receita_longe_od_esferico: normalizeText(data.receitaLongeOdEsferico),
    receita_longe_od_cilindrico: normalizeText(data.receitaLongeOdCilindrico),
    receita_longe_od_eixo: normalizeText(data.receitaLongeOdEixo),
    receita_longe_oe_esferico: normalizeText(data.receitaLongeOeEsferico),
    receita_longe_oe_cilindrico: normalizeText(data.receitaLongeOeCilindrico),
    receita_longe_oe_eixo: normalizeText(data.receitaLongeOeEixo),
    receita_perto_od_esferico: normalizeText(data.receitaPertoOdEsferico),
    receita_perto_od_cilindrico: normalizeText(data.receitaPertoOdCilindrico),
    receita_perto_od_eixo: normalizeText(data.receitaPertoOdEixo),
    receita_perto_oe_esferico: normalizeText(data.receitaPertoOeEsferico),
    receita_perto_oe_cilindrico: normalizeText(data.receitaPertoOeCilindrico),
    receita_perto_oe_eixo: normalizeText(data.receitaPertoOeEixo),
    receita_adicao: normalizeText(data.receitaAdicao),
    medida_dnp_od: normalizeText(data.medidaDnpOd),
    medida_dnp_oe: normalizeText(data.medidaDnpOe),
    medida_altura_od: normalizeText(data.medidaAlturaOd),
    medida_altura_oe: normalizeText(data.medidaAlturaOe),
    recommended_lens_name: normalizeText(data.recommendedLensName),
    commercial_recommendation_raw: normalizeText(data.commercialRecommendationRaw),
    recommended_items: (data.recommendedItems ?? null) as any,
    extracted_text: normalizeText(data.extractedText),
    raw_payload_json: (data.rawPayloadJson || {}) as EvaluationJson,
    parse_warning: normalizeText(data.parseWarning),
    document_hash: normalizeText(data.documentHash),
    updated_at: new Date().toISOString()
  }

  if (input.evaluationId) {
    const { data: updated, error } = await opticalEvaluationsTable
      .update(payload)
      .eq('id', input.evaluationId)
      .eq('store_id', data.storeId)
      .select('*')
      .single()

    if (error) {
      return { success: false, message: error.message }
    }
    
    return { success: true, message: 'Avaliacao atualizada com sucesso.', data: updated as OpticalEvaluationRow }
  } else {
    const insertPayload = payload as OpticalEvaluationInsert
    const { data: inserted, error } = await opticalEvaluationsTable
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) {
      return { success: false, message: error.message }
    }

    revalidatePath(`/dashboard/loja/${data.storeId}/avaliacao`)
    return { success: true, message: 'Avaliacao salva com sucesso.', data: inserted as OpticalEvaluationRow }
  }
}


export async function getRecentEvaluationsForEmployee(
  employeeId: number,
  storeId: number,
  limit: number = 20
): Promise<OpticalEvaluationListItem[]> {
  try {
    const tableApi = createClient().from('optical_evaluations') as unknown as OpticalEvaluationsTableApi
    
    // Create query to fetch recent evaluations that are not converted (exported_venda_id is null)
    // and status is not concluida, so we can resume them. Also filter by store_id and employee_id.
    const query = createClient()
      .from('optical_evaluations')
      .select(`
        *,
        evaluated_patient:customers!optical_evaluations_evaluated_customer_id_fkey(full_name),
        responsible_customer:customers!optical_evaluations_responsible_customer_id_fkey(full_name)
      `)
      .eq('store_id', storeId)
      .eq('employee_id', employeeId)
      .is('exported_venda_id', null)
      .not('status', 'eq', 'concluida')
      .order('created_at', { ascending: false })
      .limit(limit)

    const { data: records, error } = await query

    if (error) {
      console.error('getRecentEvaluationsForEmployee: Query error', error)
      return []
    }

    if (!records) return []

    return records.map((record: any) => ({
      ...record,
      evaluated_patient_name:
        record.evaluated_name_snapshot || 
        record.evaluated_patient?.full_name ||
        record.patient_name_raw || null,
      responsible_customer_name:
        record.responsible_name_snapshot ||
        record.responsible_customer?.full_name || null
    })) as OpticalEvaluationListItem[]
  } catch (error) {
    console.error('getRecentEvaluationsForEmployee: Unexpected error', error)
    return []
  }
}

export async function updateEvaluationPanicReason(
  evaluationId: number,
  storeId: number,
  panicReason: string
): Promise<EvaluationActionResult> {
  try {
    const tableApi = createAdminClient().from('optical_evaluations') as any
    
    const { error } = await tableApi
      .update({ panic_reason: panicReason } as any)
      .eq('id', evaluationId)
      .eq('store_id', storeId)

    if (error) {
      return { success: false, message: error.message }
    }
    
    return { success: true, message: 'Motivo registrado com sucesso.' }
  } catch (error) {
    return { success: false, message: 'Falha inesperada.' }
  }
}

export async function updateEvaluationOutcomeStatus(
  evaluationId: number,
  storeId: number,
  outcomeStatus: 'cliente_pesquisa' | 'perdido_preco' | 'perdido_produto' | 'perdido_prazo'
): Promise<EvaluationActionResult> {
  try {
    const tableApi = createAdminClient().from('optical_evaluations') as any

    const { error } = await tableApi
      .update({ outcome_status: outcomeStatus, status: 'concluida' } as any)
      .eq('id', evaluationId)
      .eq('store_id', storeId)

    if (error) return { success: false, message: error.message }
    return { success: true, message: 'Desfecho registrado com sucesso.' }
  } catch {
    return { success: false, message: 'Falha ao registrar desfecho.' }
  }
}

export async function updateEvaluationExportedVendaId(
  evaluationId: number,
  storeId: number,
  vendaId: number
): Promise<EvaluationActionResult> {
  try {
    const tableApi = createAdminClient().from('optical_evaluations') as any
    const { error } = await tableApi
      .update({ exported_venda_id: vendaId } as any)
      .eq('id', evaluationId)
      .eq('store_id', storeId)

    if (error) return { success: false, message: error.message }
    return { success: true, message: 'Vinculado com sucesso.' }
  } catch (error) {
    return { success: false, message: 'Falha ao vincular venda.' }
  }
}
