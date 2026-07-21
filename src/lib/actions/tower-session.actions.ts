'use server'

/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas da Torre ainda nao constam integralmente nos tipos gerados do Supabase */

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { authorizeTowerStoreAccess } from '@/lib/server/tower-device-web-session'

const StoreIdSchema = z.coerce.number().int().positive()
const SessionIdSchema = z.string().uuid()
const ExperienceSchema = z.enum(['look', 'visagismo', 'campo_visual', 'medidas', 'thickness'])

const CreateTowerSessionSchema = z.object({
  storeId: StoreIdSchema,
  experience: ExperienceSchema.optional(),
})

const GetOrCreateTowerSessionSchema = z.object({
  storeId: StoreIdSchema,
  experience: ExperienceSchema,
  sessionId: SessionIdSchema.optional(),
})

const SessionCommandSchema = z.object({
  storeId: StoreIdSchema,
  sessionId: SessionIdSchema,
})

const LinkCustomerSchema = SessionCommandSchema.extend({
  customerId: z.coerce.number().int().positive(),
})

const LinkEvaluationSchema = SessionCommandSchema.extend({
  evaluationId: z.coerce.number().int().positive(),
})

const SearchTowerCustomersSchema = z.object({
  storeId: StoreIdSchema,
  query: z.string().trim().min(1).max(160),
})

const PrescriptionSnapshotSchema = z.object({
  od: z.object({ sphere: z.number().min(-30).max(30), cylinder: z.number().min(-15).max(15), axis: z.number().min(0).max(180) }),
  oe: z.object({ sphere: z.number().min(-30).max(30), cylinder: z.number().min(-15).max(15), axis: z.number().min(0).max(180) }),
  addition: z.number().min(0).max(8),
})

const SavePrescriptionSchema = SessionCommandSchema.extend({
  customerId: z.coerce.number().int().positive(),
  prescription: PrescriptionSnapshotSchema,
})

export type TowerSession = Database['public']['Tables']['tower_sessions']['Row']
export type TowerSessionSummary = TowerSession & {
  customer: { id: number; full_name: string; fone_movel: string | null } | null
}
export type TowerPrescriptionSnapshot = z.infer<typeof PrescriptionSnapshotSchema>
export type TowerSessionContext = { session: TowerSession; customer: { id: number; full_name: string; fone_movel: string | null } | null }
type ActionResult<T = undefined> = { success: boolean; message: string; data?: T }

export type TowerCustomerSearchResult = {
  id: number
  full_name: string
  fone_movel: string | null
}

async function findSessionForStore(sessionId: string, storeId: number) {
  const sessions = createAdminClient().from('tower_sessions') as any
  const { data, error } = await sessions
    .select('*')
    .eq('id', sessionId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) return { session: null, message: error.message }
  if (!data) return { session: null, message: 'Sessao da Torre nao encontrada para esta loja.' }
  return { session: data as TowerSession, message: null }
}

async function syncHeatmapSessionAssociation(
  sessionId: string,
  storeId: number,
  association: { customer_id?: number; optical_evaluation_id?: number },
) {
  const heatmapSessions = createAdminClient().from('tower_heatmap_sessions') as any
  const { error } = await heatmapSessions
    .update(association)
    .eq('tower_session_id', sessionId)
    .eq('store_id', storeId)

  return error as { message: string } | null
}

