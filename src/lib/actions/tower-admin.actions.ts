'use server'

import { createHash, randomBytes, randomInt } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePlatformAdmin } from '@/lib/auth/platform-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashTowerAdminPin } from '@/lib/tower-admin-pin'

export type TowerTenantOption = {
  id: string
  name: string
}

export type TowerActivationStatus = 'pending' | 'consumed' | 'revoked' | 'expired'

export type TowerActivationSummary = {
  id: string
  tenantId: string
  tenantName: string
  storeId: number
  storeName: string
  status: TowerActivationStatus
  expiresAt: string
  createdAt: string
  consumedAt: string | null
  revokedAt: string | null
}

export type TowerAdminDashboardData = {
  tenants: TowerTenantOption[]
  activations: TowerActivationSummary[]
}

export type TowerStoreSummary = {
  id: number
  tenantId: string
  tenantName: string
  name: string
  city: string | null
  state: string | null
  isActive: boolean
  createdAt: string
  latestActivation: TowerActivationSummary | null
}

export type TowerDirectoryData = {
  stores: TowerStoreSummary[]
}

export type TowerStoreAdminData = {
  store: TowerStoreSummary & {
    address: string | null
    phone: string | null
  }
  activations: TowerActivationSummary[]
  fullAccess: TowerStoreFullAccessSummary | null
}

export type TowerStoreFullAccessSummary = {
  adminName: string
  adminEmail: string
  status: 'pending' | 'active'
  grantedAt: string
  invitationSentAt: string | null
}

export type CreateTowerOnboardingInput = {
  tenantMode: 'existing' | 'new'
  existingTenantId: string
  newTenantName: string
  storeName: string
  city: string
  state: string
  address: string
  phone: string
  validForHours: number
}

export type TowerActivationCredential = {
  activationId: string
  tenantId: string
  tenantName: string
  storeId: number
  storeName: string
  qrPayload: string
  fallbackCode: string
  adminPin: string
  expiresAt: string
}

export type TowerAdminActionResult = {
  success: boolean
  message: string
  activation?: TowerActivationCredential
}

type TenantRow = { id: string; name: string }
type StoreNameRow = { id: number; name: string }
type TowerStoreRow = {
  id: number
  tenant_id: string
  name: string
  city: string | null
  state: string | null
  address: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  settings: ({ tower_enabled?: unknown } & Record<string, unknown>) | null
}
type ActivationRow = {
  id: string
  tenant_id: string
  store_id: number
  status: 'pending' | 'consumed' | 'revoked'
  expires_at: string
  created_at: string
  consumed_at: string | null
  revoked_at: string | null
}

type TowerStoreFullAccessRow = {
  store_id: number
  admin_user_id: string | null
  admin_name: string
  admin_email: string
  status: 'pending' | 'active'
  granted_by: string | null
  granted_at: string
  invitation_sent_at: string | null
  updated_at: string
}

type TowerOnboardingRpcArgs = {
  p_existing_tenant_id: string | null
  p_new_tenant_name: string | null
  p_store_name: string
  p_store_city: string | null
  p_store_state: string | null
  p_store_address: string | null
  p_store_phone: string | null
  p_store_settings: typeof TOWER_DEFAULT_SETTINGS
  p_token_hash: string
  p_fallback_code_hash: string
  p_admin_pin_hash: string
  p_expires_at: string
  p_created_by: string
}

type TowerReissueRpcArgs = {
  p_store_id: number
  p_token_hash: string
  p_fallback_code_hash: string
  p_admin_pin_hash: string
  p_expires_at: string
  p_created_by: string
}

type TowerOnboardingRpcRow = {
  tenant_id: string
  store_id: number
  activation_id: string
}

type TowerOnboardingRpcClient = {
  rpc: (
    functionName: 'create_tower_store_onboarding',
    args: TowerOnboardingRpcArgs,
  ) => PromiseLike<{ data: TowerOnboardingRpcRow[] | null; error: unknown }>
}

type TowerReissueRpcClient = {
  rpc: (
    functionName: 'reissue_tower_store_activation',
    args: TowerReissueRpcArgs,
  ) => PromiseLike<{ data: TowerOnboardingRpcRow[] | null; error: unknown }>
}

