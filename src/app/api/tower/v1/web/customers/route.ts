import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDeviceWebSessionToken } from '@/lib/server/tower-device-web-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  storeId: z.coerce.number().int().positive(),
  query: z.string().trim().min(1).max(160),
})

export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: 'Informe um nome ou CPF para buscar.' }, { status: 400 })
  }

  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return NextResponse.json({ success: false, message: 'Torre nao autenticada.' }, { status: 401 })

  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

  const term = parsed.data.query.replace(/[%_,]/g, '').trim()
  if (!term) return NextResponse.json({ success: false, message: 'Informe um nome ou CPF para buscar.' }, { status: 400 })

  const { data, error } = await createAdminClient()
    .from('customers')
    .select('id,full_name,fone_movel,cpf')
    .eq('store_id', parsed.data.storeId)
    .or(`full_name.ilike.%${term}%,cpf.ilike.%${term}%`)
    .order('full_name')
    .limit(30)

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, message: 'Clientes encontrados.', data: data ?? [] })
}
