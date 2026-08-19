import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'

const DISPLAY_WINDOW_MS = 5 * 60 * 1000

export async function GET(_request: Request, context: { params: Promise<{ storeId: string }> }) {
  const { storeId: rawStoreId } = await context.params
  const storeId = Number(rawStoreId)
  if (!Number.isInteger(storeId) || storeId <= 0) return NextResponse.json({ message: 'Loja invalida.' }, { status: 400 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: 'Nao autenticado.' }, { status: 401 })

  const profile = await getProfileByAdmin(user.id) as any
  if (!profile?.tenant_id || (profile.role !== 'admin' && profile.store_id !== storeId)) {
    return NextResponse.json({ message: 'Acesso negado.' }, { status: 403 })
  }

  const admin: any = createAdminClient()
  const displayCutoff = new Date(Date.now() - DISPLAY_WINDOW_MS).toISOString()
  const [saleResult, installmentResult] = await Promise.all([
    admin.from('pix_sale_charges').select('id, venda_id, amount, pix_copy_paste, status, expires_at, created_at, updated_at').eq('store_id', storeId).in('status', ['CREATING', 'PENDING']).gte('created_at', displayCutoff).order('created_at', { ascending: true }).limit(20),
    admin.from('pix_installment_charges').select('id, venda_id, installment_id, amount, pix_copy_paste, status, expires_at, created_at, updated_at').eq('store_id', storeId).in('status', ['CREATING', 'PENDING']).gte('created_at', displayCutoff).order('created_at', { ascending: true }).limit(20),
  ])

  const candidates = [
    ...(saleResult.data || []).map((row: Record<string, unknown>) => ({ kind: 'sale', ...row })),
    ...(installmentResult.data || []).map((row: Record<string, unknown>) => ({ kind: 'installment', ...row })),
  ].filter((row: Record<string, unknown>) => {
    const expiresAt = row.expires_at ? new Date(String(row.expires_at)).getTime() : null
    return expiresAt === null || expiresAt > Date.now()
  }) as Array<Record<string, unknown>>
  candidates.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  const charge = candidates[0]
  return NextResponse.json({ charge: charge ? {
    kind: charge.kind,
    id: Number(charge.id),
    vendaId: charge.venda_id ? Number(charge.venda_id) : null,
    installmentId: charge.installment_id ? Number(charge.installment_id) : null,
    amount: Number(charge.amount),
    pixCopyPaste: charge.pix_copy_paste || null,
    status: charge.status,
    expiresAt: charge.expires_at || null,
  } : null, queuedCount: charge ? Math.max(0, candidates.length - 1) : 0 })
}
