import 'server-only'

import { createHash, createHmac } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const TOWER_CUSTOMER_REPORT_BUCKET = 'tower-customer-reports'
export const TOWER_CUSTOMER_REPORT_TTL_SECONDS = 7 * 24 * 60 * 60
export const TOWER_CUSTOMER_REPORT_SIGNED_ASSET_SECONDS = 5 * 60
export const TOWER_CUSTOMER_REPORT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

function tokenSecret() {
  const secret = process.env.TOWER_CUSTOMER_REPORT_SECRET?.trim()
    || process.env.TOWER_DEVICE_WEB_SESSION_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!secret || secret.length < 32) throw new Error('Segredo dos relatorios temporarios nao configurado.')
  return secret
}

export function createTowerCustomerReportToken(reportId: string, createdAt: string) {
  return createHmac('sha256', tokenSecret())
    .update(`tower-customer-report:v1:${reportId}:${createdAt}`, 'utf8')
    .digest('base64url')
}

export function hashTowerCustomerReportToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export async function loadPublicTowerCustomerReport(token: string) {
  if (!TOWER_CUSTOMER_REPORT_TOKEN_PATTERN.test(token)) return null
  const admin = createAdminClient({ noStore: true })
  const tokenHash = hashTowerCustomerReportToken(token)
  const reports = admin.from('tower_customer_report_shares') as any
  const { data: report, error } = await reports
    .select('id,audience,snapshot,expires_at,status')
    .eq('public_token_hash', tokenHash)
    .eq('status', 'published')
    .maybeSingle()
  if (error || !report) return null

  if (!report.expires_at || Date.parse(report.expires_at) <= Date.now()) {
    await reports.update({ status: 'expired' }).eq('id', report.id).eq('status', 'published')
    return null
  }

  const { data: assets, error: assetError } = await (admin.from('tower_customer_report_assets') as any)
    .select('id,kind,mime_type,storage_path,captured_at')
    .eq('report_id', report.id)
    .eq('status', 'uploaded')
    .order('created_at', { ascending: true })
  if (assetError) return null

  const publicAssets = await Promise.all((assets ?? []).map(async (asset: any) => {
    const { data } = await admin.storage
      .from(TOWER_CUSTOMER_REPORT_BUCKET)
      .createSignedUrl(asset.storage_path, TOWER_CUSTOMER_REPORT_SIGNED_ASSET_SECONDS)
    return data?.signedUrl ? {
      id: asset.id,
      kind: asset.kind,
      mimeType: asset.mime_type,
      capturedAt: asset.captured_at,
      url: data.signedUrl,
    } : null
  }))

  return {
    audience: report.audience as 'customer' | 'retailer_export',
    snapshot: report.snapshot as Record<string, unknown>,
    expiresAt: report.expires_at as string,
    assets: publicAssets.filter(Boolean),
  }
}

export async function cleanupExpiredTowerCustomerReports(options?: { now?: Date; maxReports?: number }) {
  const now = options?.now ?? new Date()
  const maxReports = Math.max(1, Math.min(options?.maxReports ?? 200, 500))
  const stalePreparingAt = new Date(now.getTime() - TOWER_CUSTOMER_REPORT_TTL_SECONDS * 1000).toISOString()
  const admin = createAdminClient({ noStore: true })
  const reports = admin.from('tower_customer_report_shares') as any
  const [expiredResult, staleResult] = await Promise.all([
    reports.select('id,status').in('status', ['published', 'expired']).lte('expires_at', now.toISOString()).limit(maxReports),
    reports.select('id,status').eq('status', 'preparing').lte('created_at', stalePreparingAt).limit(maxReports),
  ])
  if (expiredResult.error || staleResult.error) throw new Error('Nao foi possivel listar relatorios expirados.')

  const candidates = [...new Map<string, { id: string; status: string }>([
    ...(expiredResult.data ?? []).map((item: { id: string; status: string }) => [item.id, item] as const),
    ...(staleResult.data ?? []).map((item: { id: string; status: string }) => [item.id, item] as const),
  ]).values()].slice(0, maxReports)
  let cleaned = 0
  let failed = 0
  let removedAssets = 0

  for (const candidate of candidates) {
    const claimQuery = candidate.status === 'preparing'
      ? reports.update({ status: 'expired', expires_at: now.toISOString() })
        .eq('id', candidate.id).eq('status', 'preparing').lte('created_at', stalePreparingAt)
      : reports.update({ status: 'expired' })
        .eq('id', candidate.id).in('status', ['published', 'expired']).lte('expires_at', now.toISOString())
    const { data: claimed, error: claimError } = await claimQuery.select('id').maybeSingle()
    if (claimError) {
      failed += 1
      continue
    }
    if (!claimed) continue
    const reportId = candidate.id
    const assetsTable = admin.from('tower_customer_report_assets') as any
    const { data: assets, error: assetListError } = await assetsTable
      .select('id,storage_path')
      .eq('report_id', reportId)
    if (assetListError) {
      failed += 1
      continue
    }
    const storagePaths = (assets ?? []).map((asset: { storage_path: string }) => asset.storage_path)
    if (storagePaths.length) {
      const { error: storageError } = await admin.storage
        .from(TOWER_CUSTOMER_REPORT_BUCKET)
        .remove(storagePaths)
      if (storageError) {
        failed += 1
        continue
      }
    }
    const { error: deleteAssetsError } = await assetsTable.delete().eq('report_id', reportId)
    if (deleteAssetsError) {
      failed += 1
      continue
    }
    const { error: redactError } = await reports.update({
      status: 'expired',
      customer_id: null,
      public_token_hash: null,
      snapshot: { expired: true },
      asset_manifest: [],
    }).eq('id', reportId).eq('status', 'expired')
    if (redactError) {
      failed += 1
      continue
    }
    removedAssets += storagePaths.length
    cleaned += 1
  }

  return { inspected: candidates.length, cleaned, failed, removedAssets }
}
