import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { isSicrediPilotStoreCnpj } from '@/lib/pix/sicredi-availability'
import { hasPixMachineGrant } from '@/lib/pix/pix-maquininha-access'
import type { StoreSettings } from '@/lib/store-modules'

// A maquininha deve continuar exibindo o QR Code recente mesmo que o atendimento
// leve alguns minutos para chegar ao tablet. A validade efetiva continua sendo
// determinada por expires_at, informado pelo Sicredi.
const DISPLAY_WINDOW_MS = 30 * 60 * 1000

export async function GET(_request: Request, context: { params: Promise<{ storeId: string }> }) {
  const { storeId: rawStoreId } = await context.params
  const storeId = Number(rawStoreId)
  if (!Number.isInteger(storeId) || storeId <= 0) return NextResponse.json({ message: 'Loja invalida.' }, { status: 400 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profile = user ? await getProfileByAdmin(user.id) as any : null
  const hasMachineGrant = await hasPixMachineGrant(storeId)
  const hasDashboardAccess = Boolean(profile?.tenant_id && (profile.role === 'admin' || profile.store_id === storeId))
  if (!hasDashboardAccess && !hasMachineGrant) return NextResponse.json({ message: 'Acesso negado.' }, { status: 403 })

  const admin: any = createAdminClient()
  const { data: store } = await admin.from('stores').select('id, tenant_id, cnpj, settings').eq('id', storeId).maybeSingle()
  if (!store || (hasDashboardAccess && store.tenant_id !== profile.tenant_id)) return NextResponse.json({ message: 'Acesso negado.' }, { status: 403 })
  const settings = (store.settings || {}) as StoreSettings
  if (!isSicrediPilotStoreCnpj(store.cnpj) || settings.pix_provider !== 'sicredi') {
    return NextResponse.json({ message: 'Modo maquininha Pix indisponivel para esta loja.' }, { status: 403 })
  }
  const displayCutoff = new Date(Date.now() - DISPLAY_WINDOW_MS).toISOString()
  const [saleResult, installmentResult] = await Promise.all([
    admin.from('pix_sale_charges').select('id, venda_id, amount, pix_copy_paste, status, expires_at, created_at, updated_at').eq('store_id', storeId).in('status', ['CREATING', 'PENDING']).gte('created_at', displayCutoff).order('created_at', { ascending: true }).limit(20),
    admin.from('pix_installment_charges').select('id, venda_id, installment_id, amount, pix_copy_paste, status, expires_at, created_at, updated_at').eq('store_id', storeId).in('status', ['CREATING', 'PENDING']).gte('created_at', displayCutoff).order('created_at', { ascending: true }).limit(20),
  ])

  if (saleResult.error || installmentResult.error) {
    return NextResponse.json(
      { message: 'Nao foi possivel consultar as cobrancas Pix da maquininha.' },
      { status: 500 },
    )
  }

  const candidates = [
    ...(saleResult.data || []).map((row: Record<string, unknown>) => ({ kind: 'sale', ...row })),
    ...(installmentResult.data || []).map((row: Record<string, unknown>) => ({ kind: 'installment', ...row })),
  ].filter((row: Record<string, unknown>) => {
    const expiresAt = row.expires_at ? new Date(String(row.expires_at)).getTime() : null
    return expiresAt === null || expiresAt > Date.now()
  }) as Array<Record<string, unknown>>
  candidates.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  const charge = candidates[0]
  let clearedStatus: string | null = null
  if (!charge) {
    const [latestSale, latestInstallment] = await Promise.all([
      admin.from('pix_sale_charges').select('status, created_at, updated_at').eq('store_id', storeId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('pix_installment_charges').select('status, created_at, updated_at').eq('store_id', storeId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    const latest = [latestSale.data, latestInstallment.data].filter(Boolean).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] as Record<string, unknown> | undefined
    const latestUpdatedAt = latest?.updated_at ? new Date(String(latest.updated_at)).getTime() : 0
    if (latestUpdatedAt >= Date.now() - DISPLAY_WINDOW_MS && latest?.status === 'PAID') clearedStatus = 'PAID'
    else if (latestUpdatedAt >= Date.now() - DISPLAY_WINDOW_MS && latest?.status === 'CANCELLED') clearedStatus = 'CANCELLED'
    else if (latestUpdatedAt >= Date.now() - DISPLAY_WINDOW_MS && latest?.status === 'EXPIRED') clearedStatus = 'EXPIRED'
    else if (latest?.created_at && new Date(String(latest.created_at)).getTime() < Date.now() - DISPLAY_WINDOW_MS) clearedStatus = 'DISPLAY_EXPIRED'
  }
  return NextResponse.json({ charge: charge ? {
    kind: charge.kind,
    id: Number(charge.id),
    vendaId: charge.venda_id ? Number(charge.venda_id) : null,
    installmentId: charge.installment_id ? Number(charge.installment_id) : null,
    amount: Number(charge.amount),
    pixCopyPaste: charge.pix_copy_paste || null,
    status: charge.status,
    expiresAt: charge.expires_at || null,
  } : null, queuedCount: charge ? Math.max(0, candidates.length - 1) : 0, clearedStatus })
}
