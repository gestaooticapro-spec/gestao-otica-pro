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
const CreateSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  fullName: z.string().trim().min(3).max(160),
  mobilePhone: z.string().trim().min(8).max(32),
})
const UpdateSchema = CreateSchema.extend({
  customerId: z.coerce.number().int().positive(),
})

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: 'Informe nome, CPF ou CNPJ para buscar.' }, { status: 400 })
  }

  const token = getBearerToken(request)
  if (!token) return NextResponse.json({ success: false, message: 'Torre nao autenticada.' }, { status: 401 })

  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

  const term = parsed.data.query.replace(/[%_,]/g, '').trim()
  if (!term) return NextResponse.json({ success: false, message: 'Informe nome, CPF ou CNPJ para buscar.' }, { status: 400 })

  const documentTerm = term.replace(/\D/g, '')

  const { data, error } = await createAdminClient()
    .from('customers')
    .select('id,full_name,razao_social,nome_fantasia,fone_movel,person_type,cpf,cnpj')
    .eq('tenant_id', auth.tenantId)
    .eq('store_id', parsed.data.storeId)
    .or(`full_name.ilike.%${term}%,razao_social.ilike.%${term}%,nome_fantasia.ilike.%${term}%,cpf.ilike.%${documentTerm || term}%,cnpj.ilike.%${documentTerm || term}%`)
    .order('full_name')
    .limit(30)

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, message: 'Clientes encontrados.', data: data ?? [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const updateParsed = UpdateSchema.safeParse(body)
  if (updateParsed.success) {
    const token = getBearerToken(request)
    if (!token) return NextResponse.json({ success: false, message: 'Torre nao autenticada.' }, { status: 401 })
    const auth = await authenticateTowerDeviceWebSessionToken(token, updateParsed.data.storeId)
    if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

    const fullName = updateParsed.data.fullName.trim()
    const mobilePhone = updateParsed.data.mobilePhone.replace(/\D/g, '')
    if (mobilePhone.length < 8 || mobilePhone.length > 15) {
      return NextResponse.json({ success: false, message: 'Telefone invalido.' }, { status: 400 })
    }
    const customers = createAdminClient().from('customers') as any
    const { data, error } = await customers
      .update({ full_name: fullName, fone_movel: mobilePhone })
      .eq('id', updateParsed.data.customerId)
      .eq('tenant_id', auth.tenantId)
      .eq('store_id', updateParsed.data.storeId)
      .select('id, full_name, fone_movel')
      .maybeSingle()
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ success: false, message: 'Cliente nao encontrado nesta loja.' }, { status: 404 })
    return NextResponse.json({ success: true, message: 'Cliente atualizado.', data })
  }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: 'Dados invalidos para cadastrar o cliente.' }, { status: 400 })
  }

  const token = getBearerToken(request)
  if (!token) return NextResponse.json({ success: false, message: 'Torre nao autenticada.' }, { status: 401 })
  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

  const fullName = parsed.data.fullName.trim()
  const mobilePhone = parsed.data.mobilePhone.replace(/\D/g, '')
  if (mobilePhone.length < 8 || mobilePhone.length > 15) {
    return NextResponse.json({ success: false, message: 'Telefone invalido.' }, { status: 400 })
  }

  const customers = createAdminClient().from('customers') as any
  const exactName = fullName.replace(/[%_]/g, '').trim()
  if (exactName.length < 3) {
    return NextResponse.json({ success: false, message: 'Nome invalido.' }, { status: 400 })
  }
  const { data: existing, error: findError } = await customers
    .select('id, full_name, fone_movel')
    .eq('tenant_id', auth.tenantId)
    .eq('store_id', parsed.data.storeId)
    .ilike('full_name', exactName)
    .limit(1)
    .maybeSingle()
  if (findError) return NextResponse.json({ success: false, message: findError.message }, { status: 500 })
  if (existing) {
    if ((existing.fone_movel ?? '').replace(/\D/g, '') === mobilePhone) {
      return NextResponse.json({ success: true, message: 'Cliente ja estava cadastrado.', data: existing })
    }
    return NextResponse.json({ success: false, message: 'Ja existe um cliente com este nome exato.' }, { status: 409 })
  }

  const { data, error } = await customers.insert({
    tenant_id: auth.tenantId,
    store_id: parsed.data.storeId,
    full_name: exactName,
    fone_movel: mobilePhone,
    created_at: new Date().toISOString(),
  }).select('id, full_name, fone_movel').single()
  if (error || !data) {
    return NextResponse.json({ success: false, message: error?.message || 'Nao foi possivel cadastrar o cliente.' }, { status: 500 })
  }
  return NextResponse.json({ success: true, message: 'Cliente cadastrado!', data })
}

export async function PATCH(request: NextRequest) {
  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: 'Dados invalidos para editar o cliente.' }, { status: 400 })
  }

  const token = getBearerToken(request)
  if (!token) return NextResponse.json({ success: false, message: 'Torre nao autenticada.' }, { status: 401 })
  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

  const fullName = parsed.data.fullName.trim()
  const mobilePhone = parsed.data.mobilePhone.replace(/\D/g, '')
  if (mobilePhone.length < 8 || mobilePhone.length > 15) {
    return NextResponse.json({ success: false, message: 'Telefone invalido.' }, { status: 400 })
  }
  if (fullName.length < 3) {
    return NextResponse.json({ success: false, message: 'Nome invalido.' }, { status: 400 })
  }

  const customers = createAdminClient().from('customers') as any
  const { data, error } = await customers
    .update({ full_name: fullName, fone_movel: mobilePhone })
    .eq('id', parsed.data.customerId)
    .eq('tenant_id', auth.tenantId)
    .eq('store_id', parsed.data.storeId)
    .select('id, full_name, fone_movel')
    .maybeSingle()

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ success: false, message: 'Cliente nao encontrado nesta loja.' }, { status: 404 })
  return NextResponse.json({ success: true, message: 'Cliente atualizado.', data })
}