const onboardingSchema = z.object({
  tenantMode: z.enum(['existing', 'new']),
  existingTenantId: z.string().trim(),
  newTenantName: z.string().trim().max(120),
  storeName: z.string().trim().min(2, 'Informe o nome da loja.').max(120),
  city: z.string().trim().max(100),
  state: z.string().trim().toUpperCase().refine(
    (value) => value.length === 0 || value.length === 2,
    'Informe a UF com duas letras.',
  ),
  address: z.string().trim().max(240),
  phone: z.string().trim().max(40),
  validForHours: z.number().refine(
    (value) => [24, 168, 720].includes(value),
    'Prazo de ativacao invalido.',
  ),
}).superRefine((value, context) => {
  if (value.tenantMode === 'existing' && !z.string().uuid().safeParse(value.existingTenantId).success) {
    context.addIssue({ code: 'custom', path: ['existingTenantId'], message: 'Selecione uma empresa.' })
  }

  if (value.tenantMode === 'new' && value.newTenantName.length < 2) {
    context.addIssue({ code: 'custom', path: ['newTenantName'], message: 'Informe o nome da empresa.' })
  }
})

const TOWER_DEFAULT_SETTINGS = {
  tower_enabled: true,
  tower_experiences: {
    visagismo: true,
    campo_visual: true,
    medidas: true,
    informacoes_uteis: true,
  },
  pre_sale_analysis_enabled: true,
  module_global_tables_enabled: true,
}

const asDbWrite = <T,>(value: T) => value as never

function actionError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim()
    if (message) return message
  }
  return fallback
}

function hashCredential(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function createFallbackCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  const segment = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('')
  return `${segment()}-${segment()}`
}

function createTemporaryAdminPin() {
  return Array.from({ length: 6 }, () => randomInt(10)).join('')
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase('pt-BR')
}

function resolveActivationStatus(row: ActivationRow): TowerActivationStatus {
  if (row.status === 'pending' && new Date(row.expires_at).getTime() <= Date.now()) return 'expired'
  return row.status
}

function toActivationSummary(
  row: ActivationRow,
  tenantNames: Map<string, string>,
  storeNames: Map<number, string>,
): TowerActivationSummary {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: tenantNames.get(row.tenant_id) || 'Rede não encontrada',
    storeId: row.store_id,
    storeName: storeNames.get(row.store_id) || `Loja #${row.store_id}`,
    status: resolveActivationStatus(row),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    consumedAt: row.consumed_at,
    revokedAt: row.revoked_at,
  }
}

export async function getTowerAdminDashboardData(): Promise<TowerAdminDashboardData> {
  await requirePlatformAdmin()
  const admin = createAdminClient()

  const [{ data: tenantRows, error: tenantError }, { data: activationRows, error: activationError }] = await Promise.all([
    admin.from('tenants').select('id,name').order('name'),
    admin.from('tower_device_activations')
      .select('id,tenant_id,store_id,status,expires_at,created_at,consumed_at,revoked_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (tenantError) throw new Error(actionError(tenantError, 'Nao foi possivel carregar as empresas.'))
  if (activationError) {
    throw new Error('Aplique a migracao de onboarding da Torre antes de abrir esta pagina.')
  }

  const tenants = (tenantRows || []) as TenantRow[]
  const activations = (activationRows || []) as ActivationRow[]
  const storeIds = [...new Set(activations.map((row) => row.store_id))]

  let stores: StoreNameRow[] = []
  if (storeIds.length) {
    const { data: storeRows, error: storeError } = await admin
      .from('stores')
      .select('id,name')
      .in('id', storeIds)

    if (storeError) throw new Error(actionError(storeError, 'Nao foi possivel carregar as lojas.'))
    stores = (storeRows || []) as StoreNameRow[]
  }

  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]))
  const storeNames = new Map(stores.map((store) => [store.id, store.name]))

  return {
    tenants,
    activations: activations.map((row) => toActivationSummary(row, tenantNames, storeNames)),
  }
}

