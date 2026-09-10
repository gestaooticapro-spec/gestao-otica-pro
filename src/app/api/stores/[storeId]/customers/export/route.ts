import { NextResponse } from 'next/server'

import { getProfileByAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { buildCustomerContactsWorkbook, type CustomerContactRow } from '@/lib/server/customer-contacts-workbook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type StoreProfile = {
  role?: string | null
  store_id?: number | null
  tenant_id?: string | null
}

async function loadAllCustomerContacts(storeId: number, tenantId: string) {
  const admin = createAdminClient({ noStore: true })
  const customers: CustomerContactRow[] = []

  for (let from = 0; ; from += 1000) {
    const { data, error } = await (admin.from('customers') as any)
      .select('full_name, fone_movel, phone')
      .eq('tenant_id', tenantId)
      .eq('store_id', storeId)
      .order('full_name', { ascending: true })
      .range(from, from + 999)

    if (error) throw error
    customers.push(...((data || []) as CustomerContactRow[]))
    if (!data || data.length < 1000) return customers
  }
}

export async function GET(_request: Request, context: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId: rawStoreId } = await context.params
    const storeId = Number(rawStoreId)
    if (!Number.isSafeInteger(storeId) || storeId <= 0) {
      return NextResponse.json({ message: 'Loja inválida.' }, { status: 400 })
    }

    const auth = createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ message: 'Usuário não autenticado.' }, { status: 401 })

    const profile = await getProfileByAdmin(user.id) as StoreProfile | null
    if (!profile?.tenant_id) {
      return NextResponse.json({ message: 'Perfil sem empresa vinculada.' }, { status: 403 })
    }

    const canAccessStore = profile.role === 'admin' || Number(profile.store_id) === storeId
    if (!canAccessStore) {
      return NextResponse.json({ message: 'Sem permissão para exportar clientes desta loja.' }, { status: 403 })
    }

    const admin = createAdminClient({ noStore: true })
    const { data: store } = await (admin.from('stores') as any)
      .select('id')
      .eq('id', storeId)
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle()

    if (!store) return NextResponse.json({ message: 'Loja não encontrada.' }, { status: 404 })

    const customers = await loadAllCustomerContacts(storeId, profile.tenant_id)
    const workbook = await buildCustomerContactsWorkbook(customers)
    const date = new Date().toISOString().slice(0, 10)
    const filename = `clientes-loja-${storeId}-${date}.xlsx`

    return new NextResponse(new Uint8Array(workbook), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Erro ao exportar clientes:', error)
    return NextResponse.json({ message: 'Não foi possível gerar o relatório de clientes.' }, { status: 500 })
  }
}
