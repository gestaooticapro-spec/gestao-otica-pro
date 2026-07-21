import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDeviceWebSessionToken } from '@/lib/server/tower-device-web-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const StoreIdSchema = z.coerce.number().int().positive()
const ExperienceSchema = z.enum(['look', 'visagismo', 'campo_visual', 'medidas', 'thickness'])
const CreateSchema = z.object({
  storeId: StoreIdSchema,
  experience: ExperienceSchema.optional(),
  sessionId: z.string().uuid().optional(),
})

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

async function authenticate(request: NextRequest, storeId: number) {
  const token = bearerToken(request)
  if (!token) return { ok: false as const, message: 'Torre nao autenticada.' }
  return authenticateTowerDeviceWebSessionToken(token, storeId)
}

export async function GET(request: NextRequest) {
  const parsed = StoreIdSchema.safeParse(request.nextUrl.searchParams.get('storeId'))
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Loja invalida.' }, { status: 400 })

  const auth = await authenticate(request, parsed.data)
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

  const sessions = createAdminClient().from('tower_sessions') as any
  const { data, error } = await sessions
    .select('*, customer:customers(id, full_name, fone_movel)')
    .eq('store_id', parsed.data)
    .eq('status', 'active')
    .order('started_at', { ascending: false })

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, message: 'Sessoes ativas carregadas.', data: data ?? [] })
}

export async function POST(request: NextRequest) {
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Dados da sessao invalidos.' }, { status: 400 })

  const auth = await authenticate(request, parsed.data.storeId)
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

  const sessions = createAdminClient().from('tower_sessions') as any
  if (parsed.data.sessionId) {
    const { data: current, error: findError } = await sessions
      .select('*')
      .eq('id', parsed.data.sessionId)
      .eq('store_id', parsed.data.storeId)
      .maybeSingle()
    if (findError) return NextResponse.json({ success: false, message: findError.message }, { status: 500 })
    if (!current || current.status !== 'active') {
      return NextResponse.json({ success: false, message: 'Sessao da Torre nao esta ativa.' }, { status: 409 })
    }
    if (!parsed.data.experience) {
      return NextResponse.json({ success: true, message: 'Sessao da Torre retomada.', data: current })
    }
    const { data, error } = await sessions
      .update({ current_experience: parsed.data.experience })
      .eq('id', current.id)
      .eq('store_id', parsed.data.storeId)
      .select('*')
      .single()
    if (error || !data) return NextResponse.json({ success: false, message: error?.message || 'Nao foi possivel atualizar a sessao da Torre.' }, { status: 500 })
    return NextResponse.json({ success: true, message: 'Sessao da Torre retomada.', data })
  }

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
  if (error || !data) return NextResponse.json({ success: false, message: error?.message || 'Nao foi possivel criar a sessao da Torre.' }, { status: 500 })
  return NextResponse.json({ success: true, message: 'Sessao da Torre criada.', data }, { status: 201 })
}
