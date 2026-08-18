import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'

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
  const [saleResult, installmentResult] = await Promise.all([
    admin.from('pix_sale_charges').select('id, venda_id, amount, pix_copy_paste, status, expires_at, updated_at').eq('store_id', storeId).in('status', ['CREATING', 'PENDING']).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('pix_installment_charges').select('id, venda_id, installment_id, amount, pix_copy_paste, status, expires_at, updated_at').eq('store_id', storeId).in('status', ['CREATING', 'PENDING']).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const candidates = [
    saleResult.data ? { kind: 'sale', ...saleResult.data } : null,
    installmentResult.data ? { kind: 'installment', ...installmentResult.data } : null,
  ].filter(Boolean) as Array<Record<string, unknown>>
  candidates.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
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
  } : null })
}
