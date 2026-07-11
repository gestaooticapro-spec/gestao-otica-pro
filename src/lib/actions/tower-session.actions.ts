'use server'

import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/database.types'

const StoreIdSchema = z.coerce.number().int().positive()
const SessionIdSchema = z.string().uuid()
const ExperienceSchema = z.enum(['look', 'visagismo', 'campo_visual', 'medidas'])

const CreateTowerSessionSchema = z.object({
  storeId: StoreIdSchema,
  experience: ExperienceSchema.optional(),
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

export type TowerSession = Database['public']['Tables']['tower_sessions']['Row']
type ActionResult<T = undefined> = { success: boolean; message: string; data?: T }

async function getAuthorizedStoreContext(storeId: number) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false as const, message: 'Usuario nao autenticado.' }

  const profile = (await getProfileByAdmin(user.id)) as Database['public']['Tables']['profiles']['Row'] | null
  if (!profile?.tenant_id) return { ok: false as const, message: 'Perfil do usuario sem tenant.' }
  if (profile.role !== 'admin' && profile.store_id !== storeId) {
    return { ok: false as const, message: 'Acesso negado para esta loja.' }
  }

  return { ok: true as const, tenantId: profile.tenant_id, userId: user.id }
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

export async function createTowerSession(
  input: z.input<typeof CreateTowerSessionSchema>,
): Promise<ActionResult<TowerSession>> {
  const parsed = CreateTowerSessionSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Dados da sessao invalidos.' }

  const auth = await getAuthorizedStoreContext(parsed.data.storeId)
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

export async function linkCustomerToTowerSession(
  input: z.input<typeof LinkCustomerSchema>,
): Promise<ActionResult<TowerSession>> {
  const parsed = LinkCustomerSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Vinculo de cliente invalido.' }

  const auth = await getAuthorizedStoreContext(parsed.data.storeId)
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
  return { success: true, message: 'Cliente vinculado a sessao da Torre.', data: data as TowerSession }
}

export async function linkEvaluationToTowerSession(
  input: z.input<typeof LinkEvaluationSchema>,
): Promise<ActionResult<TowerSession>> {
  const parsed = LinkEvaluationSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Vinculo de avaliacao invalido.' }

  const auth = await getAuthorizedStoreContext(parsed.data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const found = await findSessionForStore(parsed.data.sessionId, parsed.data.storeId)
  if (!found.session) return { success: false, message: found.message || 'Sessao nao encontrada.' }

  const evaluations = createAdminClient().from('optical_evaluations') as any
  const { data: evaluation, error: evaluationError } = await evaluations
    .select('id, tenant_id, store_id, evaluated_customer_id')
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
  const { data, error } = await sessions
    .update({
      optical_evaluation_id: evaluation.id,
      customer_id: evaluation.evaluated_customer_id,
    })
    .eq('id', found.session.id)
    .eq('store_id', parsed.data.storeId)
    .select('*')
    .single()

  if (error || !data) return { success: false, message: error?.message || 'Nao foi possivel vincular a avaliacao.' }
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

  const auth = await getAuthorizedStoreContext(parsed.data.storeId)
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
): Promise<ActionResult<TowerSession[]>> {
  const parsed = StoreIdSchema.safeParse(storeIdInput)
  if (!parsed.success) return { success: false, message: 'Loja invalida.' }

  const auth = await getAuthorizedStoreContext(parsed.data)
  if (!auth.ok) return { success: false, message: auth.message }

  const sessions = createAdminClient().from('tower_sessions') as any
  const { data, error } = await sessions
    .select('*')
    .eq('store_id', parsed.data)
    .eq('status', 'active')
    .order('started_at', { ascending: false })

  if (error) return { success: false, message: error.message }
  return { success: true, message: 'Sessoes ativas carregadas.', data: (data ?? []) as TowerSession[] }
}