/** Busca operacional de clientes: não depende da sessão comercial do sistema completo. */
export async function searchTowerCustomers(
  input: z.input<typeof SearchTowerCustomersSchema>,
): Promise<ActionResult<TowerCustomerSearchResult[]>> {
  const parsed = SearchTowerCustomersSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Informe um nome ou CPF para buscar.' }

  const auth = await authorizeTowerStoreAccess(parsed.data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const term = parsed.data.query.replace(/[%_,]/g, '').trim()
  if (!term) return { success: false, message: 'Informe um nome ou CPF para buscar.' }

  const customers = createAdminClient().from('customers') as any
  const { data, error } = await customers
    .select('id,full_name,fone_movel,cpf')
    .eq('store_id', parsed.data.storeId)
    .or(`full_name.ilike.%${term}%,cpf.ilike.%${term}%`)
    .order('full_name')
    .limit(30)

  if (error) return { success: false, message: error.message }
  return { success: true, message: 'Clientes encontrados.', data: (data ?? []) as TowerCustomerSearchResult[] }
}

export async function createTowerSession(
  input: z.input<typeof CreateTowerSessionSchema>,
): Promise<ActionResult<TowerSession>> {
  const parsed = CreateTowerSessionSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Dados da sessao invalidos.' }

  const auth = await authorizeTowerStoreAccess(parsed.data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const sessions = createAdminClient().from('tower_sessions') as any
  const { data, error } = await sessions
    .insert({
      tenant_id: auth.tenantId,
      store_id: parsed.data.storeId,
      created_by_user_id: auth.userId,
      current_experience: parsed.data.experience ?? null,
      status: 'active',
    })
    .select('*')
    .single()

  if (error || !data) return { success: false, message: error?.message || 'Nao foi possivel criar a sessao da Torre.' }
  return { success: true, message: 'Sessao da Torre criada.', data: data as TowerSession }
}

export async function getOrCreateTowerSession(
  input: z.input<typeof GetOrCreateTowerSessionSchema>,
): Promise<ActionResult<TowerSession>> {
  const parsed = GetOrCreateTowerSessionSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Dados da sessao invalidos.' }

  const auth = await authorizeTowerStoreAccess(parsed.data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const sessions = createAdminClient().from('tower_sessions') as any
  if (parsed.data.sessionId) {
    const found = await findSessionForStore(parsed.data.sessionId, parsed.data.storeId)
    if (!found.session || found.session.status !== 'active') return { success: false, message: found.message || 'Sessao da Torre nao esta ativa.' }
    const { data, error } = await sessions
      .update({ current_experience: parsed.data.experience })
      .eq('id', found.session.id)
      .eq('store_id', parsed.data.storeId)
      .select('*')
      .single()
    if (error || !data) return { success: false, message: error?.message || 'Nao foi possivel atualizar a sessao da Torre.' }
    return { success: true, message: 'Sessao da Torre retomada.', data: data as TowerSession }
  }

  const { data, error } = await sessions
    .insert({
      tenant_id: auth.tenantId,
      store_id: parsed.data.storeId,
      created_by_user_id: auth.userId,
      current_experience: parsed.data.experience,
      status: 'active',
    })
    .select('*')
    .single()
  if (error || !data) return { success: false, message: error?.message || 'Nao foi possivel criar a sessao da Torre.' }
  return { success: true, message: 'Sessao da Torre criada.', data: data as TowerSession }
}

export async function getTowerSessionContext(
  input: z.input<typeof SessionCommandSchema>,
): Promise<ActionResult<TowerSessionContext>> {
  const parsed = SessionCommandSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Sessao da Torre invalida.' }
  const auth = await authorizeTowerStoreAccess(parsed.data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }
  const found = await findSessionForStore(parsed.data.sessionId, parsed.data.storeId)
  if (!found.session) return { success: false, message: found.message || 'Sessao nao encontrada.' }

  let customer: TowerSessionContext['customer'] = null
  if (found.session.customer_id) {
    const customers = createAdminClient().from('customers') as any
    const { data } = await customers
      .select('id, full_name, fone_movel')
      .eq('id', found.session.customer_id)
      .eq('store_id', parsed.data.storeId)
      .maybeSingle()
    customer = data ?? null
  }
  return { success: true, message: 'Contexto da sessao carregado.', data: { session: found.session, customer } }
}

export async function saveTowerSessionPrescription(
  input: z.input<typeof SavePrescriptionSchema>,
): Promise<ActionResult<TowerSession>> {
  const parsed = SavePrescriptionSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Receita da demonstracao invalida.' }
  const auth = await authorizeTowerStoreAccess(parsed.data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }
  const found = await findSessionForStore(parsed.data.sessionId, parsed.data.storeId)
  if (!found.session || found.session.status !== 'active') return { success: false, message: found.message || 'Sessao da Torre nao esta ativa.' }

  const customers = createAdminClient().from('customers') as any
  const { data: customer, error: customerError } = await customers
    .select('id')
    .eq('id', parsed.data.customerId)
    .eq('store_id', parsed.data.storeId)
    .maybeSingle()
  if (customerError || !customer) return { success: false, message: customerError?.message || 'Cliente nao encontrado para esta loja.' }

  const sessions = createAdminClient().from('tower_sessions') as any
  const { data, error } = await sessions
    .update({ customer_id: customer.id, prescription_snapshot: parsed.data.prescription, current_experience: 'thickness' })
    .eq('id', found.session.id)
    .eq('store_id', parsed.data.storeId)
    .select('*')
    .single()
  if (error || !data) return { success: false, message: error?.message || 'Nao foi possivel salvar a receita na sessao.' }

  const heatmapError = await syncHeatmapSessionAssociation(found.session.id, parsed.data.storeId, { customer_id: customer.id })
  if (heatmapError) return { success: false, message: `Receita salva, mas o Campo Visual nao foi atualizado: ${heatmapError.message}` }
  return { success: true, message: 'Receita real salva na sessao da Torre.', data: data as TowerSession }
}

export async function linkCustomerToTowerSession(
  input: z.input<typeof LinkCustomerSchema>,
): Promise<ActionResult<TowerSession>> {
  const parsed = LinkCustomerSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Vinculo de cliente invalido.' }

  const auth = await authorizeTowerStoreAccess(parsed.data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const found = await findSessionForStore(parsed.data.sessionId, parsed.data.storeId)
  if (!found.session) return { success: false, message: found.message || 'Sessao nao encontrada.' }

  const customers = createAdminClient().from('customers') as any
  const { data: customer, error: customerError } = await customers
    .select('id, store_id')
    .eq('id', parsed.data.customerId)
    .eq('store_id', parsed.data.storeId)
    .maybeSingle()

  if (customerError || !customer) return { success: false, message: customerError?.message || 'Cliente nao encontrado para esta loja.' }

  const sessions = createAdminClient().from('tower_sessions') as any
  const { data, error } = await sessions
    .update({ customer_id: customer.id })
    .eq('id', found.session.id)
    .eq('store_id', parsed.data.storeId)
    .select('*')
    .single()

  if (error || !data) return { success: false, message: error?.message || 'Nao foi possivel vincular o cliente.' }

  const heatmapError = await syncHeatmapSessionAssociation(found.session.id, parsed.data.storeId, {
    customer_id: customer.id,
  })
  if (heatmapError) {
    return { success: false, message: `Cliente vinculado a sessao, mas nao ao resultado do Campo Visual: ${heatmapError.message}` }
  }

  return { success: true, message: 'Cliente vinculado a sessao da Torre.', data: data as TowerSession }
}

export async function linkEvaluationToTowerSession(
  input: z.input<typeof LinkEvaluationSchema>,
): Promise<ActionResult<TowerSession>> {
  const parsed = LinkEvaluationSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Vinculo de avaliacao invalido.' }

  const auth = await authorizeTowerStoreAccess(parsed.data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const found = await findSessionForStore(parsed.data.sessionId, parsed.data.storeId)
  if (!found.session) return { success: false, message: found.message || 'Sessao nao encontrada.' }

  const evaluations = createAdminClient().from('optical_evaluations') as any
  const { data: evaluation, error: evaluationError } = await evaluations
    .select('id, tenant_id, store_id, evaluated_customer_id, receita_longe_od_esferico, receita_longe_od_cilindrico, receita_longe_od_eixo, receita_longe_oe_esferico, receita_longe_oe_cilindrico, receita_longe_oe_eixo, receita_adicao')
    .eq('id', parsed.data.evaluationId)
    .eq('store_id', parsed.data.storeId)
    .maybeSingle()

  if (evaluationError || !evaluation) return { success: false, message: evaluationError?.message || 'Avaliacao nao encontrada para esta loja.' }
  if (evaluation.tenant_id !== auth.tenantId || !evaluation.evaluated_customer_id) {
    return { success: false, message: 'Avaliacao sem cliente direto valido para a Torre.' }
  }
  if (found.session.customer_id && found.session.customer_id !== evaluation.evaluated_customer_id) {
    return { success: false, message: 'O cliente da sessao nao corresponde ao cliente da avaliacao.' }
  }

  const sessions = createAdminClient().from('tower_sessions') as any
  const parsePrescriptionNumber = (value: string | null) => {
    const parsed = Number.parseFloat((value ?? '').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
  }
  const evaluationPrescription: TowerPrescriptionSnapshot = {
    od: {
      sphere: parsePrescriptionNumber(evaluation.receita_longe_od_esferico),
      cylinder: parsePrescriptionNumber(evaluation.receita_longe_od_cilindrico),
      axis: Math.max(0, Math.min(180, Math.round(parsePrescriptionNumber(evaluation.receita_longe_od_eixo)))),
    },
    oe: {
      sphere: parsePrescriptionNumber(evaluation.receita_longe_oe_esferico),
      cylinder: parsePrescriptionNumber(evaluation.receita_longe_oe_cilindrico),
      axis: Math.max(0, Math.min(180, Math.round(parsePrescriptionNumber(evaluation.receita_longe_oe_eixo)))),
    },
    addition: Math.max(0, Math.min(8, parsePrescriptionNumber(evaluation.receita_adicao))),
  }
  const { data, error } = await sessions
    .update({
      optical_evaluation_id: evaluation.id,
      customer_id: evaluation.evaluated_customer_id,
      prescription_snapshot: evaluationPrescription,
    })
    .eq('id', found.session.id)
    .eq('store_id', parsed.data.storeId)
    .select('*')
    .single()

  if (error || !data) return { success: false, message: error?.message || 'Nao foi possivel vincular a avaliacao.' }

  const heatmapError = await syncHeatmapSessionAssociation(found.session.id, parsed.data.storeId, {
    customer_id: evaluation.evaluated_customer_id,
    optical_evaluation_id: evaluation.id,
  })
  if (heatmapError) {
    return { success: false, message: `Avaliacao vinculada a sessao, mas nao ao resultado do Campo Visual: ${heatmapError.message}` }
  }

  return { success: true, message: 'Avaliacao vinculada a sessao da Torre.', data: data as TowerSession }
}

export async function completeTowerSession(
  input: z.input<typeof SessionCommandSchema>,
): Promise<ActionResult> {
  return closeTowerSession(input, 'completed')
}

export async function discardTowerSession(
  input: z.input<typeof SessionCommandSchema>,
): Promise<ActionResult> {
  return closeTowerSession(input, 'discarded')
}

async function closeTowerSession(
  input: z.input<typeof SessionCommandSchema>,
  status: 'completed' | 'discarded',
): Promise<ActionResult> {
  const parsed = SessionCommandSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Sessao da Torre invalida.' }

  const auth = await authorizeTowerStoreAccess(parsed.data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const found = await findSessionForStore(parsed.data.sessionId, parsed.data.storeId)
  if (!found.session) return { success: false, message: found.message || 'Sessao nao encontrada.' }
  if (found.session.status === status) return { success: true, message: 'Sessao ja estava encerrada.' }
  if (found.session.status !== 'active') return { success: false, message: 'Esta sessao nao pode mais ser alterada.' }

  const now = new Date().toISOString()
  const sessions = createAdminClient().from('tower_sessions') as any
  const { error } = await sessions
    .update({
      status,
      completed_at: status === 'completed' ? now : null,
      discarded_at: status === 'discarded' ? now : null,
    })
    .eq('id', found.session.id)
    .eq('store_id', parsed.data.storeId)

  if (error) return { success: false, message: error.message }
  return { success: true, message: status === 'completed' ? 'Sessao concluida.' : 'Sessao descartada.' }
}

export async function getActiveTowerSessions(
  storeIdInput: z.input<typeof StoreIdSchema>,
): Promise<ActionResult<TowerSessionSummary[]>> {
  const parsed = StoreIdSchema.safeParse(storeIdInput)
  if (!parsed.success) return { success: false, message: 'Loja invalida.' }

  const auth = await authorizeTowerStoreAccess(parsed.data)
  if (!auth.ok) return { success: false, message: auth.message }

  const sessions = createAdminClient().from('tower_sessions') as any
  const { data, error } = await sessions
    .select('*, customer:customers(id, full_name, fone_movel)')
    .eq('store_id', parsed.data)
    .eq('status', 'active')
    .order('started_at', { ascending: false })

  if (error) return { success: false, message: error.message }
  return { success: true, message: 'Sessoes ativas carregadas.', data: (data ?? []) as TowerSessionSummary[] }
}