export async function getTowerDirectoryData(): Promise<TowerDirectoryData> {
  await requirePlatformAdmin()
  const admin = createAdminClient()

  const [{ data: tenantRows, error: tenantError }, { data: storeRows, error: storeError }, { data: activationRows, error: activationError }] = await Promise.all([
    admin.from('tenants').select('id,name'),
    admin.from('stores').select('id,tenant_id,name,city,state,address,phone,is_active,created_at,settings').order('created_at', { ascending: false }),
    admin.from('tower_device_activations')
      .select('id,tenant_id,store_id,status,expires_at,created_at,consumed_at,revoked_at')
      .order('created_at', { ascending: false }),
  ])

  if (tenantError) throw new Error(actionError(tenantError, 'Não foi possível carregar as redes.'))
  if (storeError || activationError) throw new Error('Aplique as migrações de onboarding da Torre antes de abrir esta página.')

  const tenants = (tenantRows || []) as TenantRow[]
  const towers = ((storeRows || []) as TowerStoreRow[])
    .filter((store) => store.settings?.tower_enabled === true)
  const towerStoreIds = new Set(towers.map((store) => store.id))
  const activations = ((activationRows || []) as ActivationRow[])
    .filter((activation) => towerStoreIds.has(activation.store_id))
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]))
  const storeNames = new Map(towers.map((store) => [store.id, store.name]))
  const latestActivations = new Map<number, TowerActivationSummary>()

  for (const activation of activations) {
    if (!latestActivations.has(activation.store_id)) {
      latestActivations.set(activation.store_id, toActivationSummary(activation, tenantNames, storeNames))
    }
  }

  return {
    stores: towers.map((store) => ({
      id: store.id,
      tenantId: store.tenant_id,
      tenantName: tenantNames.get(store.tenant_id) || 'Rede não encontrada',
      name: store.name,
      city: store.city,
      state: store.state,
      isActive: store.is_active,
      createdAt: store.created_at,
      latestActivation: latestActivations.get(store.id) || null,
    })),
  }
}

export async function getTowerStoreAdminData(storeId: number): Promise<TowerStoreAdminData | null> {
  await requirePlatformAdmin()
  const parsedStoreId = z.number().int().positive().safeParse(storeId)
  if (!parsedStoreId.success) return null

  const admin = createAdminClient()
  const { data: rawStore, error: storeError } = await admin
    .from('stores')
    .select('id,tenant_id,name,city,state,address,phone,is_active,created_at,settings')
    .eq('id', parsedStoreId.data)
    .maybeSingle()

  if (storeError) throw new Error(actionError(storeError, 'Não foi possível carregar a loja.'))
  const store = rawStore as TowerStoreRow | null
  if (!store || store.settings?.tower_enabled !== true) return null

  const [{ data: tenantRow, error: tenantError }, { data: activationRows, error: activationError }, { data: fullAccessRow, error: fullAccessError }] = await Promise.all([
    admin.from('tenants').select('id,name').eq('id', store.tenant_id).maybeSingle(),
    admin.from('tower_device_activations')
      .select('id,tenant_id,store_id,status,expires_at,created_at,consumed_at,revoked_at')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(20),
    admin.from('tower_store_full_access')
      .select('store_id,admin_user_id,admin_name,admin_email,status,granted_by,granted_at,invitation_sent_at,updated_at')
      .eq('store_id', store.id)
      .maybeSingle(),
  ])

  if (tenantError || activationError) throw new Error('Não foi possível carregar o histórico da Torre.')

  if (fullAccessError) throw new Error('Aplique a migracao de liberacao da Gestao Otica antes de abrir esta pagina.')

  const tenant = tenantRow as TenantRow | null
  const tenantNames = new Map([[store.tenant_id, tenant?.name || 'Rede não encontrada']])
  const storeNames = new Map([[store.id, store.name]])
  const activations = (activationRows || []) as ActivationRow[]
  const summaries = activations.map((activation) => toActivationSummary(activation, tenantNames, storeNames))

  return {
    store: {
      id: store.id,
      tenantId: store.tenant_id,
      tenantName: tenant?.name || 'Rede não encontrada',
      name: store.name,
      city: store.city,
      state: store.state,
      address: store.address,
      phone: store.phone,
      isActive: store.is_active,
      createdAt: store.created_at,
      latestActivation: summaries[0] || null,
    },
    activations: summaries,
    fullAccess: fullAccessRow ? {
      adminName: (fullAccessRow as TowerStoreFullAccessRow).admin_name,
      adminEmail: (fullAccessRow as TowerStoreFullAccessRow).admin_email,
      status: (fullAccessRow as TowerStoreFullAccessRow).status,
      grantedAt: (fullAccessRow as TowerStoreFullAccessRow).granted_at,
      invitationSentAt: (fullAccessRow as TowerStoreFullAccessRow).invitation_sent_at,
    } : null,
  }
}

