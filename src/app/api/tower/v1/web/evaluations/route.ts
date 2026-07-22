import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDeviceWebSessionToken } from '@/lib/server/tower-device-web-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NullableText = z.string().max(500).nullable().optional()
const HourValue = z.coerce.number().finite().min(0).max(24).nullable().optional()
const EvaluationSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  evaluatedCustomerId: z.coerce.number().int().positive(),
  evaluatedNameSnapshot: z.string().trim().min(2).max(160),
  responsibleCustomerId: z.coerce.number().int().positive().nullable().optional(),
  responsibleNameSnapshot: z.string().trim().max(160).nullable().optional(),
  relationshipSnapshot: z.string().trim().max(80).nullable().optional(),
  receitaLongeOdEsferico: NullableText,
  receitaLongeOdCilindrico: NullableText,
  receitaLongeOdEixo: NullableText,
  receitaLongeOeEsferico: NullableText,
  receitaLongeOeCilindrico: NullableText,
  receitaLongeOeEixo: NullableText,
  receitaAdicao: NullableText,
  ageYears: z.coerce.number().int().min(1).max(120).nullable().optional(),
  estiloVidaUsoComputadorHoras: HourValue,
  estiloVidaDirigirHoras: HourValue,
  estiloVidaLeituraHoras: HourValue,
  estiloVidaUsoCelularHoras: HourValue,
  estiloVidaExposicaoSolHoras: HourValue,
  estiloVidaAmbienteInternoHoras: HourValue,
  estiloVidaAmbienteExternoHoras: HourValue,
  estiloVidaAssistirTvHoras: HourValue,
  rawPayloadJson: z.record(z.string(), z.unknown()).default({}),
}).superRefine((data, ctx) => {
  if (JSON.stringify(data.rawPayloadJson).length > 64_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Contexto da avaliacao muito grande.', path: ['rawPayloadJson'] })
  }
})

const normalizeText = (value: string | null | undefined) => value?.trim() ? value.trim() : null

export async function POST(request: NextRequest) {
  const parsed = EvaluationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message || 'Dados da avaliacao invalidos.' }, { status: 400 })
  }

  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return NextResponse.json({ success: false, message: 'Torre nao autenticada.' }, { status: 401 })
  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

  const admin = createAdminClient()
  const { data: store, error: storeError } = await (admin.from('stores') as any)
    .select('id, settings')
    .eq('id', parsed.data.storeId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (storeError) return NextResponse.json({ success: false, message: storeError.message }, { status: 500 })
  if (!store) return NextResponse.json({ success: false, message: 'Loja nao encontrada.' }, { status: 404 })
  if (store.settings?.pre_sale_analysis_enabled !== true) {
    return NextResponse.json({ success: false, message: 'A Analise Pre-Venda nao esta habilitada para esta loja.' }, { status: 409 })
  }

  const input = parsed.data
  const { data: customer, error: customerError } = await (admin.from('customers') as any)
    .select('id, full_name')
    .eq('id', input.evaluatedCustomerId)
    .eq('store_id', input.storeId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (customerError) return NextResponse.json({ success: false, message: customerError.message }, { status: 500 })
  if (!customer) return NextResponse.json({ success: false, message: 'Cliente nao encontrado para esta loja.' }, { status: 404 })
  if (input.responsibleCustomerId && input.responsibleCustomerId !== customer.id) {
    return NextResponse.json({ success: false, message: 'Responsavel invalido para a avaliacao da Torre.' }, { status: 409 })
  }

  const payload = {
    tenant_id: auth.tenantId,
    store_id: input.storeId,
    evaluated_customer_id: customer.id,
    evaluated_dependente_id: null,
    responsible_customer_id: input.responsibleCustomerId ?? customer.id,
    imported_by_user_id: auth.userId,
    source_system: 'manual',
    status: 'em_andamento',
    parse_status: 'success',
    evaluated_name_snapshot: input.evaluatedNameSnapshot.trim(),
    responsible_name_snapshot: normalizeText(input.responsibleNameSnapshot) ?? customer.full_name,
    relationship_snapshot: normalizeText(input.relationshipSnapshot) ?? 'Titular',
    age_years: input.ageYears ?? null,
    estilo_vida_uso_computador_horas: input.estiloVidaUsoComputadorHoras ?? null,
    estilo_vida_dirigir_horas: input.estiloVidaDirigirHoras ?? null,
    estilo_vida_leitura_horas: input.estiloVidaLeituraHoras ?? null,
    estilo_vida_uso_celular_horas: input.estiloVidaUsoCelularHoras ?? null,
    estilo_vida_exposicao_sol_horas: input.estiloVidaExposicaoSolHoras ?? null,
    estilo_vida_ambiente_interno_horas: input.estiloVidaAmbienteInternoHoras ?? null,
    estilo_vida_ambiente_externo_horas: input.estiloVidaAmbienteExternoHoras ?? null,
    estilo_vida_assistir_tv_horas: input.estiloVidaAssistirTvHoras ?? null,
    receita_longe_od_esferico: normalizeText(input.receitaLongeOdEsferico),
    receita_longe_od_cilindrico: normalizeText(input.receitaLongeOdCilindrico),
    receita_longe_od_eixo: normalizeText(input.receitaLongeOdEixo),
    receita_longe_oe_esferico: normalizeText(input.receitaLongeOeEsferico),
    receita_longe_oe_cilindrico: normalizeText(input.receitaLongeOeCilindrico),
    receita_longe_oe_eixo: normalizeText(input.receitaLongeOeEixo),
    receita_adicao: normalizeText(input.receitaAdicao),
    raw_payload_json: input.rawPayloadJson,
    updated_at: new Date().toISOString(),
  }

  const evaluations = admin.from('optical_evaluations') as any
  const { data: existing, error: existingError } = await evaluations
    .select('id')
    .eq('tenant_id', auth.tenantId)
    .eq('store_id', input.storeId)
    .eq('evaluated_customer_id', customer.id)
    .is('exported_venda_id', null)
    .not('status', 'eq', 'concluida')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) return NextResponse.json({ success: false, message: existingError.message }, { status: 500 })

  if (existing?.id) {
    const { data, error } = await evaluations.update(payload)
      .eq('id', existing.id)
      .eq('store_id', input.storeId)
      .eq('tenant_id', auth.tenantId)
      .select('*')
      .single()
    if (error || !data) return NextResponse.json({ success: false, message: error?.message || 'Nao foi possivel atualizar a avaliacao.' }, { status: 500 })
    return NextResponse.json({ success: true, message: 'Avaliacao atualizada com sucesso.', data })
  }

  const { data, error } = await evaluations.insert(payload).select('*').single()
  if (error || !data) return NextResponse.json({ success: false, message: error?.message || 'Nao foi possivel salvar a avaliacao.' }, { status: 500 })
  return NextResponse.json({ success: true, message: 'Avaliacao salva com sucesso.', data })
}
