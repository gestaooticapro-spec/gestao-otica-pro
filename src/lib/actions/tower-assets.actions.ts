'use server'

import { createHash, randomBytes, randomInt } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePlatformAdmin } from '@/lib/auth/platform-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashTowerAdminPin } from '@/lib/tower-admin-pin'

export type TowerAssetStatus =
  | 'generated'
  | 'printed'
  | 'prepared'
  | 'in_stock'
  | 'assigned'
  | 'maintenance'
  | 'retired'

export type TowerAssetBatchSummary = {
  id: string
  batchCode: string
  batchName: string
  year: number
  quantity: number
  status: 'generated' | 'printed' | 'closed'
  createdAt: string
  printedAt: string | null
}

export type TowerAssetSummary = {
  id: string
  publicCode: string
  batchId: string
  batchCode: string
  status: TowerAssetStatus
  deviceLabel: string | null
  appVersion: string | null
  enrolledAt: string | null
  currentStoreId: number | null
  currentStoreName: string | null
  activeDeviceId: string | null
  createdAt: string
}

export type TowerAssetStoreOption = {
  id: number
  name: string
  tenantName: string
}

export type TowerAssetAdminData = {
  batches: TowerAssetBatchSummary[]
  assets: TowerAssetSummary[]
  stores: TowerAssetStoreOption[]
}

export type TowerAssetEnrollmentCredential = {
  assetId: string
  publicCode: string
  qrPayload: string
  fallbackCode: string
  expiresAt: string
}

export type TowerAssetAssociationCredential = {
  assetId: string
  publicCode: string
  storeId: number
  storeName: string
  qrPayload: string
  fallbackCode: string
  adminPin: string
  expiresAt: string
}

export type TowerAssetActionResult = {
  success: boolean
  message: string
  batchId?: string
  enrollment?: TowerAssetEnrollmentCredential
  association?: TowerAssetAssociationCredential
}

type BatchRow = {
  id: string
  batch_code: string
  batch_name: string
  sequence_year: number
  quantity: number
  status: 'generated' | 'printed' | 'closed'
  created_at: string
  printed_at: string | null
}

type AssetRow = {
  id: string
  public_code: string
  batch_id: string
  status: TowerAssetStatus
  enrolled_device_label: string | null
  enrolled_app_version: string | null
  enrolled_at: string | null
  current_store_id: number | null
  created_at: string
}

type StoreRow = {
  id: number
  tenant_id: string
  name: string
  settings: { tower_enabled?: unknown } | null
}

type TenantRow = { id: string; name: string }
type DeviceRow = { id: string; asset_id: string | null; status: 'active' | 'revoked' }

function actionError(error: unknown, fallback: string) {
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

export async function getTowerAssetAdminData(): Promise<TowerAssetAdminData> {
  await requirePlatformAdmin()
  const admin = createAdminClient()
  const [batchResult, assetResult, storeResult, tenantResult, deviceResult] = await Promise.all([
    admin.from('tower_asset_batches').select('id,batch_code,batch_name,sequence_year,quantity,status,created_at,printed_at').order('created_at', { ascending: false }),
    admin.from('tower_assets').select('id,public_code,batch_id,status,enrolled_device_label,enrolled_app_version,enrolled_at,current_store_id,created_at').order('public_code', { ascending: false }),
    admin.from('stores').select('id,tenant_id,name,settings').order('name'),
    admin.from('tenants').select('id,name'),
    admin.from('tower_devices').select('id,asset_id,status').eq('status', 'active'),
  ])

  if (batchResult.error || assetResult.error) {
    throw new Error('Aplique a migracao de identidade fisica da Torre antes de abrir esta pagina.')
  }
  if (storeResult.error || tenantResult.error || deviceResult.error) {
    throw new Error('Nao foi possivel carregar o controle das Torres.')
  }

  const batches = (batchResult.data || []) as BatchRow[]
  const assets = (assetResult.data || []) as AssetRow[]
  const stores = ((storeResult.data || []) as StoreRow[])
    .filter((store) => store.settings?.tower_enabled === true)
  const tenants = (tenantResult.data || []) as TenantRow[]
  const devices = (deviceResult.data || []) as DeviceRow[]
  const batchCodes = new Map(batches.map((batch) => [batch.id, batch.batch_code]))
  const storeNames = new Map(stores.map((store) => [store.id, store.name]))
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]))
  const activeDevices = new Map(
    devices.filter((device) => device.asset_id).map((device) => [device.asset_id!, device.id]),
  )

  return {
    batches: batches.map((batch) => ({
      id: batch.id,
      batchCode: batch.batch_code,
      batchName: batch.batch_name,
      year: batch.sequence_year,
      quantity: batch.quantity,
      status: batch.status,
      createdAt: batch.created_at,
      printedAt: batch.printed_at,
    })),
    assets: assets.map((asset) => ({
      id: asset.id,
      publicCode: asset.public_code,
      batchId: asset.batch_id,
      batchCode: batchCodes.get(asset.batch_id) || 'Lote desconhecido',
      status: asset.status,
      deviceLabel: asset.enrolled_device_label,
      appVersion: asset.enrolled_app_version,
      enrolledAt: asset.enrolled_at,
      currentStoreId: asset.current_store_id,
      currentStoreName: asset.current_store_id ? storeNames.get(asset.current_store_id) || `Loja #${asset.current_store_id}` : null,
      activeDeviceId: activeDevices.get(asset.id) || null,
      createdAt: asset.created_at,
    })),
    stores: stores.map((store) => ({
      id: store.id,
      name: store.name,
      tenantName: tenantNames.get(store.tenant_id) || 'Rede nao encontrada',
    })),
  }
}