export async function createTowerOnboarding(
  input: CreateTowerOnboardingInput,
): Promise<TowerAdminActionResult> {
  const context = await requirePlatformAdmin()
  const parsed = onboardingSchema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message || 'Revise os dados informados.',
    }
  }

  const data = parsed.data
  const admin = createAdminClient()

  if (data.tenantMode === 'new') {
    const { data: tenantRows, error: tenantError } = await admin.from('tenants').select('id,name')
    if (tenantError) return { success: false, message: actionError(tenantError, 'Não foi possível validar a rede.') }
    if (((tenantRows || []) as TenantRow[]).some((tenant) => normalizeName(tenant.name) === normalizeName(data.newTenantName))) {
      return { success: false, message: 'Esta rede já existe. Selecione-a na opção de rede existente.' }
    }
  }

  if (data.tenantMode === 'existing') {
    const { data: storeRows, error: storeError } = await admin
      .from('stores')
      .select('id,name')
      .eq('tenant_id', data.existingTenantId)

    if (storeError) return { success: false, message: actionError(storeError, 'Não foi possível validar a loja.') }
    if (((storeRows || []) as StoreNameRow[]).some((store) => normalizeName(store.name) === normalizeName(data.storeName))) {
      return { success: false, message: 'Já existe uma loja com este nome nesta rede. Abra a loja existente para alterar ou reemitir a instalação.' }
    }
  }

  const rawToken = randomBytes(32).toString('base64url')
  const fallbackCode = createFallbackCode()
  const adminPin = createTemporaryAdminPin()
  const expiresAt = new Date(Date.now() + data.validForHours * 60 * 60 * 1000).toISOString()

  const towerRpc = admin as unknown as TowerOnboardingRpcClient
  const { data: rpcRows, error } = await towerRpc.rpc('create_tower_store_onboarding', {
    p_existing_tenant_id: data.tenantMode === 'existing' ? data.existingTenantId : null,
    p_new_tenant_name: data.tenantMode === 'new' ? data.newTenantName : null,
    p_store_name: data.storeName,
    p_store_city: data.city || null,
    p_store_state: data.state || null,
    p_store_address: data.address || null,
    p_store_phone: data.phone || null,
    p_store_settings: TOWER_DEFAULT_SETTINGS,
    p_token_hash: hashCredential(rawToken),
    p_fallback_code_hash: hashCredential(fallbackCode),
    p_admin_pin_hash: hashTowerAdminPin(adminPin),
    p_expires_at: expiresAt,
    p_created_by: context.user.id,
  })

  if (error || !rpcRows?.[0]) {
    return {
      success: false,
      message: actionError(error, 'Nao foi possivel criar a empresa, a loja e a ativacao.'),
    }
  }

  const created = rpcRows[0]
  let tenantName = data.newTenantName
  if (data.tenantMode === 'existing') {
    const { data: rawTenant } = await admin
      .from('tenants')
      .select('name')
      .eq('id', created.tenant_id)
      .single()
    tenantName = (rawTenant as { name?: string } | null)?.name || 'Empresa'
  }

  revalidatePath('/admin/torres')

  return {
    success: true,
    message: 'Empresa, loja e ativacao criadas com sucesso.',
    activation: {
      activationId: created.activation_id,
      tenantId: created.tenant_id,
      tenantName,
      storeId: created.store_id,
      storeName: data.storeName,
      qrPayload: `MBTOWER:1:${rawToken}`,
      fallbackCode,
      adminPin,
      expiresAt,
    },
  }
}

const towerStoreUpdateSchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().trim().min(2, 'Informe o nome da loja.').max(120),
  city: z.string().trim().max(100),
  state: z.string().trim().toUpperCase().refine(
    (value) => value.length === 0 || value.length === 2,
    'Informe a UF com duas letras.',
  ),
  address: z.string().trim().max(240),
  phone: z.string().trim().max(40),
})

