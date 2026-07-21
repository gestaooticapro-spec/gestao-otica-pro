import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDeviceWebSessionToken } from '@/lib/server/tower-device-web-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BaseSchema = z.object({ storeId: z.coerce.number().int().positive(), sessionId: z.string().uuid() })
const PrescriptionSchema = z.object({
  od: z.object({ sphere: z.number().min(-30).max(30), cylinder: z.number().min(-15).max(15), axis: z.number().min(0).max(180) }),
  oe: z.object({ sphere: z.number().min(-30).max(30), cylinder: z.number().min(-15).max(15), axis: z.number().min(0).max(180) }),
  addition: z.number().min(0).max(8),
})
const CommandSchema = z.discriminatedUnion('command', [
  BaseSchema.extend({ command: z.literal('save-prescription'), customerId: z.coerce.number().int().positive(), prescription: PrescriptionSchema }),
  BaseSchema.extend({ command: z.literal('link-customer'), customerId: z.coerce.number().int().positive() }),
  BaseSchema.extend({ command: z.literal('link-evaluation'), evaluationId: z.coerce.number().int().positive() }),
  BaseSchema.extend({ command: z.literal('complete') }),
  BaseSchema.extend({ command: z.literal('discard') }),
])

const parsePrescriptionNumber = (value: string | null) => {
  const parsed = Number.parseFloat((value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export async function POST(request: NextRequest) {
  const parsed = CommandSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Comando da sessao invalido.' }, { status: 400 })

  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return NextResponse.json({ success: false, message: 'Torre nao autenticada.' }, { status: 401 })
  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

  const admin = createAdminClient()
  const sessions = admin.from('tower_sessions') as any
  const { data: session, error: findError } = await sessions
    .select('*')
    .eq('id', parsed.data.sessionId)
    .eq('store_id', parsed.data.storeId)
    .maybeSingle()
  if (findError) return NextResponse.json({ success: false, message: findError.message }, { status: 500 })
  if (!session) return NextResponse.json({ success: false, message: 'Sessao nao encontrada.' }, { status: 404 })

  if (parsed.data.command === 'complete' || parsed.data.command === 'discard') {
    const status = parsed.data.command === 'complete' ? 'completed' : 'discarded'
    if (session.status === status) return NextResponse.json({ success: true, message: 'Sessao ja estava encerrada.' })
    if (session.status !== 'active') return NextResponse.json({ success: false, message: 'Esta sessao nao pode mais ser alterada.' }, { status: 409 })
    const now = new Date().toISOString()
    const { error } = await sessions.update({
      status,
      completed_at: status === 'completed' ? now : null,
      discarded_at: status === 'discarded' ? now : null,
    }).eq('id', session.id).eq('store_id', parsed.data.storeId)
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    return NextResponse.json({ success: true, message: status === 'completed' ? 'Sessao concluida.' : 'Sessao descartada.' })
  }

  if (session.status !== 'active') return NextResponse.json({ success: false, message: 'Sessao da Torre nao esta ativa.' }, { status: 409 })

  let update: Record<string, unknown>
  let association: { customer_id?: number; optical_evaluation_id?: number }
  let successMessage: string

  if (parsed.data.command === 'link-evaluation') {
    const evaluations = admin.from('optical_evaluations') as any
    const { data: evaluation, error } = await evaluations
      .select('id, tenant_id, store_id, evaluated_customer_id, receita_longe_od_esferico, receita_longe_od_cilindrico, receita_longe_od_eixo, receita_longe_oe_esferico, receita_longe_oe_cilindrico, receita_longe_oe_eixo, receita_adicao')
      .eq('id', parsed.data.evaluationId)
      .eq('store_id', parsed.data.storeId)
      .maybeSingle()
    if (error || !evaluation) return NextResponse.json({ success: false, message: error?.message || 'Avaliacao nao encontrada para esta loja.' }, { status: 404 })
    if (evaluation.tenant_id !== auth.tenantId || !evaluation.evaluated_customer_id) {
      return NextResponse.json({ success: false, message: 'Avaliacao sem cliente direto valido para a Torre.' }, { status: 409 })
    }
    if (session.customer_id && session.customer_id !== evaluation.evaluated_customer_id) {
      return NextResponse.json({ success: false, message: 'O cliente da sessao nao corresponde ao cliente da avaliacao.' }, { status: 409 })
    }
    const prescription = {
      od: { sphere: parsePrescriptionNumber(evaluation.receita_longe_od_esferico), cylinder: parsePrescriptionNumber(evaluation.receita_longe_od_cilindrico), axis: Math.max(0, Math.min(180, Math.round(parsePrescriptionNumber(evaluation.receita_longe_od_eixo)))) },
      oe: { sphere: parsePrescriptionNumber(evaluation.receita_longe_oe_esferico), cylinder: parsePrescriptionNumber(evaluation.receita_longe_oe_cilindrico), axis: Math.max(0, Math.min(180, Math.round(parsePrescriptionNumber(evaluation.receita_longe_oe_eixo)))) },
      addition: Math.max(0, Math.min(8, parsePrescriptionNumber(evaluation.receita_adicao))),
    }
    update = { optical_evaluation_id: evaluation.id, customer_id: evaluation.evaluated_customer_id, prescription_snapshot: prescription }
    association = { customer_id: evaluation.evaluated_customer_id, optical_evaluation_id: evaluation.id }
    successMessage = 'Avaliacao vinculada a sessao da Torre.'
  } else {
    const customers = admin.from('customers') as any
    const { data: customer, error } = await customers.select('id').eq('id', parsed.data.customerId).eq('store_id', parsed.data.storeId).maybeSingle()
    if (error || !customer) return NextResponse.json({ success: false, message: error?.message || 'Cliente nao encontrado para esta loja.' }, { status: 404 })
    update = parsed.data.command === 'save-prescription'
      ? { customer_id: customer.id, prescription_snapshot: parsed.data.prescription, current_experience: 'thickness' }
      : { customer_id: customer.id }
    association = { customer_id: customer.id }
    successMessage = parsed.data.command === 'save-prescription' ? 'Receita real salva na sessao da Torre.' : 'Cliente vinculado a sessao da Torre.'
  }

  const { data, error } = await sessions.update(update).eq('id', session.id).eq('store_id', parsed.data.storeId).select('*').single()
  if (error || !data) return NextResponse.json({ success: false, message: error?.message || 'Nao foi possivel atualizar a sessao.' }, { status: 500 })

  const heatmapSessions = admin.from('tower_heatmap_sessions') as any
  const { error: heatmapError } = await heatmapSessions.update(association).eq('tower_session_id', session.id).eq('store_id', parsed.data.storeId)
  if (heatmapError) return NextResponse.json({ success: false, message: `${successMessage} Campo Visual nao atualizado: ${heatmapError.message}` }, { status: 500 })
  return NextResponse.json({ success: true, message: successMessage, data })
}