const createBatchSchema = z.object({
  batchName: z.string().trim().min(2).max(120),
  quantity: z.number().int().min(1).max(1000),
  year: z.number().int().min(2020).max(2200),
})

export async function createTowerAssetBatch(input: z.infer<typeof createBatchSchema>): Promise<TowerAssetActionResult> {
  const context = await requirePlatformAdmin()
  const parsed = createBatchSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message || 'Lote invalido.' }

  const admin = createAdminClient() as unknown as {
    rpc: (name: 'create_tower_asset_batch', args: Record<string, unknown>) => PromiseLike<{
      data: Array<{ created_batch_id: string }> | null
      error: unknown
    }>
  }
  const { data, error } = await admin.rpc('create_tower_asset_batch', {
    p_batch_name: parsed.data.batchName,
    p_quantity: parsed.data.quantity,
    p_sequence_year: parsed.data.year,
    p_created_by: context.user.id,
  })

  if (error || !data?.[0]) return { success: false, message: actionError(error, 'Nao foi possivel gerar o lote.') }
  revalidatePath('/admin/torres/equipamentos')
  return { success: true, message: `${parsed.data.quantity} identidades geradas.`, batchId: data[0].created_batch_id }
}

export async function markTowerAssetBatchPrinted(batchId: string): Promise<TowerAssetActionResult> {
  await requirePlatformAdmin()
  const parsed = z.string().uuid().safeParse(batchId)
  if (!parsed.success) return { success: false, message: 'Lote invalido.' }
  const admin = createAdminClient() as unknown as {
    rpc: (name: 'mark_tower_asset_batch_printed', args: { p_batch_id: string }) => PromiseLike<{
      error: unknown
    }>
  }
  const { error } = await admin.rpc('mark_tower_asset_batch_printed', { p_batch_id: parsed.data })
  if (error) return { success: false, message: actionError(error, 'Nao foi possivel marcar o lote como impresso.') }
  revalidatePath('/admin/torres/equipamentos')
  return { success: true, message: 'Lote marcado como impresso.' }
}

export async function issueTowerAssetEnrollment(assetId: string): Promise<TowerAssetActionResult> {
  const context = await requirePlatformAdmin()
  const parsed = z.string().uuid().safeParse(assetId)
  if (!parsed.success) return { success: false, message: 'Torre invalida.' }

  const token = randomBytes(32).toString('base64url')
  const fallbackCode = createFallbackCode()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const admin = createAdminClient() as unknown as {
    rpc: (name: 'issue_tower_asset_enrollment', args: Record<string, unknown>) => PromiseLike<{
      data: Array<{ enrollment_id: string; asset_public_code: string }> | null
      error: unknown
    }>
  }
  const { data, error } = await admin.rpc('issue_tower_asset_enrollment', {
    p_asset_id: parsed.data,
    p_token_hash: hashCredential(token),
    p_fallback_code_hash: hashCredential(fallbackCode),
    p_expires_at: expiresAt,
    p_created_by: context.user.id,
  })

  if (error || !data?.[0]) return { success: false, message: actionError(error, 'Nao foi possivel preparar o registro da Torre.') }
  const publicCode = data[0].asset_public_code
  return {
    success: true,
    message: 'Registro de fabrica preparado por 24 horas.',
    enrollment: {
      assetId: parsed.data,
      publicCode,
      qrPayload: `MBTOWER-ASSET:1:${publicCode}:${token}`,
      fallbackCode,
      expiresAt,
    },
  }
}