export async function updateTowerStoreDetails(input: z.infer<typeof towerStoreUpdateSchema>): Promise<TowerAdminActionResult> {
  await requirePlatformAdmin()
  const parsed = towerStoreUpdateSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message || 'Revise os dados da loja.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('stores')
    .update(asDbWrite({
      name: parsed.data.name,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      address: parsed.data.address || null,
      phone: parsed.data.phone || null,
    }))
    .eq('id', parsed.data.storeId)
    .select('id,settings')
    .maybeSingle()

  if (error) return { success: false, message: actionError(error, 'Não foi possível salvar os dados da loja.') }
  if (!(data as { settings?: { tower_enabled?: unknown } } | null)?.settings?.tower_enabled) {
    return { success: false, message: 'Loja com Torre não encontrada.' }
  }

  revalidatePath('/admin/torres')
  revalidatePath(`/admin/torres/${parsed.data.storeId}`)
  return { success: true, message: 'Dados da loja atualizados.' }
}

const towerReissueSchema = z.object({
  storeId: z.number().int().positive(),
  validForHours: z.number().refine(
    (value) => [24, 168, 720].includes(value),
    'Prazo de ativação inválido.',
  ),
})

export async function reissueTowerActivation(input: z.infer<typeof towerReissueSchema>): Promise<TowerAdminActionResult> {
  const context = await requirePlatformAdmin()
  const parsed = towerReissueSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message || 'Dados de reemissão inválidos.' }

  const admin = createAdminClient()
  const { data: rawStore, error: storeError } = await admin
    .from('stores')
    .select('id,tenant_id,name,settings')
    .eq('id', parsed.data.storeId)
    .maybeSingle()

  const store = rawStore as { id: number; tenant_id: string; name: string; settings: { tower_enabled?: unknown } | null } | null
  if (storeError) return { success: false, message: actionError(storeError, 'Não foi possível carregar a loja.') }
  if (!store?.settings?.tower_enabled) return { success: false, message: 'Loja com Torre não encontrada.' }

  const rawToken = randomBytes(32).toString('base64url')
  const fallbackCode = createFallbackCode()
  const adminPin = createTemporaryAdminPin()
  const expiresAt = new Date(Date.now() + parsed.data.validForHours * 60 * 60 * 1000).toISOString()
  const reissueRpc = admin as unknown as TowerReissueRpcClient
  const { data: rpcRows, error } = await reissueRpc.rpc('reissue_tower_store_activation', {
    p_store_id: store.id,
    p_token_hash: hashCredential(rawToken),
    p_fallback_code_hash: hashCredential(fallbackCode),
    p_admin_pin_hash: hashTowerAdminPin(adminPin),
    p_expires_at: expiresAt,
    p_created_by: context.user.id,
  })

  if (error || !rpcRows?.[0]) {
    return { success: false, message: actionError(error, 'Não foi possível reemitir a ativação da Torre.') }
  }

  revalidatePath('/admin/torres')
  revalidatePath(`/admin/torres/${store.id}`)

  return {
    success: true,
    message: 'Nova ativação e novo PIN provisório foram gerados. As ativações pendentes anteriores foram revogadas.',
    activation: {
      activationId: rpcRows[0].activation_id,
      tenantId: store.tenant_id,
      tenantName: '',
      storeId: store.id,
      storeName: store.name,
      qrPayload: `MBTOWER:1:${rawToken}`,
      fallbackCode,
      adminPin,
      expiresAt,
    },
  }
}

export async function revokeTowerActivation(activationId: string): Promise<TowerAdminActionResult> {
  await requirePlatformAdmin()
  const parsedId = z.string().uuid().safeParse(activationId)
  if (!parsedId.success) return { success: false, message: 'Ativacao invalida.' }

  const admin = createAdminClient()
  const { data, error } = await admin.from('tower_device_activations')
    .update(asDbWrite({ status: 'revoked', revoked_at: new Date().toISOString() }))
    .eq('id', parsedId.data)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) return { success: false, message: actionError(error, 'Nao foi possivel revogar a ativacao.') }
  if (!data) return { success: false, message: 'A ativacao nao esta mais pendente.' }

  revalidatePath('/admin/torres')
  return { success: true, message: 'Ativacao revogada.' }
}