const associationSchema = z.object({
  assetId: z.string().uuid(),
  storeId: z.number().int().positive(),
  validForHours: z.number().refine((value) => [24, 168, 720].includes(value)),
})

export async function prepareTowerAssetAssociation(input: z.infer<typeof associationSchema>): Promise<TowerAssetActionResult> {
  const context = await requirePlatformAdmin()
  const parsed = associationSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Selecione uma Torre preparada e uma loja valida.' }

  const token = randomBytes(32).toString('base64url')
  const fallbackCode = createFallbackCode()
  const adminPin = createTemporaryAdminPin()
  const expiresAt = new Date(Date.now() + parsed.data.validForHours * 60 * 60 * 1000).toISOString()
  const rawAdmin = createAdminClient()
  const [{ data: assetData }, { data: storeData }] = await Promise.all([
    rawAdmin.from('tower_assets').select('public_code').eq('id', parsed.data.assetId).maybeSingle(),
    rawAdmin.from('stores').select('name').eq('id', parsed.data.storeId).maybeSingle(),
  ])
  const asset = assetData as { public_code: string } | null
  const store = storeData as { name: string } | null
  if (!asset || !store) return { success: false, message: 'Torre ou loja nao encontrada.' }

  const rpcAdmin = rawAdmin as unknown as {
    rpc: (name: 'reissue_tower_asset_activation', args: Record<string, unknown>) => PromiseLike<{
      data: Array<{ activation_id: string }> | null
      error: unknown
    }>
  }
  const { data, error } = await rpcAdmin.rpc('reissue_tower_asset_activation', {
    p_asset_id: parsed.data.assetId,
    p_store_id: parsed.data.storeId,
    p_token_hash: hashCredential(token),
    p_fallback_code_hash: hashCredential(fallbackCode),
    p_admin_pin_hash: hashTowerAdminPin(adminPin),
    p_expires_at: expiresAt,
    p_created_by: context.user.id,
  })

  if (error || !data?.[0]) return { success: false, message: actionError(error, 'Nao foi possivel preparar a associacao.') }
  revalidatePath('/admin/torres')
  revalidatePath('/admin/torres/equipamentos')
  return {
    success: true,
    message: `${asset.public_code} preparada para ${store.name}.`,
    association: {
      assetId: parsed.data.assetId,
      publicCode: asset.public_code,
      storeId: parsed.data.storeId,
      storeName: store.name,
      qrPayload: `MBTOWER:1:${token}`,
      fallbackCode,
      adminPin,
      expiresAt,
    },
  }
}

export async function setTowerAssetLifecycleStatus(
  assetId: string,
  status: 'in_stock' | 'maintenance' | 'retired',
): Promise<TowerAssetActionResult> {
  await requirePlatformAdmin()
  const parsed = z.object({ assetId: z.string().uuid(), status: z.enum(['in_stock', 'maintenance', 'retired']) }).safeParse({ assetId, status })
  if (!parsed.success) return { success: false, message: 'Alteracao de status invalida.' }
  const admin = createAdminClient() as unknown as {
    rpc: (name: 'set_tower_asset_lifecycle_status', args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
  }
  const { error } = await admin.rpc('set_tower_asset_lifecycle_status', {
    p_asset_id: parsed.data.assetId,
    p_status: parsed.data.status,
  })
  if (error) return { success: false, message: actionError(error, 'Nao foi possivel alterar o status da Torre.') }
  revalidatePath('/admin/torres/equipamentos')
  return { success: true, message: 'Status atualizado.' }
}

export async function getTowerAssetBatchLabels(batchId: string) {
  await requirePlatformAdmin()
  const parsed = z.string().uuid().safeParse(batchId)
  if (!parsed.success) return null
  const admin = createAdminClient()
  const [{ data: batchData, error: batchError }, { data: assetData, error: assetError }] = await Promise.all([
    admin.from('tower_asset_batches').select('id,batch_code,batch_name,quantity,status').eq('id', parsed.data).maybeSingle(),
    admin.from('tower_assets').select('id,public_code').eq('batch_id', parsed.data).order('public_code'),
  ])
  if (batchError || assetError || !batchData) return null
  return {
    batch: batchData as { id: string; batch_code: string; batch_name: string; quantity: number; status: string },
    assets: (assetData || []) as Array<{ id: string; public_code: string }>,
  }
}