const grantTowerStoreFullAccessSchema = z.object({
  storeId: z.number().int().positive(),
  adminName: z.string().trim().min(2, 'Informe o nome do responsavel.').max(120),
  adminEmail: z.string().trim().email('Informe um e-mail valido.').max(254).transform((value) => value.toLowerCase()),
})

export async function grantTowerStoreFullAccess(
  input: z.input<typeof grantTowerStoreFullAccessSchema>,
): Promise<TowerAdminActionResult> {
  const context = await requirePlatformAdmin()
  const parsed = grantTowerStoreFullAccessSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message || 'Revise os dados do responsavel.' }

  const admin = createAdminClient()
  const { data: rawStore, error: storeError } = await admin
    .from('stores')
    .select('id,tenant_id,settings')
    .eq('id', parsed.data.storeId)
    .maybeSingle()

  const store = rawStore as { id: number; tenant_id: string; settings: { tower_enabled?: unknown } | null } | null
  if (storeError) return { success: false, message: actionError(storeError, 'Nao foi possivel carregar a loja.') }
  if (!store?.settings?.tower_enabled) return { success: false, message: 'Loja com Torre nao encontrada.' }

  const { data: rawExisting, error: existingError } = await admin
    .from('tower_store_full_access')
    .select('store_id,admin_user_id,admin_name,admin_email,status,granted_by,granted_at,invitation_sent_at,updated_at')
    .eq('store_id', store.id)
    .maybeSingle()

  if (existingError) return { success: false, message: 'Aplique a migracao de liberacao da Gestao Otica antes de liberar a loja.' }

  const existing = rawExisting as TowerStoreFullAccessRow | null
  if (existing) {
    if (existing.admin_email.toLowerCase() === parsed.data.adminEmail) {
      return {
        success: true,
        message: existing.status === 'active'
          ? `A Gestao Otica ja esta liberada para ${existing.admin_email}.`
          : `O convite para ${existing.admin_email} ja esta sendo preparado.`,
      }
    }
    return { success: false, message: `A Gestao Otica ja foi vinculada a ${existing.admin_email}.` }
  }

  const { error: reservationError } = await admin
    .from('tower_store_full_access')
    .insert(asDbWrite({
      store_id: store.id,
      admin_name: parsed.data.adminName,
      admin_email: parsed.data.adminEmail,
      status: 'pending',
      granted_by: context.user.id,
    }))

  if (reservationError) {
    return { success: false, message: 'Esta loja ja esta em processo de liberacao. Atualize a pagina antes de tentar novamente.' }
  }

  const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(parsed.data.adminEmail, {
    data: { full_name: parsed.data.adminName },
  })

  if (invitationError || !invitation.user) {
    await admin.from('tower_store_full_access').delete().eq('store_id', store.id).eq('status', 'pending')
    const reason = actionError(invitationError, 'Nao foi possivel enviar o convite.')
    return {
      success: false,
      message: /already|registered|exists/i.test(reason)
        ? 'Este e-mail ja possui uma conta. Para manter a seguranca, ele nao foi vinculado automaticamente a esta loja.'
        : reason,
    }
  }

  const { error: profileError } = await admin
    .from('profiles')
    .upsert(asDbWrite({
      id: invitation.user.id,
      role: 'admin',
      tenant_id: store.tenant_id,
      store_id: store.id,
      full_name: parsed.data.adminName,
    }), { onConflict: 'id' })

  if (profileError) {
    await admin.from('tower_store_full_access').delete().eq('store_id', store.id).eq('status', 'pending')
    await admin.auth.admin.deleteUser(invitation.user.id)
    return { success: false, message: actionError(profileError, 'Nao foi possivel criar o acesso administrativo.') }
  }

  const { error: activationError } = await admin
    .from('tower_store_full_access')
    .update(asDbWrite({
      admin_user_id: invitation.user.id,
      status: 'active',
      invitation_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
    .eq('store_id', store.id)

  if (activationError) {
    return { success: false, message: actionError(activationError, 'O convite foi enviado, mas nao foi possivel registrar a liberacao.') }
  }

  revalidatePath('/admin/torres')
  revalidatePath(`/admin/torres/${store.id}`)
  return { success: true, message: `Gestao Otica liberada. O convite para ${parsed.data.adminEmail} foi enviado.` }
}
