
'use server'

import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { useCredit } from './wallet.actions'
import { calcularERegistrarComissao, cancelarComissao, calcularComissaoMedico } from './commission.actions'
import { checkLensStock, confirmReservations, cancelReservations, getLensReservationForOsSlot, releaseReservationsForServiceOrder, reserveLensByAdmin, type LensReservationSlot } from './stock.actions'
import { isStoreModuleEnabledForStore } from '@/lib/store-modules.server'
import { clearNfcTrayLinkForDeliveredOrder } from '@/lib/nfc-tray-cleanup'

// ================================================================
// --- TIPOS GLOBAIS ---
// ================================================================

type Customer = Database['public']['Tables']['customers']['Row']
type Dependente = Database['public']['Tables']['dependentes']['Row']
type Venda = Database['public']['Tables']['vendas']['Row']
export type VendaItem = Database['public']['Tables']['venda_itens']['Row'] & { unidade?: string | null }
type ServiceOrder = Database['public']['Tables']['service_orders']['Row']
type Oftalmologista = Database['public']['Tables']['oftalmologistas']['Row']
type Product = Database['public']['Tables']['products']['Row']
type Pagamento = Database['public']['Tables']['pagamentos']['Row']
type Financiamento = Database['public']['Tables']['financiamento_loja']['Row']
type FinanciamentoParcela = Database['public']['Tables']['financiamento_parcelas']['Row']
type Employee = Database['public']['Tables']['employees']['Row']
type StoreSettings = {
  pre_sale_analysis_enabled?: boolean
  service_order_mode?: 'single' | 'multiple'
}

type ServiceOrderWithLinks = ServiceOrder & {
  links?: { venda_item_id: number; uso_na_os: string }[]
}
export type CreateFinanciamentoResult = {
  success: boolean
  message: string
  errors?: Record<string, string[]>
}

export type OSPageData = {
  customer: Customer | null
  venda: Venda | null
  dependentes: Dependente[]
  oftalmologistas: Oftalmologista[]
  employees: Employee[]
  vendaItens: VendaItem[]
  existingOrders: ServiceOrderWithLinks[]
  preSaleAnalysisEnabled: boolean
}

export type GetOSPageDataResult = {
  success: boolean
  message?: string
  data?: OSPageData
}

export type SaveSOResult = {
  success: boolean
  message: string
  data?: ServiceOrder
  errors?: Record<string, string[]>
  timestamp?: number
}

// ==============================================================================
// SCHEMAS E TIPOS
// ==============================================================================

export type VendaPageData = {
  venda: Venda
  customer: Customer | null
  employee: Employee | null
  vendaItens: VendaItem[]
  serviceOrders: ServiceOrderWithLinks[]
  pagamentos: Pagamento[]
  financiamento: (Financiamento & { financiamento_parcelas: FinanciamentoParcela[] }) | null
  storeSettings: StoreSettings
  dependentes: Dependente[]
  oftalmologistas: Oftalmologista[]
  employees: Employee[]
  // CORREÃ‡ÃƒO: Agora são listas de Product
  lentes: Product[]
  armacoes: Product[]
  tratamentos: Product[]
}

export type GetVendaPageDataResult = {
  success: boolean
  message?: string
  data?: VendaPageData
}

// ================================================================
// 1. ACTION: BUSCAR DADOS DA PÃGINA DE OS
// ================================================================
export async function getOSPageData(
  vendaId: number,
  storeId: number,
  customerId: number
): Promise<GetOSPageDataResult> {
  const supabase = createAdminClient()

  try {
    const [
      customerRes,
      vendaRes,
      dependentesRes,
      oftalmosRes,
      employeesRes,
      itensRes,
      osRes,
      storeRes,
    ] = await Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).single(),
      supabase.from('vendas').select('*').eq('id', vendaId).single(),
      supabase.from('dependentes').select('*').eq('customer_id', customerId).order('full_name'),
      supabase.from('oftalmologistas').select('*').eq('store_id', storeId).order('nome_completo'),
      supabase.from('employees').select('*').eq('store_id', storeId).eq('is_active', true).order('full_name'),
      supabase.from('venda_itens').select('*').eq('venda_id', vendaId).order('id'),
      supabase.from('service_orders')
        .select('*, links:venda_itens_os_links(venda_item_id, uso_na_os)')
        .eq('venda_id', vendaId)
        .order('created_at'),
      supabase.from('stores').select('settings').eq('id', storeId).single(),
    ])

    if (customerRes.error) throw new Error(`Cliente: ${customerRes.error.message}`)
    const storeSettings = (storeRes.data as { settings?: unknown } | null)?.settings
    const preSaleAnalysisEnabled = ((storeSettings || {}) as StoreSettings).pre_sale_analysis_enabled === true

    const data: OSPageData = {
      customer: customerRes.data,
      venda: vendaRes.data,
      dependentes: dependentesRes.data || [],
      oftalmologistas: oftalmosRes.data || [],
      employees: employeesRes.data || [],
      vendaItens: itensRes.data || [],
      existingOrders: osRes.data || [],
      preSaleAnalysisEnabled,
    }

    return { success: true, data }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// ================================================================
// 2. ACTION: SALVAR OS (CORRIGIDA E COMPLETA)
// ================================================================
const ServiceOrderSchema = z.object({
  id: z.coerce.number().optional(),
  store_id: z.coerce.number(),
  venda_id: z.coerce.number(),
  customer_id: z.coerce.number(),
  dependente_id: z.coerce.number().optional().nullable(),
  oftalmologista_id: z.coerce.number().optional().nullable(),
  // Receita
  receita_longe_od_esferico: z.string().nullable(),
  receita_longe_od_cilindrico: z.string().nullable(),
  receita_longe_od_eixo: z.string().nullable(),
  receita_longe_oe_esferico: z.string().nullable(),
  receita_longe_oe_cilindrico: z.string().nullable(),
  receita_longe_oe_eixo: z.string().nullable(),
  receita_perto_od_esferico: z.string().nullable(),
  receita_perto_od_cilindrico: z.string().nullable(),
  receita_perto_od_eixo: z.string().nullable(),
  receita_perto_oe_esferico: z.string().nullable(),
  receita_perto_oe_cilindrico: z.string().nullable(),
  receita_perto_oe_eixo: z.string().nullable(),
  receita_adicao: z.string().nullable(),
  // Medidas
  medida_horizontal: z.string().nullable(),
  medida_vertical: z.string().nullable(),
  medida_diagonal: z.string().nullable(),
  medida_ponte: z.string().nullable(),
  medida_dnp_od: z.string().nullable(),
  medida_dnp_oe: z.string().nullable(),
  medida_altura_od: z.string().nullable(),
  medida_altura_oe: z.string().nullable(),
  medida_diametro: z.string().nullable(),
  medida_diametro_od: z.string().nullable(),
  medida_diametro_oe: z.string().nullable(),
  medida_palpebra_od: z.string().nullable(),
  medida_palpebra_oe: z.string().nullable(),
  medida_tipo_lente: z.string().nullable(),
  foto_medicao_url: z.string().nullable(),
  // Lab
  armacao_com_cliente: z.boolean().optional(),
  os_enviada_ao_lab: z.boolean().optional(),
  lab_nome: z.string().nullable(),
  lab_pedido_por_id: z.coerce.number().optional().nullable(),
  dt_pedido_em: z.string().nullable(),
  dt_lente_chegou: z.string().nullable(),
  dt_montado_em: z.string().nullable(),
  dt_entregue_em: z.string().nullable(),
  dt_prometido_para: z.string().nullable(),
  obs_os: z.string().nullable(),
  protocolo_fisico: z.string().optional().nullable(),
  source_optical_evaluation_id: z.coerce.number().optional().nullable(),
})

const ItemLinkSchema = z.object({
  item_id: z.coerce.number(),
  uso: z.enum(['lente_od', 'lente_oe', 'armacao']),
})

const PendingReservationSchema = z.object({
  slot: z.enum(['OD', 'OE']),
  variantId: z.coerce.number(),
  productId: z.coerce.number(),
  productName: z.string().optional(),
  variantName: z.string().optional(),
})

const parseDegreeValue = (value: string | null | undefined, fallback?: number) => {
  if (!value || !value.trim()) return fallback ?? null
  const parsed = parseFloat(value.replace(',', '.').replace('+', ''))
  return Number.isNaN(parsed) ? fallback ?? null : parsed
}

const parseAxisValue = (value: string | null | undefined) => {
  if (!value || !value.trim()) return null
  const parsed = parseInt(value.replace(/\D/g, ''), 10)
  return Number.isNaN(parsed) ? null : parsed
}

export async function saveServiceOrder(
  prevState: SaveSOResult,
  formData: FormData
): Promise<SaveSOResult> {
  const supabaseAdmin = createAdminClient()
  const { data: { user } } = await createClient().auth.getUser()

  if (!user) return { success: false, message: 'Usuário não autenticado.', timestamp: Date.now() }
  const { data: profile } = await supabaseAdmin.from('profiles').select('tenant_id, store_id').eq('id', user.id).single()
  if (!profile) return { success: false, message: 'Perfil não encontrado.', timestamp: Date.now() }

  const { tenant_id } = profile // Nota: Não usamos profile.store_id aqui para evitar o bug
  const nullIfEmpty = (val: unknown) => (val === '' ? null : val)
  const parseDate = (val: unknown) => (val && val !== '') ? new Date(val as string).toISOString() : null

  const validated = ServiceOrderSchema.safeParse({
    id: nullIfEmpty(formData.get('id')),

    // âœ… CORREÃ‡ÃƒO 1: Pegamos o store_id do FORMULÃRIO (Contexto Real), não do Perfil
    store_id: formData.get('store_id'),

    venda_id: formData.get('venda_id'),
    customer_id: formData.get('customer_id'),
    dependente_id: nullIfEmpty(formData.get('dependente_id')),
    oftalmologista_id: nullIfEmpty(formData.get('oftalmologista_id')),
    receita_longe_od_esferico: nullIfEmpty(formData.get('receita_longe_od_esferico')),
    receita_longe_od_cilindrico: nullIfEmpty(formData.get('receita_longe_od_cilindrico')),
    receita_longe_od_eixo: nullIfEmpty(formData.get('receita_longe_od_eixo')),
    receita_longe_oe_esferico: nullIfEmpty(formData.get('receita_longe_oe_esferico')),
    receita_longe_oe_cilindrico: nullIfEmpty(formData.get('receita_longe_oe_cilindrico')),
    receita_longe_oe_eixo: nullIfEmpty(formData.get('receita_longe_oe_eixo')),
    receita_perto_od_esferico: nullIfEmpty(formData.get('receita_perto_od_esferico')),
    receita_perto_od_cilindrico: nullIfEmpty(formData.get('receita_perto_od_cilindrico')),
    receita_perto_od_eixo: nullIfEmpty(formData.get('receita_perto_od_eixo')),
    receita_perto_oe_esferico: nullIfEmpty(formData.get('receita_perto_oe_esferico')),
    receita_perto_oe_cilindrico: nullIfEmpty(formData.get('receita_perto_oe_cilindrico')),
    receita_perto_oe_eixo: nullIfEmpty(formData.get('receita_perto_oe_eixo')),
    receita_adicao: nullIfEmpty(formData.get('receita_adicao')),
    medida_horizontal: nullIfEmpty(formData.get('medida_horizontal')),
    medida_vertical: nullIfEmpty(formData.get('medida_vertical')),
    medida_diagonal: nullIfEmpty(formData.get('medida_diagonal')),
    medida_ponte: nullIfEmpty(formData.get('medida_ponte')),
    medida_dnp_od: nullIfEmpty(formData.get('medida_dnp_od')),
    medida_dnp_oe: nullIfEmpty(formData.get('medida_dnp_oe')),
    medida_altura_od: nullIfEmpty(formData.get('medida_altura_od')),
    medida_altura_oe: nullIfEmpty(formData.get('medida_altura_oe')),
    medida_diametro: nullIfEmpty(formData.get('medida_diametro')),
    medida_diametro_od: nullIfEmpty(formData.get('medida_diametro_od')),
    medida_diametro_oe: nullIfEmpty(formData.get('medida_diametro_oe')),
    medida_palpebra_od: nullIfEmpty(formData.get('medida_palpebra_od')),
    medida_palpebra_oe: nullIfEmpty(formData.get('medida_palpebra_oe')),
    medida_tipo_lente: nullIfEmpty(formData.get('medida_tipo_lente')),
    foto_medicao_url: nullIfEmpty(formData.get('foto_medicao_url')),
    armacao_com_cliente: formData.get('armacao_com_cliente') === 'on',
    os_enviada_ao_lab: formData.get('os_enviada_ao_lab') === 'on',
    lab_nome: nullIfEmpty(formData.get('lab_nome')),
    lab_pedido_por_id: nullIfEmpty(formData.get('lab_pedido_por_id')),
    dt_pedido_em: parseDate(formData.get('dt_pedido_em')),
    dt_lente_chegou: parseDate(formData.get('dt_lente_chegou')),
    dt_montado_em: parseDate(formData.get('dt_montado_em')),
    dt_entregue_em: parseDate(formData.get('dt_entregue_em')),
    dt_prometido_para: parseDate(formData.get('dt_prometido_para')),
    obs_os: nullIfEmpty(formData.get('obs_os')),
    protocolo_fisico: nullIfEmpty(formData.get('protocolo_fisico')),
    source_optical_evaluation_id: nullIfEmpty(formData.get('source_optical_evaluation_id')),
  })

  if (!validated.success) {
    return { success: false, message: 'Erro de validação.', errors: validated.error.flatten().fieldErrors, timestamp: Date.now() }
  }

  const { id, ...osData } = validated.data
  let previousSourceEvaluationId: number | null = null

  if (id) {
    const { data: existingOrderLink } = await (supabaseAdmin.from('service_orders') as any)
      .select('source_optical_evaluation_id')
      .eq('id', id)
      .maybeSingle()

    previousSourceEvaluationId = existingOrderLink?.source_optical_evaluation_id ?? null
  }

  let itemLinks: z.infer<typeof ItemLinkSchema>[] = []
  try {
    const json = formData.get('item_links_json') as string
    if (json) {
      const parsed = JSON.parse(json)
      const validatedLinks = z.array(ItemLinkSchema).safeParse(parsed)
      if (!validatedLinks.success) {
        return { success: false, message: 'Erro nos vÃ­nculos de itens.', timestamp: Date.now() }
      }
      itemLinks = validatedLinks.data
    }
  } catch (e) {
    return { success: false, message: 'Erro nos vínculos de itens.', timestamp: Date.now() }
  }

  let pendingReservations: z.infer<typeof PendingReservationSchema>[] = []
  try {
    const json = formData.get('pending_reservations_json') as string
    if (json) {
      const parsed = JSON.parse(json)
      const validatedPending = z.array(PendingReservationSchema).safeParse(parsed)
      if (validatedPending.success) {
        pendingReservations = validatedPending.data
      }
    }
  } catch (e) {
    console.error('Erro ao ler reservas pendentes da OS:', e)
  }

  try {
    const payload: any = { ...osData, tenant_id: (profile as any).tenant_id }
    let savedId: number

    if (id) {
      if (!payload.protocolo_fisico) payload.protocolo_fisico = id.toString();
      const { error } = await (supabaseAdmin.from('service_orders') as any).update(payload).eq('id', id).select().single()
      if (error) throw error
      savedId = id
    } else {
      const { data, error } = await (supabaseAdmin.from('service_orders') as any).insert(payload).select('id').single()
      if (error) throw error
      savedId = data.id
      if (!payload.protocolo_fisico) await (supabaseAdmin.from('service_orders') as any).update({ protocolo_fisico: savedId.toString() }).eq('id', savedId)
    }

    if (payload.dt_entregue_em) {
      await clearNfcTrayLinkForDeliveredOrder(savedId, payload.dt_entregue_em)
    }

    // Limpa vínculos antigos
    await supabaseAdmin.from('venda_itens_os_links').delete().eq('service_order_id', savedId)

    // Insere novos vínculos
    if (itemLinks.length > 0) {
      const linksToInsert = itemLinks.map((link) => ({
        tenant_id: tenant_id,
        store_id: osData.store_id, // âœ… CORREÃ‡ÃƒO 2: Usa o store_id validado (correto), não o do profile
        service_order_id: savedId,
        venda_item_id: link.item_id,
        uso_na_os: link.uso
      }))

      const { error: linkError } = await (supabaseAdmin.from('venda_itens_os_links') as any).insert(linksToInsert as any)
      if (linkError) {
        console.error("Erro ao salvar links:", linkError)
      }
    }

    const reservationErrors: string[] = []
    const reservationDebug: string[] = []
    const pendingReservationBySlot = new Map<LensReservationSlot, z.infer<typeof PendingReservationSchema>>()
    pendingReservations.forEach((reservation) => {
      pendingReservationBySlot.set(reservation.slot, reservation)
    })

    const linkedLensItemIds = itemLinks
      .filter((link) => link.uso === 'lente_od' || link.uso === 'lente_oe')
      .map((link) => link.item_id)

    const linkedLensItemsById = new Map<number, { id: number; product_id: number | null }>()
    if (linkedLensItemIds.length > 0) {
      const { data: linkedLensItems } = await (supabaseAdmin.from('venda_itens') as any)
        .select('id, product_id')
        .in('id', linkedLensItemIds)

      ;(linkedLensItems || []).forEach((item: any) => {
        linkedLensItemsById.set(item.id, item)
      })
    }

    const { data: vendaForReservation } = await (supabaseAdmin.from('vendas') as any)
      .select('employee_id')
      .eq('id', osData.venda_id)
      .maybeSingle()

    let reservationEmployeeId = vendaForReservation?.employee_id || null
    if (!reservationEmployeeId) {
      const { data: firstEmployee } = await (supabaseAdmin.from('employees') as any)
        .select('id')
        .eq('store_id', osData.store_id)
        .eq('is_active', true)
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle()

      reservationEmployeeId = firstEmployee?.id || null
    }

    const reservationSlots: Array<{
      slot: LensReservationSlot
      itemUso: 'lente_od' | 'lente_oe'
      esferico: string | null
      cilindrico: string | null
      eixo: string | null
    }> = [
      {
        slot: 'OD',
        itemUso: 'lente_od',
        esferico: osData.receita_longe_od_esferico,
        cilindrico: osData.receita_longe_od_cilindrico,
        eixo: osData.receita_longe_od_eixo,
      },
      {
        slot: 'OE',
        itemUso: 'lente_oe',
        esferico: osData.receita_longe_oe_esferico,
        cilindrico: osData.receita_longe_oe_cilindrico,
        eixo: osData.receita_longe_oe_eixo,
      },
    ]

    for (const reservationSlot of reservationSlots) {
      const pendingReservation = pendingReservationBySlot.get(reservationSlot.slot)

      if (!reservationEmployeeId && pendingReservation) {
        reservationDebug.push(`${reservationSlot.slot}=sem-funcionario-manual`)
        reservationErrors.push(`Olho ${reservationSlot.slot}: nenhum funcionÃ¡rio ativo disponÃ­vel para registrar a reserva.`)
        continue
      }

      if (pendingReservation && reservationEmployeeId) {
        const manualResult = await reserveLensByAdmin(
          osData.store_id,
          pendingReservation.variantId,
          pendingReservation.productId,
          savedId,
          reservationEmployeeId,
          user.id,
          tenant_id,
          { slot: reservationSlot.slot, source: 'manual' }
        )

        if (!manualResult.success) {
          reservationErrors.push(`Olho ${reservationSlot.slot}: ${manualResult.message}`)
          reservationDebug.push(`${reservationSlot.slot}=manual-erro:${manualResult.message}`)
        } else {
          reservationDebug.push(`${reservationSlot.slot}=manual-ok:${pendingReservation.variantId}`)
        }
        continue
      }

      const itemLink = itemLinks.find((link) => link.uso === reservationSlot.itemUso)
      const linkedItem = itemLink ? linkedLensItemsById.get(itemLink.item_id) : null
      const esferico = parseDegreeValue(reservationSlot.esferico)
      const cilindrico = parseDegreeValue(reservationSlot.cilindrico, 0)

      if (!linkedItem?.product_id || esferico === null || cilindrico === null) {
        reservationDebug.push(`${reservationSlot.slot}=sem-dados`)
        continue
      }
      if (!reservationEmployeeId) {
        reservationDebug.push(`${reservationSlot.slot}=sem-funcionario-auto`)
        reservationErrors.push(`Olho ${reservationSlot.slot}: nenhum funcionÃ¡rio ativo disponÃ­vel para registrar a reserva.`)
        continue
      }

      const currentReservation = await getLensReservationForOsSlot(savedId, reservationSlot.slot)
      if (currentReservation?.tipo === 'Saida') {
        reservationDebug.push(`${reservationSlot.slot}=ja-saida`)
        continue
      }
      if (
        currentReservation?.tipo === 'Reserva' &&
        typeof currentReservation.motivo === 'string' &&
        currentReservation.motivo.includes('Reserva manual')
      ) {
        reservationDebug.push(`${reservationSlot.slot}=mantida-manual`)
        continue
      }

      const stockMatches = await checkLensStock(
        osData.store_id,
        esferico,
        cilindrico,
        linkedItem.product_id,
        parseDegreeValue(osData.receita_adicao),
        reservationSlot.slot,
        parseAxisValue(reservationSlot.eixo)
      )

      if (!stockMatches.targetProductHasGrid || !stockMatches.autoReserveCandidate) {
        reservationDebug.push(`${reservationSlot.slot}=sem-candidato-auto`)
        continue
      }

      const autoReserveResult = await reserveLensByAdmin(
        osData.store_id,
        stockMatches.autoReserveCandidate.variant_id,
        stockMatches.autoReserveCandidate.product_id,
        savedId,
        reservationEmployeeId,
        user.id,
        tenant_id,
        { slot: reservationSlot.slot, source: 'automatic' }
      )

      if (!autoReserveResult.success) {
        reservationErrors.push(`Olho ${reservationSlot.slot}: ${autoReserveResult.message}`)
        reservationDebug.push(`${reservationSlot.slot}=auto-erro:${autoReserveResult.message}`)
      } else {
        reservationDebug.push(`${reservationSlot.slot}=auto-ok:${stockMatches.autoReserveCandidate.variant_id}`)
      }
    }

    const nextSourceEvaluationId = payload.source_optical_evaluation_id ?? null

    if (previousSourceEvaluationId && previousSourceEvaluationId !== nextSourceEvaluationId) {
      const { error: unlinkError } = await (supabaseAdmin.from('optical_evaluations') as any)
        .update({ exported_service_order_id: null, updated_at: new Date().toISOString() })
        .eq('id', previousSourceEvaluationId)
        .eq('store_id', osData.store_id)

      if (unlinkError) throw unlinkError
    }

    if (nextSourceEvaluationId) {
      const { data: linkedEvaluation, error: linkedEvaluationError } = await (supabaseAdmin.from('optical_evaluations') as any)
        .select('id, store_id, evaluated_customer_id, evaluated_dependente_id, exported_service_order_id')
        .eq('id', nextSourceEvaluationId)
        .eq('store_id', osData.store_id)
        .maybeSingle()

      if (linkedEvaluationError || !linkedEvaluation) {
        throw new Error('Avaliação vinculada não encontrada para esta loja.')
      }

      const matchesSubject =
        (osData.dependente_id && linkedEvaluation.evaluated_dependente_id === osData.dependente_id) ||
        (!osData.dependente_id && linkedEvaluation.evaluated_customer_id === osData.customer_id)

      if (!matchesSubject) {
        throw new Error('A avaliação selecionada não pertence ao paciente desta OS.')
      }

      if (linkedEvaluation.exported_service_order_id && linkedEvaluation.exported_service_order_id !== savedId) {
        throw new Error('A avaliação selecionada já está vinculada a outra OS.')
      }

      const { error: linkError } = await (supabaseAdmin.from('optical_evaluations') as any)
        .update({ exported_service_order_id: savedId, updated_at: new Date().toISOString() })
        .eq('id', nextSourceEvaluationId)
        .eq('store_id', osData.store_id)

      if (linkError) throw linkError
    }

    revalidatePath(`/dashboard/loja/${osData.store_id}/vendas/${osData.venda_id}/os`)
    revalidatePath(`/dashboard/loja/${osData.store_id}/vendas/${osData.venda_id}`)
    revalidatePath(`/dashboard/loja/${osData.store_id}/avaliacao`)

    const { data: finalOS } = await supabaseAdmin
      .from('service_orders')
      .select('*, links:venda_itens_os_links(venda_item_id, uso_na_os)')
      .eq('id', savedId)
      .single()

    const saveMessage = reservationErrors.length > 0
      ? `OS salva com sucesso! Atenção: ${reservationErrors.join(' ')}`
      : `OS salva com sucesso!`

    return { success: true, message: saveMessage, data: finalOS as any, timestamp: Date.now() }
  } catch (error: any) {
    return { success: false, message: `Erro no banco: ${error.message}`, timestamp: Date.now() }
  }
}

// ================================================================
// 3. ACTION: DELETAR OS
// ================================================================
export async function deleteServiceOrder(id: number, storeId: number, vendaId: number): Promise<SaveSOResult> {
  const supabaseAdmin = createAdminClient()
  try {
    const { data: orderToDelete } = await (supabaseAdmin.from('service_orders') as any)
      .select('source_optical_evaluation_id')
      .eq('id', id)
      .maybeSingle()

    if (orderToDelete?.source_optical_evaluation_id) {
      const { error: unlinkError } = await (supabaseAdmin.from('optical_evaluations') as any)
        .update({ exported_service_order_id: null, updated_at: new Date().toISOString() })
        .eq('id', orderToDelete.source_optical_evaluation_id)
        .eq('store_id', storeId)

      if (unlinkError) throw unlinkError
    }

    const { data: linkedPostSale } = await (supabaseAdmin.from('post_sales') as any)
      .select('id')
      .eq('service_order_id', id)
      .limit(1)

    if (linkedPostSale && linkedPostSale.length > 0) {
      return {
        success: false,
        message: 'Esta OS possui registro de pos-venda vinculado e nao pode ser excluida automaticamente.',
        timestamp: Date.now()
      }
    }

    const reservationRelease = await releaseReservationsForServiceOrder(id, vendaId)
    if (!reservationRelease.success) {
      return { success: false, message: reservationRelease.message, timestamp: Date.now() }
    }

    const { error: linksDeleteError } = await (supabaseAdmin.from('venda_itens_os_links') as any)
      .delete()
      .eq('service_order_id', id)

    if (linksDeleteError) throw linksDeleteError

    const { data: linkedFiscalInvoice } = await (supabaseAdmin.from('fiscal_invoices') as any)
      .select('id, status, tipo_documento')
      .eq('work_order_id', id)
      .limit(1)

    if (linkedFiscalInvoice && linkedFiscalInvoice.length > 0) {
      return {
        success: false,
        message: 'Esta OS possui documento fiscal vinculado e nao pode ser excluida automaticamente.',
        timestamp: Date.now()
      }
    }

    const { error } = await supabaseAdmin.from('service_orders').delete().eq('id', id)
    if (error) throw error

    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}/os`)
    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`)
    revalidatePath(`/dashboard/loja/${storeId}/avaliacao`)

    return { success: true, message: 'OS excluída.', timestamp: Date.now() }
  } catch (e: any) {
    if (e?.code === '23503') {
      return {
        success: false,
        message: 'Nao foi possivel excluir a OS porque ainda existem registros vinculados a ela. Verifique estoque, pos-venda ou documentos fiscais.',
        timestamp: Date.now()
      }
    }

    return { success: false, message: e.message, timestamp: Date.now() }
  }
}

// ================================================================
// 4. ACTIONS: BUSCAR CLIENTES (COM VERIFICAÃ‡ÃƒO DE DÃVIDA)
// ================================================================

export type CustomerSearchResult = Pick<Customer, 'id' | 'full_name' | 'cpf' | 'fone_movel' | 'obs_debito'> & {
  tem_pendencia?: boolean
}

export type SearchCustomersResult = {
  success: boolean
  message?: string
  data?: CustomerSearchResult[]
}

export type GetCustomerResult = {
  success: boolean
  message?: string
  data?: Customer
}

// Função auxiliar para checar dívidas dos clientes listados
async function verificarPendenciasEmMassa(clientes: any[], storeId: number) {
  if (!clientes || clientes.length === 0) return clientes;

  const supabaseAdmin = createAdminClient();
  const ids = clientes.map(c => c.id);
  const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Busca quem tem parcela pendente e vencida
  const { data: devedores } = await supabaseAdmin
    .from('financiamento_parcelas')
    .select('customer_id')
    .eq('store_id', storeId)
    .in('customer_id', ids)
    .eq('status', 'Pendente')
    .gt('valor_parcela', 0.01)
    .lt('data_vencimento', hoje); // Vencimento MENOR que hoje (Atrasado)

  // Cria um Set para busca rápida
  const idsDevedores = new Set(devedores?.map(d => (d as any).customer_id));

  // Retorna clientes com a flag true/false
  return clientes.map(c => ({
    ...c,
    tem_pendencia: idsDevedores.has(c.id)
  }));
}

// 1. Busca Padrão (Lista Inicial)
export async function fetchDefaultCustomers(storeId: number): Promise<SearchCustomersResult> {
  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, full_name, cpf, fone_movel, obs_debito')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return { success: false, message: error.message }
  }

  // Injeta a verificação de dívida
  const dataComPendencia = await verificarPendenciasEmMassa(data, storeId);

  return { success: true, data: dataComPendencia as any }
}

// 2. Busca por Nome ou CPF
export async function searchCustomersByName(
  query: string,
  storeId: number
): Promise<SearchCustomersResult> {
  const supabaseAdmin = createAdminClient()
  const termo = query.trim()

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, full_name, cpf, fone_movel, obs_debito')
    .eq('store_id', storeId)
    .or(`full_name.ilike.%${termo}%,cpf.ilike.%${termo}%`)
    .order('full_name')
    .limit(50)

  if (error) {
    return { success: false, message: error.message }
  }

  // Injeta a verificação de dívida
  const dataComPendencia = await verificarPendenciasEmMassa(data, storeId);

  return { success: true, data: dataComPendencia as any }
}

// 3. Busca por ID (Detalhes) - Mantida igual, pois é detalhe único
export async function getCustomerById(
  customerId: number
): Promise<GetCustomerResult> {
  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single()

  if (error) {
    return { success: false, message: error.message }
  }
  return { success: true, data }
}

// ================================================================
// 5. ACTION: CRIAR NOVA VENDA (COM RANKING AUTOMÃTICO)
// ================================================================

export async function createNewVenda(
  customerId: number,
  employeeId?: number | null
): Promise<CreateVendaResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { return { success: false, message: 'Usuário não autenticado.' } }

  const profile: any = await getProfileByAdmin(user.id)
  if (!profile || !profile.tenant_id || !profile.store_id) {
    return { success: false, message: 'Perfil do usuário não encontrado.' }
  }

  const vendaData = {
    tenant_id: profile.tenant_id,
    store_id: profile.store_id,
    customer_id: customerId,
    employee_id: (employeeId ?? null) as number | null,
    created_by_user_id: user.id,
    status: 'Em Aberto',
    valor_total: 0,
    valor_desconto: 0,
    valor_final: 0,
  }

  const supabaseAdmin = createAdminClient();

  try {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)

    const { data: recentOpenEvaluation, error: recentEvaluationError } = await (supabaseAdmin.from('optical_evaluations') as any)
      .select('id, updated_at')
      .eq('store_id', profile.store_id)
      .is('exported_venda_id', null)
      .is('outcome_status', null)
      .gte('updated_at', cutoff.toISOString())
      .or(`evaluated_customer_id.eq.${customerId},responsible_customer_id.eq.${customerId}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentEvaluationError) throw recentEvaluationError

    if (recentOpenEvaluation) {
      return {
        success: false,
        message: 'Este cliente possui uma avaliacao aberta nos ultimos 7 dias. Continue pela tela de avaliacao para manter venda, OS e grau vinculados.',
        blockedEvaluationId: recentOpenEvaluation.id,
        blockedEvaluationUpdatedAt: recentOpenEvaluation.updated_at,
      }
    }

    const { data, error } = await (supabaseAdmin.from('vendas') as any)
      .insert(vendaData)
      .select()
      .single()

    if (error) throw error

    // --- NOVO: ATUALIZA RANKING ---
    // Assim que cria a venda, já recalculamos o cliente
    if (data && data.customer_id) {
      await atualizarRankingCliente(data.customer_id)
    }
    // ------------------------------

    return { success: true, message: 'Venda iniciada.', data }
  }
  catch (error: any) {
    return { success: false, message: `Erro ao criar venda: ${error.message}` }
  }
}

// ================================================================
// 6. ACTION: BUSCAR DADOS DA PÃGINA DE VENDA (ATUALIZADO PARA UNIFICAÃ‡ÃƒO)
// ================================================================
export async function getVendaPageData(
  vendaId: number,
  storeId: number
): Promise<GetVendaPageDataResult> {
  const supabaseAdmin = createAdminClient()

  try {
    const { data: venda, error: vendaError } = await supabaseAdmin
      .from('vendas')
      .select('*')
      .eq('id', vendaId)
      .eq('store_id', storeId)
      .single()

    if (vendaError || !venda) {
      return { success: false, message: `Venda não encontrada: ${vendaError?.message}`, }
    }

    const { customer_id, employee_id } = venda

    const [
      customerRes,
      employeeRes,
      itensRes,
      osRes,
      pagamentosRes,
      financiamentoRes,
      storeRes,
      dependentesRes,
      oftalmosRes,
      employeesRes,
      // BUSCA AGORA NA TABELA PRODUCTS COM FILTRO
      lentesRes,
      armacoesRes,
      tratamentosRes,
    ] = await Promise.all([
      supabaseAdmin.from('customers').select('*').eq('id', customer_id).single(),
      employee_id ? supabaseAdmin.from('employees').select('*').eq('id', employee_id).single() : Promise.resolve({ data: null }),
      supabaseAdmin.from('venda_itens').select('*').eq('venda_id', vendaId).order('id'),
      supabaseAdmin.from('service_orders')
        .select('*, links:venda_itens_os_links(venda_item_id, uso_na_os)')
        .eq('venda_id', vendaId)
        .order('created_at'),
      // CORREÇÃO: Cast 'as any' para buscar relacionamento com employees
      (supabaseAdmin.from('pagamentos') as any).select('*, employee:employees(full_name)').eq('venda_id', vendaId).order('data_pagamento'),
      supabaseAdmin.from('financiamento_loja').select('*, financiamento_parcelas(*), employee:employees(full_name)').eq('venda_id', vendaId).maybeSingle(),
      supabaseAdmin.from('stores').select('settings').eq('id', storeId).single(),
      supabaseAdmin.from('dependentes').select('*').eq('customer_id', customer_id).order('full_name'),
      supabaseAdmin.from('oftalmologistas').select('*').eq('store_id', storeId).order('nome_completo'),
      supabaseAdmin.from('employees').select('*').eq('store_id', storeId).eq('is_active', true).order('full_name'),

      // Consultas unificadas
      supabaseAdmin.from('products').select('*').eq('store_id', storeId).eq('tipo_produto', 'Lente'),
      supabaseAdmin.from('products').select('*').eq('store_id', storeId).eq('tipo_produto', 'Armacao'),
      supabaseAdmin.from('products').select('*').eq('store_id', storeId).eq('tipo_produto', 'Tratamento'),
    ])

    console.log('[DEBUG] VendaID:', vendaId)
    console.log('[DEBUG] FinanciamentoRes:', financiamentoRes.data ? 'ENCONTRADO' : 'NULO')
    if (financiamentoRes.error) console.error('[DEBUG] Erro Financiamento:', financiamentoRes.error)
    if (pagamentosRes.error) console.error('[DEBUG] Erro Pagamentos:', pagamentosRes.error)

    let financiamentoData: any = financiamentoRes.data as any

    // Fallback defensivo: em alguns cenários o embed `financiamento_parcelas(*)`
    // pode vir vazio mesmo havendo parcelas. Nessa situação, busca direto pela tabela.
    if (
      financiamentoData?.id &&
      (!Array.isArray(financiamentoData.financiamento_parcelas) || financiamentoData.financiamento_parcelas.length === 0)
    ) {
      const { data: parcelasDiretas, error: parcelasDiretasError } = await (supabaseAdmin
        .from('financiamento_parcelas') as any)
        .select('*')
        .eq('financiamento_id', financiamentoData.id)
        .order('numero_parcela', { ascending: true })

      if (!parcelasDiretasError && Array.isArray(parcelasDiretas)) {
        financiamentoData = {
          ...financiamentoData,
          financiamento_parcelas: parcelasDiretas
        }
      }
    }

    const data: VendaPageData = {
      venda,
      customer: customerRes.data,
      employee: employeeRes.data,
      vendaItens: itensRes.data || [],
      serviceOrders: osRes.data || [],
      pagamentos: pagamentosRes.data as any || [], // Cast as any para aceitar o campo employee extra
      financiamento: financiamentoData,
      storeSettings: ((storeRes.data as { settings?: unknown } | null)?.settings || {}) as StoreSettings,
      dependentes: dependentesRes.data || [],
      oftalmologistas: oftalmosRes.data || [],
      employees: employeesRes.data || [],
      lentes: lentesRes.data || [],
      armacoes: armacoesRes.data || [],
      tratamentos: tratamentosRes.data || [],
    }

    return { success: true, data }
  } catch (error: any) {
    console.error("ERRO FATAL NA BUSCA DE VENDA:", error);
    return { success: false, message: 'Falha na busca interna de dados.' }
  }
}

// ================================================================
// 7. ACTION: ADICIONAR ITEM Ã€ VENDA (CORRIGIDO COM 'AS ANY')
// ================================================================
const VendaItemSchema = z.object({
  venda_id: z.coerce.number(),
  item_tipo: z.enum(['Lente', 'Armacao', 'Tratamento', 'Servico', 'Outro', 'Solar']),
  descricao: z.string().min(1, { message: 'Descrição é obrigatória.' }),
  lente_id: z.coerce.number().optional().nullable(),
  armacao_id: z.coerce.number().optional().nullable(),
  tratamento_id: z.coerce.number().optional().nullable(),
  quantidade: z.coerce.number().min(1),
  valor_unitario: z.coerce.number(),
  unidade: z.string().optional().default('Unidade'),
})

export type SaveVendaItemResult = {
  success: boolean
  message: string
  data?: VendaItem
  errors?: Record<string, string[]>
  timestamp?: number
}

export async function addVendaItem(
  prevState: SaveVendaItemResult,
  formData: FormData
): Promise<SaveVendaItemResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Usuário não autenticado.' }

  const profile = await getProfileByAdmin(user.id)
  if (!profile) return { success: false, message: 'Perfil não encontrado.' }

  const nullIfEmpty = (val: unknown) => (val === '' ? null : val)

  const validatedFields = VendaItemSchema.safeParse({
    venda_id: formData.get('venda_id'),
    item_tipo: formData.get('item_tipo'),
    descricao: formData.get('descricao'),
    lente_id: nullIfEmpty(formData.get('lente_id')),
    armacao_id: nullIfEmpty(formData.get('armacao_id')),
    tratamento_id: nullIfEmpty(formData.get('tratamento_id')),
    quantidade: formData.get('quantidade'),
    valor_unitario: formData.get('valor_unitario'),
    unidade: formData.get('unidade'),
  })

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Erro de validação.',
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }

  const data = validatedFields.data

  // Validação: Exigir Produto do Banco para tipos específicos
  const requiresProductId = ['Lente', 'Armacao', 'Solar', 'Tratamento'].includes(data.item_tipo);
  if (requiresProductId && !data.lente_id && !data.armacao_id && !data.tratamento_id) {
    return {
      success: false,
      message: 'Você precisa selecionar um produto válido do catálogo para este tipo de item.',
      timestamp: Date.now()
    }
  }

  const valor_total_item = data.quantidade * data.valor_unitario

  // Definimos o ID do produto unificado
  const productId = data.lente_id || data.armacao_id || data.tratamento_id;

  // Montamos o objeto (sem tipagem estrita para evitar o erro 'never')
  const itemToInsert = {
    venda_id: data.venda_id,
    product_id: productId,
    variant_id: null,
    item_tipo: data.item_tipo,
    descricao: data.descricao,
    quantidade: data.quantidade,
    valor_unitario: data.valor_unitario,
    valor_total_item: valor_total_item,
    unidade: data.unidade,
    tenant_id: (profile as any).tenant_id, // Forçamos aqui
    store_id: (profile as any).store_id,   // CORREÃ‡ÃƒO: Forçamos aqui também
    detalhes_avulsos: { original_price: data.valor_unitario } // Salva preço original para cálculos de desconto
  }

  const supabaseAdmin = createAdminClient();

  try {
    // CORREÃ‡ÃƒO 1: Usamos (as any) na chamada da tabela
    const { data: newItem, error: itemError } = await (supabaseAdmin.from('venda_itens') as any)
      .insert(itemToInsert)
      .select()
      .single()

    if (itemError) throw itemError
    if (!newItem) throw new Error('Falha ao inserir item.')

    // CORREÃ‡ÃƒO 2: Cast no supabaseAdmin para o RPC funcionar sem reclamar
    const { error: rpcError } = await (supabaseAdmin as any).rpc('update_venda_financeiro', {
      p_venda_id: data.venda_id,
    })

    if (rpcError) throw new Error(`Erro ao recalcular total: ${rpcError.message}`)

    await calcularERegistrarComissao(data.venda_id)

    // CORREÃ‡ÃƒO 3: Cast no profile para o revalidatePath
    revalidatePath(`/dashboard/loja/${(profile as any).store_id
      } / vendas`)
    revalidatePath(`/ dashboard / loja / ${(profile as any).store_id
      } /vendas/${data.venda_id} `)
    revalidatePath(`/dashboard/loja/${(profile as any).store_id}/financeiro/comissoes`)

    return { success: true, message: 'Item adicionado!', data: newItem as any }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// ================================================================
// 8. ACTION: DELETAR ITEM DA VENDA
// ================================================================
export type DeleteVendaItemResult = {
  success: boolean
  message: string
}

export async function deleteVendaItem(
  itemId: number,
  vendaId: number,
  storeId: number
): Promise<DeleteVendaItemResult> {
  const supabaseAdmin = createAdminClient()

  try {
    const { error: deleteError } = await supabaseAdmin
      .from('venda_itens')
      .delete()
      .eq('id', itemId)

    if (deleteError) throw deleteError

    // CORREÃ‡ÃƒO: Usamos (as any) para o RPC funcionar sem erro de tipagem
    const { error: rpcError } = await (supabaseAdmin as any).rpc('update_venda_financeiro', {
      p_venda_id: vendaId,
    })

    if (rpcError) throw new Error(`Erro ao recalcular total: ${rpcError.message} `)

    await calcularERegistrarComissao(vendaId)

    revalidatePath(`/ dashboard / loja / ${storeId}/vendas`)
    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`)
    revalidatePath(`/dashboard/loja/${storeId}/financeiro/comissoes`)

    return { success: true, message: 'Item removido.' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// ================================================================
// 9. ACTION: ADICIONAR PAGAMENTO (CORRIGIDA: ARREDONDAMENTO)
// ================================================================

// MANTENHA O SCHEMA AQUI FORA (Se já tiver no arquivo, não precisa duplicar, mas certifique-se que ele existe)
const PagamentoSchema = z.object({
  venda_id: z.coerce.number(),
  customer_id: z.coerce.number(),
  employee_id: z.coerce.number(),
  forma_pagamento: z.string().min(1, { message: 'Forma de pagamento é obrigatória.' }),
  valor_pago: z.coerce.number().min(0.01, { message: 'Valor deve ser positivo.' }),
  parcelas: z.coerce.number().min(1),
  data_pagamento: z.string(),
  obs: z.string().optional().nullable(),
})

export type SavePagamentoResult = {
  success: boolean
  message: string
  data?: Pagamento
  errors?: Record<string, string[]>
  timestamp?: number
}

export async function addPagamento(
  prevState: SavePagamentoResult,
  formData: FormData
): Promise<SavePagamentoResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Usuário não autenticado.' }

  const profile = await getProfileByAdmin(user.id)
  if (!profile) return { success: false, message: 'Perfil não encontrado.' }

  const { tenant_id, store_id } = profile

  const valorRaw = formData.get('valor_pago') as string;
  const valorLimpo = valorRaw
    ? parseFloat(valorRaw.replace(/\./g, '').replace(',', '.'))
    : 0;

  const validatedFields = PagamentoSchema.safeParse({
    venda_id: formData.get('venda_id'),
    customer_id: formData.get('customer_id'),
    employee_id: formData.get('employee_id'),
    forma_pagamento: formData.get('forma_pagamento'),
    valor_pago: valorLimpo,
    parcelas: formData.get('parcelas'),
    data_pagamento: formData.get('data_pagamento'),
    obs: formData.get('obs'),
  })

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Erro de validação. Verifique o valor e campos.',
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }

  const { venda_id, ...pagamentoData } = validatedFields.data

  const supabaseAdmin = createAdminClient();

  // --- LÃ“GICA DE CRÃ‰DITO (Carteira do Cliente) ---
  if (pagamentoData.forma_pagamento === 'Crédito em Loja') {
    const fdWallet = new FormData()
    fdWallet.append('store_id', String(store_id))
    fdWallet.append('customer_id', String(pagamentoData.customer_id))
    fdWallet.append('amount', String(pagamentoData.valor_pago))
    fdWallet.append('description', `Pagamento na Venda #${venda_id}`)
    fdWallet.append('employee_id', String(pagamentoData.employee_id))
    fdWallet.append('related_venda_id', String(venda_id))

    const resWallet = await useCredit(fdWallet)
    if (!resWallet.success) {
      return { success: false, message: resWallet.message }
    }
  }
  // -----------------------------------------------

  // --- CORREÇÃO DA DATA: Forçamos o created_at a seguir a data escolhida ---
  // Adicionamos T12:00:00Z para garantir que caia no dia correto em qualquer fuso (Brasil é UTC-3)
  const dataIso = new Date(`${pagamentoData.data_pagamento}T12:00:00Z`).toISOString();

  const pagToInsert = {
    ...pagamentoData,
    venda_id,
    tenant_id,
    store_id,
    created_by_user_id: user.id,
    created_at: dataIso, // Sobrescreve o default now() do banco
  }

  try {
    // 1. Inserir na tabela de pagamentos (Isso baixa o saldo da venda)
    const { data: newPagamento, error: pagError } = await (supabaseAdmin.from('pagamentos') as any)
      .insert(pagToInsert)
      .select()
      .single()

    if (pagError) throw pagError
    if (!newPagamento) throw new Error('Falha ao registrar pagamento.')

    // 2. NOVO: Se for Cartão Crédito ou Cheque-Pré, lançar no Contas a Receber
    const forma = pagamentoData.forma_pagamento;
    if (forma === 'Cartão Crédito' || forma === 'Cheque-Pré') {
      const qtdParcelas = pagamentoData.parcelas;
      const valorTotal = pagamentoData.valor_pago;

      // --- CÃLCULO DE CENTAVOS (CORREÃ‡ÃƒO) ---
      const valorParcelaBase = Math.floor((valorTotal / qtdParcelas) * 100) / 100;
      const diferenca = parseFloat((valorTotal - (valorParcelaBase * qtdParcelas)).toFixed(2));

      const receivables = [];
      const dataBase = new Date(pagamentoData.data_pagamento);

      for (let i = 0; i < qtdParcelas; i++) {
        const vencimento = new Date(dataBase);
        vencimento.setDate(vencimento.getDate() + (i * 30));

        // Adiciona a diferença na primeira parcela para fechar a conta exata
        let valorDestaParcela = valorParcelaBase;
        if (i === 0) {
          valorDestaParcela += diferenca;
        }

        receivables.push({
          tenant_id: tenant_id,
          store_id: store_id,
          description: `Venda #${venda_id} - ${forma} (${i + 1}/${qtdParcelas})`,
          amount: parseFloat(valorDestaParcela.toFixed(2)),
          due_date: vencimento.toISOString().split('T')[0],
          status: 'Pendente',
          type: forma,
          origin_payment_id: newPagamento.id
        });
      }

      await (supabaseAdmin.from('accounts_receivable') as any).insert(receivables);
    }

    // 3. Atualiza saldo da venda
    const { error: rpcError } = await (supabaseAdmin as any).rpc('update_venda_financeiro', {
      p_venda_id: venda_id,
    })

    if (rpcError) throw new Error(`Erro ao recalcular total: ${rpcError.message}`)

    // 4. Recalcula comissão (caso tenha % por recebimento ou % garantida mudada pelo pagamento)
    await calcularERegistrarComissao(venda_id)
    await calcularComissaoMedico(venda_id)

    revalidatePath(`/dashboard/loja/${store_id}/vendas`)
    revalidatePath(`/dashboard/loja/${store_id}/vendas/${venda_id}`)
    revalidatePath(`/dashboard/loja/${store_id}/financeiro/comissoes`)

    return { success: true, message: 'Pagamento registrado!', data: newPagamento as any, timestamp: Date.now() }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// ================================================================
// 10. ACTION: DELETAR PAGAMENTO (CORRIGIDA: LIMPA RECEBÃVEIS)
// ================================================================
export type DeletePagamentoResult = {
  success: boolean
  message: string
}

export async function deletePagamento(
  pagamentoId: number,
  vendaId: number,
  storeId: number
): Promise<DeletePagamentoResult> {
  // CORREÃ‡ÃƒO: Usamos AdminClient para evitar Loop de RLS
  const supabaseAdmin = createAdminClient()

  try {
    // 1. NOVO: Antes de apagar o pagamento, apaga os recebíveis (Cartão/Cheque) vinculados a ele
    const { error: deleteReceivablesError } = await supabaseAdmin
      .from('accounts_receivable')
      .delete()
      .eq('origin_payment_id', pagamentoId);

    if (deleteReceivablesError) {
      console.error("Erro ao limpar recebíveis:", deleteReceivablesError);
    }

    // 2. Apaga o pagamento principal
    const { error: deleteError } = await supabaseAdmin
      .from('pagamentos')
      .delete()
      .eq('id', pagamentoId)

    if (deleteError) throw deleteError

    // 3. Recalcula o saldo da venda (RPC)
    const { error: rpcError } = await (supabaseAdmin as any).rpc('update_venda_financeiro', {
      p_venda_id: vendaId,
    })

    if (rpcError) throw new Error(`Erro ao recalcular total: ${rpcError.message}`)

    await calcularERegistrarComissao(vendaId)

    revalidatePath(`/dashboard/loja/${storeId}/vendas`)
    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`)
    revalidatePath(`/dashboard/loja/${storeId}/financeiro/comissoes`)

    return { success: true, message: 'Pagamento removido.' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}
// ================================================================
// HELPER: REGISTRAR SAÍDA DE ESTOQUE AO FECHAR VENDA
// Centraliza a baixa de estoque + log em stock_movements
// ================================================================
async function registrarSaidaVenda(vendaId: number, storeId: string | number, userId: string, tenantId: string) {
  const supabaseAdmin = createAdminClient()

  // Busca itens da venda que têm product_id (itens reais de estoque)
  const { data: itens } = await (supabaseAdmin.from('venda_itens') as any)
    .select('id, product_id, quantidade, unidade, descricao')
    .eq('venda_id', vendaId)
    .not('product_id', 'is', null)

  if (!itens || itens.length === 0) return

  for (const item of itens) {
    // Par = 2 unidades reais de lente, Unidade = 1
    const multiplicador = item.unidade === 'Par' ? 2 : 1
    const qtdReal = (item.quantidade || 1) * multiplicador

    // 1. Decrementa estoque físico
    const { data: produto } = await (supabaseAdmin.from('products') as any)
      .select('estoque_atual, preco_custo')
      .eq('id', item.product_id)
      .single()

    if (produto) {
      await (supabaseAdmin.from('products') as any)
        .update({ estoque_atual: Math.max(0, (produto.estoque_atual || 0) - qtdReal) })
        .eq('id', item.product_id)

      // 2. Log na stock_movements
      await (supabaseAdmin.from('stock_movements') as any).insert({
        tenant_id: tenantId,
        store_id: storeId,
        product_id: item.product_id,
        tipo: 'Saida',
        quantidade: qtdReal,
        motivo: `Venda #${vendaId} — ${item.descricao}`,
        custo_unitario_momento: produto.preco_custo || 0,
        registrado_por_id: userId,
        created_at: new Date().toISOString()
      })
    }
  }
}

// Helper reverso: estorna saídas de venda no cancelamento/reabertura
async function estornarSaidaVenda(vendaId: number, storeId: string | number, userId: string, tenantId: string) {
  const supabaseAdmin = createAdminClient()

  // Busca as saídas que foram geradas por esta venda
  const { data: movimentos } = await (supabaseAdmin.from('stock_movements') as any)
    .select('id, product_id, quantidade, custo_unitario_momento')
    .eq('store_id', storeId)
    .eq('tipo', 'Saida')
    .ilike('motivo', `Venda #${vendaId}%`)

  if (!movimentos || movimentos.length === 0) return

  for (const mov of movimentos) {
    // 1. Devolve ao estoque
    const { data: produto } = await (supabaseAdmin.from('products') as any)
      .select('estoque_atual')
      .eq('id', mov.product_id)
      .single()

    if (produto) {
      await (supabaseAdmin.from('products') as any)
        .update({ estoque_atual: (produto.estoque_atual || 0) + mov.quantidade })
        .eq('id', mov.product_id)
    }

    // 2. Registra a devolução
    await (supabaseAdmin.from('stock_movements') as any).insert({
      tenant_id: tenantId,
      store_id: storeId,
      product_id: mov.product_id,
      tipo: 'Devolucao',
      quantidade: mov.quantidade,
      motivo: `Estorno — Venda #${vendaId} cancelada/reaberta`,
      custo_unitario_momento: mov.custo_unitario_momento || 0,
      registrado_por_id: userId,
      created_at: new Date().toISOString()
    })
  }
}

// ================================================================
// 11. ACTION: ATUALIZAR STATUS DA VENDA (COM TIMESTAMP E RANKING)
// ================================================================
export type CreateVendaResult = {
  success: boolean
  message?: string
  data?: Venda
  blockedEvaluationId?: number
  blockedEvaluationUpdatedAt?: string
  timestamp?: number
}

export async function updateVendaStatus(
  vendaId: number,
  storeId: number,
  newStatus: 'Fechada' | 'Cancelada' | 'Em Aberto',
  acting_employee_id?: number // NOVO: Quem realizou a ação
): Promise<CreateVendaResult> {

  const supabaseAdmin = createAdminClient()
  const { data: { user } } = await createClient().auth.getUser()
  const profile = user ? await getProfileByAdmin(user.id) : null

  try {
    const updatePayload: any = { status: newStatus };

    if (newStatus === 'Em Aberto') {
      // REABERTURA:
      // 1. Remove o vínculo com financiamento (se houver, para permitir recriar)
      updatePayload.financiamento_id = null;
      // 2. Limpa data de fechamento
      updatePayload.data_fechamento = null;

      // 2. IMPORTANTE: Estorna a comissão gerada anteriormente para evitar duplicidade
      await cancelarComissao(vendaId)

      // 3. Cancela reservas de estoque
      await cancelReservations(vendaId)

      // 4. Estorna saídas de estoque geradas pelo fechamento anterior
      if (user && profile) {
        await estornarSaidaVenda(vendaId, storeId, user.id, (profile as any).tenant_id)
      }
    }

    // --- GATILHO DE FECHAMENTO ---
    if (newStatus === 'Fechada') {
      // Define a data de fechamento AGORA
      updatePayload.data_fechamento = new Date().toISOString();
    }

    const { data, error } = await (supabaseAdmin.from('vendas') as any)
      .update(updatePayload)
      .eq('id', vendaId)
      .select()
      .single()

    if (error) throw error

    // --- NOVO: GATILHO DE RANKING ---
    // Se cancelou, o cliente pode cair de nível. Se reabriu, pode subir.
    if (data && data.customer_id) {
      await atualizarRankingCliente(data.customer_id)
    }
    // --------------------------------

    if (newStatus === 'Fechada') {
      // Calcula comissão nova
      await calcularERegistrarComissao(vendaId)
      await calcularComissaoMedico(vendaId)

      // Confirma reservas de estoque
      await confirmReservations(vendaId)

      // Registra saídas de estoque para itens não-reservados (armações, etc)
      if (user && profile) {
        await registrarSaidaVenda(vendaId, storeId, user.id, (profile as any).tenant_id)
      }
    } else if (newStatus === 'Cancelada') {
      await cancelarComissao(vendaId)
      await cancelReservations(vendaId)

      // Estorna saídas de estoque
      if (user && profile) {
        await estornarSaidaVenda(vendaId, storeId, user.id, (profile as any).tenant_id)
      }
    }
    // ---------------------------

    revalidatePath(`/dashboard/loja/${storeId}/vendas`)
    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`)
    revalidatePath(`/dashboard/loja/${storeId}/financeiro/comissoes`) // Cache Buster

    return {
      success: true,
      message: `Venda ${newStatus}!`,
      data,
      timestamp: Date.now()
    }

  } catch (error: any) {
    return { success: false, message: error.message, timestamp: Date.now() }
  }
}

// ================================================================
// 12. ACTION: ATUALIZAR DESCONTO DA VENDA
// ================================================================
const DescontoSchema = z.object({
  venda_id: z.coerce.number(),
  store_id: z.coerce.number(),
  valor_desconto: z.coerce.number().min(0, 'Desconto não pode ser negativo.'),
})

export type UpdateDescontoResult = {
  success: boolean
  message: string
  errors?: Record<string, string[]>
}

// --- HELPER: Rateio Inteligente (Inteiro) ---
function distributeDiscount(
  totalTarget: number,
  items: { id: number; valor_original_total: number; quantidade: number }[]
) {
  if (items.length === 0) return []

  const totalOriginal = items.reduce((acc, item) => acc + item.valor_original_total, 0)
  if (totalOriginal === 0) return items.map(i => ({ id: i.id, valor_total_item: 0, valor_unitario: 0 }))

  let currentSum = 0
  const distributed = items.map((item) => {
    // Peso do item no total original
    const weight = item.valor_original_total / totalOriginal
    // Valor alvo proporcional
    const rawTarget = totalTarget * weight
    // Arredonda para o inteiro mais próximo
    const roundedTarget = Math.round(rawTarget)

    currentSum += roundedTarget

    return {
      id: item.id,
      novo_total: roundedTarget,
      quantidade: item.quantidade
    }
  })

  // Ajuste de diferença (rounding error)
  let difference = totalTarget - currentSum

  if (difference !== 0) {
    // Encontra o item de maior valor para absorver a diferença
    // (Ordena por valor decrescente)
    distributed.sort((a, b) => b.novo_total - a.novo_total)

    // Aplica a diferença no primeiro (maior valor)
    distributed[0].novo_total += difference
  }

  // Calcula novos unitários e retorna
  return distributed.map(d => ({
    id: d.id,
    valor_total_item: d.novo_total,
    valor_unitario: d.novo_total / d.quantidade // Pode ter casas decimais aqui, o importante é o total bater
  }))
}

export async function updateVendaDesconto(
  prevState: UpdateDescontoResult,
  formData: FormData
): Promise<UpdateDescontoResult> {
  const supabase: any = createAdminClient() // Muda para AdminClient para ter permissão de update em tudo

  const validatedFields = DescontoSchema.safeParse({
    venda_id: formData.get('venda_id'),
    store_id: formData.get('store_id'),
    valor_desconto: formData.get('valor_desconto'),
  })

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Erro de validação.',
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }

  const { venda_id, store_id, valor_desconto } = validatedFields.data

  try {
    // 1. Busca venda e itens atuais
    const { data: venda, error: vendaError } = await supabase
      .from('vendas')
      .select('valor_total')
      .eq('id', venda_id)
      .single()

    if (vendaError || !venda) throw new Error('Venda não encontrada.')

    const { data: itensRaw, error: itensError } = await supabase
      .from('venda_itens')
      .select('id, quantidade, valor_unitario, valor_total_item, detalhes_avulsos')
      .eq('venda_id', venda_id)

    if (itensError) throw new Error('Erro ao buscar itens.')
    if (!itensRaw) throw new Error('Itens não encontrados.')

    const itens = itensRaw as {
      id: number
      quantidade: number
      valor_unitario: number
      valor_total_item: number
      detalhes_avulsos: any
    }[]

    // 2. Calcula Rateio Inteligente
    // O "valor_original_total" deve ser (qtd * unitario_original) ou o valor_total_item ATUAL se não tivermos o histórico.
    // ASSUMINDO: O valor_total da venda é a soma dos itens SEM desconto ( bruto ).
    // Mas se já aplicamos desconto antes, o valor_total_item no banco já está reduzido? 
    // R: O sistema atual parece não guardar o "valor de tabela" separado.
    // SOLUÇÃO: Vamos recalcular o "Original" baseando-se que (Valor Total Venda + Desconto Anterior) = Bruto.
    // PORÉM, para simplificar e ser robusto: O usuário digita o desconto TOTAL sobre o valor BRUTO da venda.
    // O valor_total na tabela 'vendas' costuma ser o BRUTO. O 'valor_final' é o Líquido.
    // Vamos usar o valor_total (Bruto) da venda como base para validação.

    // Recalcula o total bruto real somando os itens (para garantir, caso o da venda esteja defasado)
    // Mas espere! Se a gente já rodou o rateio antes, os itens no banco já estão com preço menor?
    // SE o sistema ALTERA o valor do item no banco, perdemos a referência do preço original.
    // ISSO É UM PROBLEMA DO MODELO ATUAL (Sem tabela 'preco_tabela').
    // CONTORNO: Vamos assumir que o usuário está dando o desconto sobre o que está LÁ AGORA.
    // MAS O USUÁRIO DISSE: "Venda de 860. Desconto 60. Final 800."
    // Se ele mudar o desconto para 100, a venda é 860 -> 760.
    // Se a gente já salvou os itens como 800, e ele muda o desconto, ferrou.

    // CORREÇÃO CRÍTICA:
    // O 'valor_total' na tabela VENDAS deve ser mantido como o BRUTO (Soma dos preços de tabela/originais).
    // O 'valor_final' é que muda.
    // O 'venda_itens' tem 'valor_unitario' e 'valor_total_item'.
    // Se alterarmos 'venda_itens', o 'valor_total' da venda (que é soma dos itens) vai cair?
    // Se a trigger 'update_venda_financeiro' somar 'valor_total_item' para compor o 'valor_total' da venda,
    // então ao dar desconto, o 'valor_total' da venda CAI também. Isso faz o desconto virar "Preço".

    // VERIFICANDO A TRIGGER (Mentalmente ou via suposição segura):
    // Se 'valor_total' cai, o desconto vira zero na próxima iteração?
    // NÃO. O campo 'valor_desconto' fica na venda.

    // ESTRATÉGIA SEGURA (Rateio DESTRUTIVO mas REVERSÍVEL SE TIVERMOS TOTAL):
    // Se não temos coluna "valor_tabela" nos itens, o rateio destrói o preço original.
    // Se o usuário remover o desconto (zerar), como voltamos ao preço original?
    // NÃO VOLTAMOS se não tiver salvo.
    // PERGUNTA DO USUÁRIO: "Possível fazer o rateio...?" -> SIM.
    // CONTEXTO: Ele quer que o relatório de produtos bata.
    // Se ele tirar o desconto, ele teria que reajustar o preço na mão ou cancelar e refazer?
    // DADO QUE o usuário aprovou "Rateio", ele aceita que o valor do item MUDARÁ.
    // PARA EVITAR PERDAS IRREVERSÍVEIS IMEDIATAS:
    // O ideal seria calcular o rateio SEMPRE sobre o (Valor Atual + Desconto Velho).
    // Mas se o desconto velho já foi diluído, não sabemos quanto era de cada item.
    // TENTATIVA DE RECUPERAÇÃO:
    // Se todos itens sofreram redução uniforme, a proporção se mantém.
    // Então: (Item Atual / Total Atual) * (Total Atual + Desconto Novo(??) não, Desconto Diferença).

    // LÓGICA FINAL ADOTADA:
    // 1. Calculamos o valor LÍQUIDO DESEJADO da venda: (Venda.valor_total_BRUTO - NovoDesconto).
    //    Mas espere, se Venda.valor_total já caiu por causa de descontos anteriores (devido a trigger), 
    //    então Venda.valor_total É o líquido atual.
    //    Isso seria confuso: "Desconto de 60" num total de "800"?

    //    SE A TRIGGER ATUALIZA O TOTAL DA VENDA COM A SOMA DOS ITENS:
    //    Então quando salvarmos os itens reduzidos, o 'valor_total' da venda vai cair para 800.
    //    E o 'valor_desconto' vai ficar 60.
    //    O 'valor_final' será 800 - 60 = 740? NÃO!
    //    Isso duplicaria o desconto.

    //    SOLUÇÃO: O campo 'valor_desconto' na venda deve ser APENAS INFORMATIVO/MEMORIAL se fizermos rateio nos itens.
    //    OU
    //    Ao fazer rateio, o 'valor_total' da venda cai, e devemos ZERAR o 'valor_desconto' real para não duplicar,
    //    mas talvez guardar em 'obs' ou outro campo?
    //    OU
    //    O sistema deve considerar 'valor_total' como SOMA DOS ITENS (que agora são 800).
    //    E 'valor_final' = 'valor_total' (800) - 'valor_desconto' (0).

    //    VAMOS ASSUMIR O SEGUINTE COMPORTAMENTO PARA ATENDER O USUÁRIO:
    //    O usuário digita "60,00" no campo de desconto.
    //    Nós pegamos os itens atuais (soma 860).
    //    Calculamos meta 800.
    //    Atualizamos itens para somar 800.
    //    Atualizamos a venda: valor_desconto = 60 (apenas visual?), valor_total = 800 (pela soma).
    //    SE o sistema subtrair desconto de novo, vira 740.
    //    ENTÃO: Se fizermos rateio nos itens, o 'valor_desconto' funcional da venda deve ser ZERO ou 
    //    a lógica de 'valor_final' deve mudar.

    //    COMO O USUÁRIO PEDIU "RATEIO PARA RELATÓRIO BATER":
    //    Ele quer que o item na tabela custe menos.
    //    Então, tecnicamente, estamos dando um "Desconto no Item".
    //    Se alterarmos o item, a venda reflete isso.
    //    Para o usuário não ficar confuso vendo "Desconto: R$ 0,00" lá em cima depois de ter digitado 60:
    //    Vamos salvar os itens reduzidos E manter o 'valor_desconto' como REGISTRO VISUAL mas não matemático?
    //    Isso exige mudar a trigger ou a lógica de cálculo do 'valor_final'.

    //    SUPOSIÇÃO MAIS SEGURA (MENOR RISCO DE BUG):
    //    O 'valor_desconto' hoje é matemático. (Total - Desconto = Final).
    //    Se mudarmos os itens, o Total cai. 
    //    Se mantivermos o Desconto, o Final cai duplamente.
    //    Então, se aplicarmos rateio, devemos ZERAR o campo 'valor_desconto' da venda e instruir o usuário?
    //    Melhor: Vamos salvar o desconto no campo 'valor_desconto' MAS
    //    na verdade, se o usuário quer rateio, ele está mudando o PREÇO PRATICADO.

    //    DECISÃO DE IMPLEMENTAÇÃO:
    //    Ao aplicar o desconto (ex: 60,00), vamos:
    //    1. Calcular o novo total líquido (SomaAtual - 60).
    //    2. Ratear esse líquido nos itens.
    //    3. Atualizar os itens.
    //    4. ZERAR o 'valor_desconto' na tabela Vendas (pois o desconto já foi incorporado no preço).
    //    5. O usuário verá o total da venda diminuir (de 860 para 800).
    //    6. O campo de desconto voltará a zero ou mostrará o que foi aplicado?
    //    Se voltar a zero, o usuário pode achar que não aplicou.
    //    Mas se o total mudou de 860 para 800, está claro.

    //    Vou seguir por este caminho: Rateio real, alteração de preço, zera desconto explícito.
    //    É o único jeito da "Soma dos Produtos" bater com o "Caixa" e não duplicar desconto.

    // 1. Calcula Total Original (Baseado no Metadata) para manter a base fixa
    let totalOriginal = 0
    const itemsWithOriginal = itens.map((item) => {
      const detalhes = (item.detalhes_avulsos as any) || {}
      let originalPrice = detalhes.original_price

      // Migration: Se não tem original, assume o atual (unitario) como original
      if (originalPrice === undefined || originalPrice === null) {
        originalPrice = item.valor_unitario
      }

      const originalTotalItem = originalPrice * item.quantidade
      totalOriginal += originalTotalItem

      return {
        ...item,
        originalPrice,
        originalTotalItem,
        detalhes,
      }
    })

    // Se o desconto for maior que o total original, erro.
    if (valor_desconto >= totalOriginal) {
      throw new Error(
        `Desconto (R$ ${valor_desconto}) não pode ser maior ou igual ao subtotal original (R$ ${totalOriginal}).`
      )
    }

    const totalLiquidoAlvo = totalOriginal - valor_desconto

    // 2. Distribui (Usando o TOTAL ORIGINAL do item como peso)
    const itemsForDistribution = itemsWithOriginal.map((i) => ({
      id: i.id,
      valor_original_total: i.originalTotalItem,
      quantidade: i.quantidade,
    }))

    const distribuicao = distributeDiscount(totalLiquidoAlvo, itemsForDistribution)

    // 3. Atualiza Itens no Banco
    await Promise.all(
      distribuicao.map((d) => {
        const originalItem = itemsWithOriginal.find((i) => i.id === d.id)!

        // Garante que o metadata tenha o original_price salvo
        const newDetalhes = {
          ...originalItem.detalhes,
          original_price: originalItem.originalPrice,
        }

        return supabase
          .from('venda_itens')
          .update({
            valor_total_item: d.valor_total_item,
            valor_unitario: d.valor_unitario,
            detalhes_avulsos: newDetalhes,
          })
          .eq('id', d.id)
      })
    )

    // 4. Atualiza Venda (Zera desconto explícito, pois já foi aplicado nos itens)
    // Mantemos o valor_desconto como 0 para não duplicar.
    // O 'valor_total' da venda será atualizado pela trigger 'update_venda_financeiro' ou podemos forçar.
    // Vamos chamar o RPC padrão para garantir sincronia.

    const { error: rpcError } = await supabase.rpc('update_venda_financeiro', {
      p_venda_id: venda_id,
    })

    if (rpcError) throw new Error(`Erro RPC: ${rpcError.message}`)

    // Adicionalmente, garantimos que valor_desconto seja 0 na venda
    const { error: zeroError } = await supabase
      .from('vendas')
      .update({ valor_desconto: 0 }) // ZERA O DESCONTO EXPLÍCITO
      .eq('id', venda_id)

    if (zeroError) throw zeroError

    const { error: finalRpcError } = await supabase.rpc('update_venda_financeiro', {
      p_venda_id: venda_id,
    })

    if (finalRpcError) throw new Error(`Erro RPC: ${finalRpcError.message}`)

    await calcularERegistrarComissao(venda_id)

    revalidatePath(`/dashboard/loja/${store_id}/vendas`)
    revalidatePath(`/dashboard/loja/${store_id}/vendas/${venda_id}`)
    revalidatePath(`/dashboard/loja/${store_id}/financeiro/comissoes`)

    return { success: true, message: 'Desconto aplicado e rateado nos itens!' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// ==============================================================================
// 13. ACTION: CRIAR FINANCIAMENTO DE LOJA (FINAL: SEGURA + ADMIN MODE)
// ==============================================================================
export async function saveFinanciamentoLoja(...args: any[]) {
  // 1. Normalização de dados (Suporta chamada via Form ou Objeto JS)
  let data: any = args[1] || args[0];
  if (data instanceof FormData) data = Object.fromEntries(data);

  const { venda_id, valor_total, qtd_parcelas, data_primeiro_vencimento, customer_id, employee_id, obs } = data || {};

  if (!venda_id || !qtd_parcelas) {
    return { success: false, message: 'Erro: Dados incompletos.' };
  }

  // 2. Autenticação
  const supabaseAuth = createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { success: false, message: 'Sessão expirada.' };

  // 3. Verificação de Perfil e Segurança
  const profile = await getProfileByAdmin(user.id) as any;
  if (!profile) return { success: false, message: 'Perfil não encontrado.' };

  // 4. Inicia Modo Admin (Para evitar Loop RLS)
  const supabaseAdmin = createAdminClient();

  // 5. Busca dados da Venda para validar Loja
  const { data: vendaReal, error: erroVenda } = await (supabaseAdmin
    .from('vendas') as any)
    .select('id, tenant_id, store_id, valor_final, valor_total')
    .eq('id', venda_id)
    .single();

  if (vendaReal?.store_id && !(await isStoreModuleEnabledForStore(vendaReal.store_id, 'installments'))) {
    return { success: false, message: 'Modulo de parcelamento desativado para esta loja.' };
  }

  if (erroVenda || !vendaReal) return { success: false, message: 'Venda não encontrada.' };

  // --- TRAVA DE SEGURANÃ‡A ---
  // Se não for Admin, só pode mexer se a loja do usuário for igual Ã  da venda
  if (profile.role !== 'admin' && profile.store_id !== vendaReal.store_id) {
    return { success: false, message: 'Acesso Negado: Loja inválida.' };
  }

  // 6. Verificar duplicidade
  const { data: existente } = await (supabaseAdmin
    .from('financiamento_loja') as any)
    .select('id')
    .eq('venda_id', venda_id)
    .single();

  if (existente) return { success: false, message: 'Já existe um carnê ativo.' };

  // 7. Criar Capa
  const { data: capa, error: erroCapa } = await (supabaseAdmin
    .from('financiamento_loja') as any)
    .insert({
      tenant_id: vendaReal.tenant_id,
      store_id: vendaReal.store_id,
      venda_id: venda_id,
      customer_id: customer_id,
      employee_id: employee_id,
      valor_total_financiado: valor_total,
      quantidade_parcelas: Number(qtd_parcelas),
      data_inicio: data_primeiro_vencimento,
      obs: obs || '',
      created_by_user_id: user.id
    })
    .select()
    .single();

  if (erroCapa) return { success: false, message: `Erro ao criar contrato: ${erroCapa.message}` };

  const capaCriada: any = capa;

  // 8. Gerar Parcelas
  // NOVO: Se parcelas_customizadas foi enviado, usa os valores editados pelo usuário
  const parcelasCustomizadas = data.parcelas_customizadas; // Array com { numero_parcela, data_vencimento, valor_parcela }

  const parcelas = [];

  if (parcelasCustomizadas && Array.isArray(parcelasCustomizadas) && parcelasCustomizadas.length > 0) {
    // Usa as parcelas customizadas (editadas manualmente pelo usuário)
    for (const pc of parcelasCustomizadas) {
      parcelas.push({
        tenant_id: vendaReal.tenant_id,
        store_id: vendaReal.store_id,
        financiamento_id: capaCriada.id,
        customer_id: customer_id,
        numero_parcela: pc.numero_parcela,
        data_vencimento: pc.data_vencimento,
        valor_parcela: Number(pc.valor_parcela),
        valor_pago: 0,
        status: 'Pendente'
      });
    }
  } else {
    // Fallback: Calcula automaticamente (comportamento antigo)
    const valorParcela = Number((Number(valor_total) / Number(qtd_parcelas)).toFixed(2));
    const diferenca = Number((Number(valor_total) - (valorParcela * Number(qtd_parcelas))).toFixed(2));
    const dataBase = new Date(data_primeiro_vencimento);

    for (let i = 1; i <= Number(qtd_parcelas); i++) {
      const valorReal = i === 1 ? valorParcela + diferenca : valorParcela;
      const vencimento = new Date(dataBase);
      if (i > 1) vencimento.setMonth(vencimento.getMonth() + (i - 1));

      parcelas.push({
        tenant_id: vendaReal.tenant_id,
        store_id: vendaReal.store_id,
        financiamento_id: capaCriada.id,
        customer_id: customer_id,
        numero_parcela: i,
        data_vencimento: vencimento.toISOString().split('T')[0],
        valor_parcela: valorReal,
        valor_pago: 0,
        status: 'Pendente'
      });
    }
  }

  const { error: erroParcelas } = await (supabaseAdmin.from('financiamento_parcelas') as any).insert(parcelas);

  if (erroParcelas) {
    await supabaseAdmin.from('financiamento_loja').delete().eq('id', capaCriada.id);
    return { success: false, message: `Erro ao gerar parcelas: ${erroParcelas.message}` };
  }

  // 9. Atualizar Venda
  const { data: pagamentosExistentes } = await (supabaseAdmin.from('pagamentos') as any)
    .select('valor_pago')
    .eq('venda_id', venda_id)
    .neq('forma_pagamento', 'Carnê');

  const totalJaPagoNoCaixa = pagamentosExistentes?.reduce((acc: number, p: any) => acc + Number(p.valor_pago), 0) || 0;
  const valorTotalVenda = Number(vendaReal.valor_final || vendaReal.valor_total);
  const totalCoberto = totalJaPagoNoCaixa + Number(valor_total);

  let novoValorRestante = valorTotalVenda - totalCoberto;
  if (novoValorRestante < 0.05 && novoValorRestante > -0.05) novoValorRestante = 0;
  const novoStatus = novoValorRestante <= 0 ? 'Fechada' : 'Em Aberto';

  const { error: erroUpdate } = await (supabaseAdmin.from('vendas') as any)
    .update({
      financiamento_id: capaCriada.id,
      valor_restante: novoValorRestante,
      status: novoStatus,
      data_fechamento: novoStatus === 'Fechada' ? new Date().toISOString() : null
    })
    .eq('id', venda_id);

  if (erroUpdate) return { success: false, message: `Erro ao atualizar venda: ${erroUpdate.message}` };

  await calcularERegistrarComissao(venda_id);
  await calcularComissaoMedico(venda_id);

  revalidatePath(`/vendas/${venda_id}`);
  revalidatePath(`/dashboard/loja/${vendaReal.store_id}/financeiro/comissoes`);
  return { success: true, message: 'Carnê gerado com sucesso!', data: { id: capaCriada.id } };
}

export async function getFinanciamentoById(id: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('financiamento_loja')
    .select(`
      *,
      financiamento_parcelas (*),
      customers (*),
      store:stores (*, pix_key, pix_city)
    `)
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}


// ================================================================
// 14. ACTION: LISTAR VENDAS (COM FILTROS: PENDÃŠNCIAS OU PERÃODO)
// ================================================================
export type SalesFilterOptions = {
  mode?: 'pendencias' | 'historico'
  startDate?: string
  endDate?: string
  search?: string
}

export async function getSalesList(storeId: number, options?: SalesFilterOptions) {
  const supabaseAdmin = createAdminClient()

  const mode = options?.mode || 'pendencias'
  const search = options?.search

  try {
    let query = supabaseAdmin
      .from('vendas')
      .select(`
        *,
        customers ( full_name ),
        service_orders ( id, protocolo_fisico )
      `)
      .eq('store_id', storeId)

    if (search) {
      const isNumeric = /^\d+$/.test(search)
      
      // 1. Buscar IDs de clientes que batem com a busca
      const { data: customersData } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('store_id', storeId)
        .ilike('full_name', `%${search}%`)
      
      const customerIds = customersData?.map((c: any) => c.id) || []

      // 2. Buscar IDs de vendas baseados nas ordens de serviço (protocolo ou ID)
      let osQuery = supabaseAdmin
        .from('service_orders')
        .select('venda_id')
        .eq('store_id', storeId)
      
      if (isNumeric) {
        osQuery = osQuery.or(`id.eq.${search},protocolo_fisico.ilike.%${search}%`)
      } else {
        osQuery = osQuery.ilike('protocolo_fisico', `%${search}%`)
      }

      const { data: osData } = await osQuery
      const vendaIdsFromOS = osData?.map((os: any) => os.venda_id).filter((id: any) => id != null) || []

      // 3. Montar a query principal usando os IDs encontrados
      const conditions = []
      
      if (isNumeric) {
        conditions.push(`id.eq.${search}`)
      }
      
      if (customerIds.length > 0) {
        conditions.push(`customer_id.in.(${customerIds.join(',')})`)
      }
      
      if (vendaIdsFromOS.length > 0) {
        // Usar um Set para remover duplicatas e evitar string muito grande se houver muitos
        const uniqueVendaIds = Array.from(new Set(vendaIdsFromOS))
        conditions.push(`id.in.(${uniqueVendaIds.join(',')})`)
      }

      // Se não encontrou nada na busca prévia e não é numérico, retorna array vazio
      if (conditions.length === 0) {
         return { success: true, data: [] }
      }

      query = query.or(conditions.join(','))
    }

    if (mode === 'pendencias') {
      // MODO PENDÃŠNCIAS: Traz tudo que está aberto, ignorando data (Prioridade Total)
      query = query.eq('status', 'Em Aberto')
        .order('created_at', { ascending: true }) // Mais antigas primeiro (para resolver logo)
    } else {
      // MODO HISTÃ“RICO: Traz tudo (Aberto, Fechada, Cancelada) dentro do prazo
      if (options?.startDate) {
        const start = `${options.startDate}T00:00:00`
        query = query.gte('created_at', start)
      }
      if (options?.endDate) {
        const end = `${options.endDate}T23:59:59`
        query = query.lte('created_at', end)
      }
      // No histórico, queremos ver as mais recentes primeiro
      query = query.order('created_at', { ascending: false })
    }

    const { data, error } = await query

    if (error) throw error

    return { success: true, data }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// ================================================================
// 15. ACTION: BUSCA UNIFICADA DE PRODUTOS (ATUALIZADO)
// ================================================================
export type ProductSearchResult = {
  id: number
  tipo: 'Lente' | 'Armacao' | 'Tratamento' | 'Servico' | 'Outro' | 'Solar'
  descricao: string
  marca?: string
  detalhes: string
  preco_venda: number
  estoque?: number
}

export type SearchProductResult = {
  success: boolean
  message?: string
  data?: ProductSearchResult[]
}

// ATUALIZAÃ‡ÃƒO: Adicionado 'Todos' na assinatura para permitir busca global
export async function searchProductCatalog(
  query: string,
  storeId: number,
  type: 'Lente' | 'Armacao' | 'Tratamento' | 'Servico' | 'Outro' | 'Solar' | 'Todos'
): Promise<SearchProductResult> {

  const supabaseAdmin = createAdminClient()
  let results: ProductSearchResult[] = []

  try {
    let q = supabaseAdmin
      .from('products')
      .select('*')
      .eq('store_id', storeId)

    // ATUALIZAÃ‡ÃƒO: Se for 'Todos', não filtra por tipo no banco
    if (type !== 'Todos') {
      let dbType = type
      if (type === 'Armacao') dbType = 'Armacao'
      if (type === 'Lente') dbType = 'Lente'
      if (type === 'Tratamento') dbType = 'Tratamento'
      if (type === 'Servico') dbType = 'Servico'
      if (type === 'Outro') dbType = 'Outro'
      if (type === 'Solar') dbType = 'Solar'

      q = q.eq('tipo_produto', dbType)
    }

    // Aplica a busca por texto (Multi-termo + Marca)
    const terms = query.split(/\s+/).filter(t => t.length > 0);

    terms.forEach(term => {
      // Para cada termo digitado, ele deve aparecer em pelo menos UM dos campos
      // Adicionamos 'marca', 'referencia' e campos JSON ('modelo' e 'cor') na busca
      q = q.or(`nome.ilike.%${term}%,codigo_barras.ilike.%${term}%,referencia.ilike.%${term}%,marca.ilike.%${term}%,detalhes->>modelo.ilike.%${term}%,detalhes->>cor.ilike.%${term}%`)
    });

    q = q.order('nome').limit(50)

    const { data } = await q

    if (data) {
      results = data.map((p: any) => {
        const d = p.detalhes || {}
        let detalhesStr = ''

        // ATUALIZAÇÃO: Mapeia o tipo do banco de volta para o tipo do Front
        let tipoFront: ProductSearchResult['tipo'] = 'Outro'
        if (p.tipo_produto === 'Lente') tipoFront = 'Lente'
        else if (p.tipo_produto === 'Armacao') tipoFront = 'Armacao'
        else if (p.tipo_produto === 'Receituario') tipoFront = 'Armacao' // Legacy support
        else if (p.tipo_produto === 'Solar') tipoFront = 'Solar'
        else if (p.tipo_produto === 'Tratamento') tipoFront = 'Tratamento'
        else if (p.tipo_produto === 'Servico') tipoFront = 'Servico'

        if (tipoFront === 'Lente') detalhesStr = `${p.marca || ''} ${d.material || ''}`
        if (tipoFront === 'Armacao') detalhesStr = `Ref: ${p.referencia || '-'} | Cor: ${d.cor || '-'}`
        if (tipoFront === 'Solar') detalhesStr = `Solar | Ref: ${p.referencia || '-'} | Cor: ${d.cor || '-'}`
        if (tipoFront === 'Tratamento') detalhesStr = d.descricao || ''

        return {
          id: p.id,
          tipo: tipoFront,
          descricao: p.nome,
          marca: p.marca,
          detalhes: detalhesStr,
          preco_venda: p.preco_venda,
          estoque: p.estoque_atual
        }
      })

      // Ordenação: Produtos com estoque > 0 primeiro.
      results.sort((a, b) => {
        const temEstoqueA = (a.estoque || 0) > 0;
        const temEstoqueB = (b.estoque || 0) > 0;
        if (temEstoqueA && !temEstoqueB) return -1;
        if (!temEstoqueA && temEstoqueB) return 1;
        return 0; // Mantém a ordenação original (por nome) entre itens do mesmo status de estoque
      })
    }

    return { success: true, data: results }

  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// ... (Mantenha o restante do arquivo inalterado)

// ================================================================
// 16. ACTION: BUSCA EXPRESS (CORRIGIDO COM 'ANY')
// ================================================================
export type ProdutoExpressResult = {
  id: number
  tipo_origem: 'produtos_gerais' | 'armacoes'
  descricao: string
  preco: number
  estoque: number
  codigo_barras: string | null
  tem_grade?: boolean
}

export async function buscarProdutoExpress(query: string, storeId: number) {
  const supabaseAdmin = createAdminClient()
  const termo = query.trim()
  const resultados: ProdutoExpressResult[] = []

  if (!termo) return []

  try {
    let queryBuilder = supabaseAdmin
      .from('products')
      .select('*, tem_grade')
      .eq('store_id', storeId)

    // Lógica de busca refinada: quebra em palavras para busca AND
    const terms = termo.split(/\s+/).filter(t => t.length > 0)

    if (terms.length > 0) {
      terms.forEach(t => {
        // PostgREST exige aspas para valores com espaços ou caracteres especiais dentro do .or()
        // O Supabase escapa automaticamente se usarmos filtros separados, mas no .or() é manual.
        // Usamos ilike em vários campos por termo (Lógica: (Campo1 ~ t OR Campo2 ~ t) AND (Campo1 ~ t2 OR ...))
        const escaped = `"%${t}%"`
        const eqEscaped = `"${t}"`
        queryBuilder = queryBuilder.or(`codigo_barras.eq.${eqEscaped},nome.ilike.${escaped},marca.ilike.${escaped},referencia.ilike.${escaped},detalhes->>modelo.ilike.${escaped},detalhes->>cor.ilike.${escaped}`)
      })
    }

    const { data, error } = await queryBuilder.limit(15)

    if (error) {
      console.error("❌ [SUPABASE SEARCH ERROR]:", error.message, error.details)
      return []
    }

    data?.forEach((p: any) => {
      resultados.push({
        id: p.id,
        tipo_origem: p.tipo_produto === 'Armacao' ? 'armacoes' : 'produtos_gerais',
        descricao: p.nome,
        preco: p.preco_venda,
        estoque: p.estoque_atual,
        codigo_barras: p.codigo_barras,
        tem_grade: p.tem_grade
      })
    })

    return resultados

  } catch (e: any) {
    console.error("🔥 [CRITICAL SEARCH EXCEPTION]:", e.message)
    return []
  }
}

// ================================================================
// 17. ACTION: ATUALIZAR VENDEDOR DA VENDA
// ================================================================
export async function updateVendaEmployee(
  vendaId: number,
  storeId: number,
  employeeId: number | null
) {
  const supabaseAdmin = createAdminClient()
  try {
    // CORREÃ‡ÃƒO: Adicionado (as any) para destravar o update
    const { error } = await (supabaseAdmin.from('vendas') as any)
      .update({ employee_id: employeeId })
      .eq('id', vendaId)
      .eq('store_id', storeId)

    if (error) throw error

    revalidatePath(`/dashboard/loja/${storeId}/pdv-express`)
    return { success: true, message: 'Vendedor atualizado.' }
  } catch (e: any) {
    return { success: false, message: e.message }
  }
}
// ================================================================
// 18. ACTION: RECEBER PARCELA (VERSÃO SEGURA E REVISADA)
// ================================================================

// --- 1. MANTENHA O SCHEMA IGUAL ---
const ReceberParcelaSchema = z.object({
  parcela_id: z.coerce.number(),
  venda_id: z.coerce.number(),
  store_id: z.coerce.number(),
  employee_id: z.coerce.number(),
  valor_original: z.coerce.number(),
  valor_pago_total: z.coerce.number().min(0.01),
  valor_juros: z.coerce.number().default(0),
  forma_pagamento: z.string().min(1),
  data_pagamento: z.string(),
  estrategia: z.enum(['quitacao_total', 'criar_pendencia', 'somar_proxima']).default('quitacao_total'),
})

// --- 2. NOVA FUNÇÃO DE SEGURANÇA (Adicione isso antes da função principal) ---
// Essa função impede que 207.00 vire 20700
function parseMoneySeguro(val: string | null) {
  if (!val) return 0
  // Se tem vírgula, é formato Brasileiro (ex: 200,50 ou 1.000,00) -> Remove ponto, troca vírgula.
  if (val.includes(',')) {
    return parseFloat(val.replace(/\./g, '').replace(',', '.'))
  }
  // Se NÃO tem vírgula, é formato Input/Americano (ex: 207.00) -> Aceita direto.
  // O seu código antigo removia o ponto aqui, causando o erro.
  return parseFloat(val)
}

async function quitarParcelasZeradasPendentes(financiamentoId: number, dataPagamento: string) {
  const supabaseAdmin = createAdminClient()
  const dataPagamentoIso = new Date(`${dataPagamento}T12:00:00Z`).toISOString()

  const { error } = await (supabaseAdmin.from('financiamento_parcelas') as any)
    .update({
      status: 'Pago',
      data_pagamento: dataPagamentoIso,
      valor_parcela: 0
    })
    .eq('financiamento_id', financiamentoId)
    .eq('status', 'Pendente')
    .lte('valor_parcela', 0.01)

  if (error) throw new Error(`Erro ao quitar parcelas zeradas: ${error.message}`)
}

export async function receberParcela(prevState: any, formData: FormData) {
  const supabaseAdmin = createAdminClient()
  const { data: { user } } = await createClient().auth.getUser()

  if (!user) return { success: false, message: 'Usuário não autenticado.' }

  const profile = await getProfileByAdmin(user.id)
  if (!profile) return { success: false, message: 'Perfil não encontrado.' }

  // --- 3. A ÚNICA ALTERAÇÃO LÓGICA ESTÁ AQUI ---
  // Usamos a função segura em vez do replace direto
  const valorRaw = formData.get('valor_pago_total') as string
  const valorPagoTotal = parseMoneySeguro(valorRaw)

  const jurosRaw = formData.get('valor_juros') as string
  const valorJuros = parseMoneySeguro(jurosRaw)
  // ----------------------------------------------

  const inputData = {
    parcela_id: formData.get('parcela_id'),
    venda_id: formData.get('venda_id'),
    store_id: formData.get('store_id'),
    employee_id: formData.get('employee_id'),
    valor_original: formData.get('valor_original'),
    valor_pago_total: valorPagoTotal, // Passamos o valor já corrigido
    valor_juros: valorJuros,          // Passamos o juros já corrigido
    forma_pagamento: formData.get('forma_pagamento'),
    data_pagamento: formData.get('data_pagamento'),
    estrategia: formData.get('estrategia')
  }

  const validated = ReceberParcelaSchema.safeParse(inputData)
  if (!validated.success) return { success: false, message: 'Dados inválidos.' }

  // Mantive os nomes originais das suas variáveis aqui para não mudar a lógica abaixo
  const { parcela_id, venda_id, store_id, employee_id, valor_original, valor_pago_total, valor_juros, forma_pagamento, estrategia, data_pagamento } = validated.data
  if (!(await isStoreModuleEnabledForStore(store_id, 'installments'))) {
    return { success: false, message: 'Modulo de parcelamento desativado para esta loja.' }
  }

  const principalAbatido = valor_pago_total - valor_juros
  const diferencaDivida = valor_original - principalAbatido

  try {
    const { data: parcelaRaw } = await supabaseAdmin
      .from('financiamento_parcelas')
      .select('*, customers(full_name)')
      .eq('id', parcela_id)
      .single()

    if (!parcelaRaw) throw new Error('Parcela não encontrada.')
    const parcelaAtual = parcelaRaw as any;

    // Registra Pagamento e Checa Erro
    const { error: errorPagto } = await (supabaseAdmin.from('pagamentos') as any).insert({
      tenant_id: (profile as any).tenant_id,
      store_id: store_id,
      venda_id: venda_id,
      customer_id: parcelaAtual.customer_id,
      employee_id: employee_id,
      created_by_user_id: user.id,
      valor_pago: valor_pago_total,
      forma_pagamento: forma_pagamento,
      data_pagamento: data_pagamento,
      created_at: new Date(`${data_pagamento}T12:00:00Z`).toISOString(),
      parcelas: 1,
      obs: `Ref. Venda #${venda_id} - Parc. ${parcelaAtual.numero_parcela} (Principal: ${principalAbatido.toFixed(2)} + Juros: ${valor_juros.toFixed(2)}) - Cliente: ${parcelaAtual.customers?.full_name}`
    })

    if (errorPagto) throw new Error(`Erro ao registrar pagamento: ${errorPagto.message}`)

    // Baixa a parcela
    const { error: errBaixa } = await (supabaseAdmin.from('financiamento_parcelas') as any).update({
      status: 'Pago',
      data_pagamento: new Date().toISOString(),
      valor_parcela: principalAbatido
    }).eq('id', parcela_id)
    if (errBaixa) throw new Error(`Erro ao baixar a parcela original: ${errBaixa.message}`)

    // Lógica de Diferença (Exatamente igual ao seu original)
    if (diferencaDivida > 0.01) {
      const { data: ultimaParcelaRaw } = await supabaseAdmin
        .from('financiamento_parcelas')
        .select('numero_parcela')
        .eq('financiamento_id', parcelaAtual.financiamento_id)
        .order('numero_parcela', { ascending: false })
        .limit(1)
        .maybeSingle()

      const ultimaParcela = ultimaParcelaRaw as any
      const proximoNumeroParcela = Number(ultimaParcela?.numero_parcela || parcelaAtual.numero_parcela) + 1

      if (estrategia === 'criar_pendencia') {
        const novaDataVencimento = new Date(parcelaAtual.data_vencimento)
        novaDataVencimento.setDate(novaDataVencimento.getDate() + 30)

        const { error: errPendencia } = await (supabaseAdmin.from('financiamento_parcelas') as any).insert({
          tenant_id: (profile as any).tenant_id,
          store_id: store_id,
          financiamento_id: parcelaAtual.financiamento_id,
          customer_id: parcelaAtual.customer_id,
          numero_parcela: proximoNumeroParcela,
          data_vencimento: novaDataVencimento.toISOString(),
          valor_parcela: diferencaDivida,
          status: 'Pendente'
        })
        if (errPendencia) throw new Error(`Erro criar pendencia: ${errPendencia.message}`)
      } else if (estrategia === 'somar_proxima') {
        const { data: proxParcela } = await supabaseAdmin
          .from('financiamento_parcelas')
          .select('*')
          .eq('financiamento_id', parcelaAtual.financiamento_id)
          .gt('numero_parcela', parcelaAtual.numero_parcela)
          .eq('status', 'Pendente')
          .gt('valor_parcela', 0.01)
          .order('numero_parcela', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (proxParcela) {
          const prox = proxParcela as any;
          const { error: errUpdateProx } = await (supabaseAdmin.from('financiamento_parcelas') as any)
            .update({ valor_parcela: prox.valor_parcela + diferencaDivida })
            .eq('id', prox.id)

          if (errUpdateProx) throw new Error(`Erro ao somar na próxima parcela: ${errUpdateProx.message}`)
        } else {
          const novaData = new Date(parcelaAtual.data_vencimento)
          novaData.setDate(novaData.getDate() + 30)
          const { error: errNewProx } = await (supabaseAdmin.from('financiamento_parcelas') as any).insert({
            tenant_id: (profile as any).tenant_id,
            store_id: store_id,
            financiamento_id: parcelaAtual.financiamento_id,
            customer_id: parcelaAtual.customer_id,
            numero_parcela: proximoNumeroParcela,
            data_vencimento: novaData.toISOString(),
            valor_parcela: diferencaDivida,
            status: 'Pendente'
          })
          if (errNewProx) throw new Error(`Erro criar nova parcela: ${errNewProx.message}`)
        }
      }
    } else if (diferencaDivida < -0.01) {
      // Excedente: quita parcelas seguintes em cascata até o dinheiro acabar
      let excedente = Math.abs(diferencaDivida)

      const { data: proximasParcelas } = await supabaseAdmin
        .from('financiamento_parcelas')
        .select('*')
        .eq('financiamento_id', parcelaAtual.financiamento_id)
        .gt('numero_parcela', parcelaAtual.numero_parcela)
        .eq('status', 'Pendente')
        .gt('valor_parcela', 0.01)
        .order('numero_parcela', { ascending: true })

      if (proximasParcelas) {
        for (const prox of proximasParcelas as any[]) {
          if (excedente <= 0.01) break

          if (excedente >= prox.valor_parcela - 0.01) {
            // Quita essa parcela inteira
            const { error: errQuita } = await (supabaseAdmin.from('financiamento_parcelas') as any)
              .update({ status: 'Pago', data_pagamento: new Date().toISOString() })
              .eq('id', prox.id)
            if (errQuita) throw new Error(`Erro ao quitar parcela ${prox.numero_parcela}: ${errQuita.message}`)
            excedente -= prox.valor_parcela
          } else {
            const saldoRestante = Number((prox.valor_parcela - excedente).toFixed(2))
            const updateParcela = saldoRestante <= 0.01
              ? { status: 'Pago', data_pagamento: new Date(`${data_pagamento}T12:00:00Z`).toISOString(), valor_parcela: 0 }
              : { valor_parcela: saldoRestante }

            const { error: errAbate } = await (supabaseAdmin.from('financiamento_parcelas') as any)
              .update(updateParcela)
              .eq('id', prox.id)
            if (errAbate) throw new Error(`Erro ao abater parcela ${prox.numero_parcela}: ${errAbate.message}`)
            excedente = 0
          }
        }
      }
    }

    await quitarParcelasZeradasPendentes(parcelaAtual.financiamento_id, data_pagamento)

    revalidatePath(`/dashboard/loja/${store_id}/vendas/${venda_id}`)

    return { success: true, message: 'Pagamento recebido com sucesso!' }

  } catch (e: any) {
    return { success: false, message: `Erro: ${e.message}` }
  }
}

// ==============================================================================
// 19. ACTION: EXCLUIR FINANCIAMENTO (FINAL: SEGURA + ADMIN MODE)
// ==============================================================================
export async function deleteFinanciamentoLoja(vendaId: number, storeId: number) {
  const supabaseAuth = createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { success: false, message: 'Sessão inválida.' };

  const profile = await getProfileByAdmin(user.id) as any;
  if (!profile) return { success: false, message: 'Perfil não encontrado.' };

  // --- TRAVA DE SEGURANÃ‡A ---
  if (!(await isStoreModuleEnabledForStore(storeId, 'installments'))) {
    return { success: false, message: 'Modulo de parcelamento desativado para esta loja.' };
  }

  if (profile.role !== 'admin' && profile.store_id !== storeId) {
    return { success: false, message: 'Acesso Negado: Loja inválida.' };
  }

  const supabaseAdmin = createAdminClient();

  try {
    const { data: financRaw, error: errFinanc } = await (supabaseAdmin
      .from('financiamento_loja') as any)
      .select('id')
      .eq('venda_id', vendaId)
      .maybeSingle();

    if (errFinanc) return { success: false, message: 'Erro técnico ao buscar carnê.' };
    const financ = financRaw as any;

    // Recalcular dívida
    const { data: vendaReal } = await (supabaseAdmin.from('vendas') as any)
      .select('valor_final, valor_total')
      .eq('id', vendaId).single();

    const { data: pagamentos } = await (supabaseAdmin.from('pagamentos') as any)
      .select('valor_pago')
      .eq('venda_id', vendaId).neq('forma_pagamento', 'Carnê');

    const totalPagoDinheiro = pagamentos?.reduce((acc: number, p: any) => acc + Number(p.valor_pago), 0) || 0;
    const valorVenda = Number(vendaReal?.valor_final || vendaReal?.valor_total || 0);
    const dividaRestaurada = valorVenda - totalPagoDinheiro;

    // Soltar Venda
    const { error: erroUpdate } = await (supabaseAdmin.from('vendas') as any)
      .update({
        financiamento_id: null,
        valor_restante: dividaRestaurada,
        status: 'Em Aberto'
      })
      .eq('id', vendaId);

    if (erroUpdate) return { success: false, message: `Erro ao atualizar venda: ${erroUpdate.message}` };

    // Limpar tabelas
    if (financ?.id) {
      await (supabaseAdmin.from('financiamento_parcelas') as any).delete().eq('financiamento_id', financ.id);
      await (supabaseAdmin.from('financiamento_loja') as any).delete().eq('id', financ.id);
    }

    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`);
    return { success: true, message: 'Carnê excluído. Saldo restaurado.' };

  } catch (e: any) {
    return { success: false, message: `Erro de sistema: ${e.message}` };
  }
}

// ================================================================
// 20. ACTION: SALVAR OBSERVAÃ‡ÃƒO (CPF NA NOTA)
// ================================================================
export async function updateVendaObs(
  vendaId: number,
  storeId: number,
  obs: string
) {
  // Placeholder por enquanto
  return { success: true, message: 'CPF registrado (Simulado).' }
}

// ================================================================
// 21. ACTION: FINALIZAR VENDA EXPRESS (ATÃ”MICA) - CORRIGIDO FINAL
// ================================================================
export async function finalizarVendaExpress(formData: FormData) {
  const supabaseAdmin = createAdminClient()

  const { data: { user } } = await createClient().auth.getUser()

  if (!user) return { success: false, message: 'Sem permissão.' }
  const profile = await getProfileByAdmin(user.id)

  const rawItens = JSON.parse(formData.get('itens') as string)
  const rawPagamento = JSON.parse(formData.get('pagamento') as string)

  // CORREÃ‡ÃƒO 1: Conversão explícita para Number
  const storeId = parseInt(formData.get('store_id') as string)
  const employeeId = parseInt(formData.get('employee_id') as string)
  if (!(await isStoreModuleEnabledForStore(storeId, 'quickSale'))) {
    return { success: false, message: 'Modulo de venda rapida desativado para esta loja.' }
  }

  const data = {
    store_id: storeId,
    employee_id: employeeId,
    itens: formData.get('itens'),
    pagamento: rawPagamento,
    cpf_nota: formData.get('cpf_nota')
  }

  // 1. Busca Consumidor Final (ou cria)
  let customerId: number

  // CORREÃ‡ÃƒO: Usamos .select().limit(1) em vez de .maybeSingle().
  // Isso garante que se houver 50 "Consumidor Final", ele pega o primeiro e não dá erro.
  const { data: clientesExistentes } = await (supabaseAdmin
    .from('customers') as any)
    .select('id')
    .eq('store_id', storeId)
    .ilike('full_name', 'Consumidor Final')
    .limit(1)


  if (clientesExistentes && clientesExistentes.length > 0) {
    // Pega o primeiro que encontrar (reutiliza)
    customerId = clientesExistentes[0].id
  } else {
    // Se não existir NENHUM, cria um novo
    const { data: novo } = await (supabaseAdmin.from('customers') as any).insert({
      store_id: storeId,
      tenant_id: (profile as any).tenant_id,
      full_name: 'Consumidor Final'
    }).select().single()

    customerId = (novo as any).id
  }

  // 2. Calcula Totais
  const totalVenda = rawItens.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0)

  // 3. INSERÃ‡ÃƒO (Venda)
  const { data: novaVenda, error: errVenda } = await (supabaseAdmin.from('vendas') as any).insert({
    store_id: storeId,
    tenant_id: (profile as any).tenant_id,
    customer_id: customerId,
    employee_id: employeeId,
    created_by_user_id: user.id,
    status: 'Fechada',
    data_fechamento: new Date().toISOString(),
    valor_total: totalVenda,
    valor_final: totalVenda,
    valor_restante: 0
  }).select().single()

  if (errVenda) return { success: false, message: 'Erro ao criar venda.' }

  // 4. INSERÃ‡ÃƒO (Itens)
  const itensToInsert = rawItens.map((item: any) => ({
    tenant_id: (profile as any).tenant_id,
    store_id: storeId,
    venda_id: novaVenda.id,
    item_tipo: item.type === 'armacoes' ? 'Armacao' : 'Outro',
    descricao: item.description,
    quantidade: item.quantity,
    valor_unitario: item.price,
    valor_total_item: item.price * item.quantity,
    product_id: item.originalId,
    variant_id: null
  }))

  await (supabaseAdmin.from('venda_itens') as any).insert(itensToInsert)

  // 5. INSERÃ‡ÃƒO (Pagamento)
  const { data: novoPagamento } = await (supabaseAdmin.from('pagamentos') as any).insert({
    tenant_id: (profile as any).tenant_id,
    store_id: storeId,
    venda_id: novaVenda.id,
    created_by_user_id: user.id,
    valor_pago: data.pagamento.valor,
    forma_pagamento: data.pagamento.forma,
    parcelas: data.pagamento.parcelas,
    data_pagamento: data.pagamento.data,
    obs: data.cpf_nota ? `CPF Nota: ${data.cpf_nota}` : null
  }).select('id').single()

  await calcularERegistrarComissao(novaVenda.id)
  await calcularComissaoMedico(novaVenda.id)

  // Registra saídas de estoque
  await registrarSaidaVenda(novaVenda.id, storeId, user.id, (profile as any).tenant_id)

  revalidatePath(`/dashboard/loja/${storeId}/vendas`)
  revalidatePath(`/dashboard/loja/${storeId}/financeiro/comissoes`)
  return { success: true, message: 'Venda finalizada!', vendaId: novaVenda.id, pagamentoId: novoPagamento?.id as number | undefined }
}

// ================================================================
// 22. ACTION: CRIAR PARCIAL PARA CARNÃŠ (CORRIGIDO FINAL)
// ================================================================
export async function criarVendaParcialCarnê(formData: FormData) {
  const supabaseAdmin = createAdminClient()
  const { data: { user } } = await createClient().auth.getUser()
  const profile = await getProfileByAdmin(user!.id)

  // CORREÃ‡ÃƒO 1: Conversão explícita para Number
  const storeId = parseInt(formData.get('store_id') as string)
  const customerId = parseInt(formData.get('customer_id') as string)
  const employeeId = parseInt(formData.get('employee_id') as string)
  if (!(await isStoreModuleEnabledForStore(storeId, 'installments'))) {
    return { success: false, message: 'Modulo de parcelamento desativado para esta loja.' }
  }

  const rawItens = JSON.parse(formData.get('itens') as string)
  const totalVenda = rawItens.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0)

  // CORREÃ‡ÃƒO 2: Cast no insert da venda
  const { data: novaVenda, error } = await (supabaseAdmin.from('vendas') as any).insert({
    store_id: storeId,
    tenant_id: (profile as any).tenant_id,
    customer_id: customerId,
    employee_id: employeeId,
    created_by_user_id: user!.id,
    status: 'Em Aberto',
    valor_total: totalVenda,
    valor_final: totalVenda,
    valor_restante: totalVenda
  }).select().single()

  if (error) return { success: false, message: error.message }

  const itensToInsert = rawItens.map((item: any) => ({
    tenant_id: (profile as any).tenant_id,
    store_id: storeId,
    venda_id: novaVenda.id,
    item_tipo: item.type === 'armacoes' ? 'Armacao' : 'Outro',
    descricao: item.description,
    quantidade: item.quantity,
    valor_unitario: item.price,
    valor_total_item: item.price * item.quantity,
    product_id: item.originalId,
    variant_id: null
  }))

  // CORREÃ‡ÃƒO 3: Cast no insert dos itens
  await (supabaseAdmin.from('venda_itens') as any).insert(itensToInsert)

  // Registra saídas de estoque (itens saem da loja mesmo com pagamento pendente)
  await registrarSaidaVenda(novaVenda.id, storeId, user!.id, (profile as any).tenant_id)

  await calcularERegistrarComissao(novaVenda.id)

  revalidatePath(`/dashboard/loja/${storeId}/financeiro/comissoes`)

  return { success: true, vendaId: novaVenda.id }
}

// ================================================================
// 23. ACTION: AUTENTICAR FUNCIONÃRIO POR PIN (FALTAVA ISSO)
// ================================================================
export type AuthEmployeeResult = {
  success: boolean
  message: string
  employee?: {
    id: number
    full_name: string
    role: 'vendedor' | 'gerente' | 'tecnico'
  }
}

export async function autenticarFuncionarioPorPin(
  prevState: AuthEmployeeResult,
  formData: FormData
): Promise<AuthEmployeeResult> {
  const storeId = parseInt(formData.get('store_id') as string)
  const pin = formData.get('pin') as string

  // Usamos AdminClient para ler o PIN (que é um dado sensível/interno)
  const supabaseAdmin = createAdminClient()

  try {
    const { data: employee } = await supabaseAdmin
      .from('employees')
      .select('id, full_name, role, is_active')
      .eq('store_id', storeId)
      .eq('pin', pin)
      .eq('is_active', true) // Só aceita ativos
      .maybeSingle()

    if (employee) {
      const emp: any = employee
      return {
        success: true,
        message: 'Autenticado com sucesso.',
        employee: {
          id: emp.id,
          full_name: emp.full_name,
          role: emp.role as 'vendedor' | 'gerente' | 'tecnico' || 'vendedor'
        }
      }
    }


    return { success: false, message: 'PIN incorreto ou funcionário inativo.' }

  } catch (error) {
    console.error("Erro auth pin:", error)
    return { success: false, message: 'Erro ao validar PIN.' }
  }
}
// ================================================================
// 24. ACTION: BUSCAR HISTÃ“RICO DE VENDAS (DOSSIÃŠ DO CLIENTE) - V3 (FINAL)
// ================================================================
export type CustomerSaleHistory = {
  venda_id: number
  data: string
  valor_total: number
  status_venda: string
  paciente_nome: string
  itens: {
    descricao: string
    quantidade: number
    valor_unitario: number
    valor_total: number
  }[]
  financeiro: {
    tem_carne: boolean
    status_geral: 'Quitado' | 'Em dia' | 'Atrasado'
    resumo_parcelas: string
    parcelas_detalhes: {
      numero: number
      valor: number
      vencimento: string
      status: string
    }[]
    forma_pagamento_resumo: string // NOVO CAMPO
  }
  tecnico: {
    tem_os: boolean
    os_id?: number
    longe_od: string
    longe_oe: string
    adicao: string
    medico: string
  } | null
}

export async function getLastSalesForCustomer(storeId: number, customerId: number): Promise<{ success: boolean, data?: CustomerSaleHistory[] }> {
  const supabaseAdmin = createAdminClient()

  try {
    // 1. Busca as vendas
    const { data: vendas, error: errVendas } = await supabaseAdmin
      .from('vendas')
      .select('id, created_at, valor_final, status, customer_id')
      .eq('store_id', storeId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(2)

    if (errVendas || !vendas || vendas.length === 0) return { success: true, data: [] }

    const vendasIds = (vendas as any[]).map(v => v.id)


    // 2. Busca dados relacionados
    const [itensRes, osRes, financRes, clienteRes, pagtosRes] = await Promise.all([
      supabaseAdmin.from('venda_itens').select('venda_id, descricao, quantity:quantidade, unit_price:valor_unitario, total:valor_total_item').in('venda_id', vendasIds),
      supabaseAdmin.from('service_orders').select('*, dependentes(full_name), oftalmologistas(nome_completo)').in('venda_id', vendasIds),
      supabaseAdmin.from('financiamento_loja').select('*, financiamento_parcelas(numero_parcela, valor_parcela, data_vencimento, status)').in('venda_id', vendasIds),
      supabaseAdmin.from('customers').select('full_name').eq('id', customerId).single(),
      supabaseAdmin.from('pagamentos').select('venda_id, forma_pagamento, parcelas').in('venda_id', vendasIds)
    ])


    const clienteNome = (clienteRes.data as any)?.full_name || 'Cliente'


    // 3. Monta o Dossiê
    const history: CustomerSaleHistory[] = vendas.map((v: any) => {

      // A. Itens

      const rawItens = (itensRes.data as any[])?.filter(i => i.venda_id === v.id) || []

      const itensFormatados = rawItens.map((i: any) => ({
        descricao: i.descricao,
        quantidade: i.quantity,
        valor_unitario: i.unit_price,
        valor_total: i.total
      }))

      // B. OS / Paciente
      const os = (osRes.data as any[])?.find(o => o.venda_id === v.id)

      let paciente = clienteNome
      if (os?.dependentes?.full_name) paciente = os.dependentes.full_name
      else if (os && !os.dependente_id) paciente = clienteNome

      // C. Financeiro & Forma de Pagamento

      const financ = (financRes.data as any[])?.find(f => f.venda_id === v.id)
      const pagamentosDaVenda = (pagtosRes.data as any[])?.filter(p => p.venda_id === v.id) || []


      let finStatus: 'Quitado' | 'Em dia' | 'Atrasado' = 'Quitado'
      let finResumo = '' // Ex: "3/5 Parc."
      let formaResumo = '' // Ex: "Pix", "Cartão 3x"
      let parcelasDetalhadas: any[] = []

      if (financ) {
        // Lógica Carnê
        const parcelas = financ.financiamento_parcelas || []
        parcelas.sort((a: any, b: any) => a.numero_parcela - b.numero_parcela)

        parcelasDetalhadas = parcelas.map((p: any) => ({
          numero: p.numero_parcela,
          valor: p.valor_parcela,
          vencimento: p.data_vencimento,
          status: p.status
        }))

        const totalP = parcelas.length
        const pagas = parcelas.filter((p: any) => p.status === 'Pago').length
        const atrasadas = parcelas.filter((p: any) => p.status === 'Pendente' && new Date(p.data_vencimento) < new Date(new Date().setHours(0, 0, 0, 0))).length

        finResumo = `${pagas}/${totalP} Parc.`

        if (atrasadas > 0) finStatus = 'Atrasado'
        else if (pagas < totalP) finStatus = 'Em dia'
        else finStatus = 'Quitado'

        formaResumo = `Carnê (${totalP}x)`
      } else {
        // Lógica Pagamento Comum
        if (pagamentosDaVenda.length > 0) {
          // Pega a forma principal (ou concatena se tiver várias)
          const formasUnicas = Array.from(new Set(pagamentosDaVenda.map((p: any) => {
            const parc = p.parcelas > 1 ? ` ${p.parcelas}x` : ''
            return `${p.forma_pagamento}${parc}`
          })))
          formaResumo = formasUnicas.join(' + ')
        } else {
          formaResumo = 'Pendente'
        }
      }

      // D. Dados Técnicos (Mantido igual)
      let tecnicoData = null
      if (os) {
        tecnicoData = {
          tem_os: true,
          os_id: os.id,
          longe_od: `${os.receita_longe_od_esferico || ''} ${os.receita_longe_od_cilindrico || ''}`.trim() || '-',
          longe_oe: `${os.receita_longe_oe_esferico || ''} ${os.receita_longe_oe_cilindrico || ''}`.trim() || '-',
          adicao: os.receita_adicao || '-',
          medico: os.oftalmologistas?.nome_completo || 'Não informado'
        }
      }

      return {
        venda_id: v.id,
        data: v.created_at,
        valor_total: v.valor_final,
        status_venda: v.status,
        paciente_nome: paciente,
        itens: itensFormatados,
        financeiro: {
          tem_carne: !!financ,
          status_geral: finStatus,
          resumo_parcelas: finResumo,
          parcelas_detalhes: parcelasDetalhadas,
          forma_pagamento_resumo: formaResumo // Enviando pro front
        },
        tecnico: tecnicoData
      }
    })

    return { success: true, data: history }

  } catch (e: any) {
    console.error("Erro ao buscar histórico:", e)
    return { success: false, data: [] }
  }
}

// ================================================================
// 25. ACTION: BUSCAR HISTÃ“RICO DE RECEITAS (MODAL DE IMPORTAÃ‡ÃƒO)
// ================================================================
export type PrescriptionHistoryItem = {
  id: number
  created_at: string
  receita_longe_od_esferico: string | null
  receita_longe_od_cilindrico: string | null
  receita_longe_od_eixo: string | null
  receita_longe_oe_esferico: string | null
  receita_longe_oe_cilindrico: string | null
  receita_longe_oe_eixo: string | null
  receita_perto_od_esferico: string | null
  receita_perto_od_cilindrico: string | null
  receita_perto_od_eixo: string | null
  receita_perto_oe_esferico: string | null
  receita_perto_oe_cilindrico: string | null
  receita_perto_oe_eixo: string | null
  receita_adicao: string | null
  medida_dnp_od: string | null
  medida_dnp_oe: string | null
  oftalmologistas: {
    nome_completo: string
  } | null
}

export async function getCustomerPrescriptionHistory(
  customerId: number,
  storeId: number,
  dependenteId: number | null
): Promise<PrescriptionHistoryItem[]> {
  const supabaseAdmin = createAdminClient()

  try {
    let query = supabaseAdmin
      .from('service_orders')
      .select(`
            id, created_at,
            receita_longe_od_esferico, receita_longe_od_cilindrico, receita_longe_od_eixo,
            receita_longe_oe_esferico, receita_longe_oe_cilindrico, receita_longe_oe_eixo,
            receita_perto_od_esferico, receita_perto_od_cilindrico, receita_perto_od_eixo,
            receita_perto_oe_esferico, receita_perto_oe_cilindrico, receita_perto_oe_eixo,
            receita_adicao, medida_dnp_od, medida_dnp_oe,
            oftalmologistas ( nome_completo )
        `)
      .eq('store_id', storeId)
      .eq('customer_id', customerId)
      // Filtra para pegar apenas receitas que tenham algum dado preenchido
      .not('receita_longe_od_esferico', 'is', null)
      .order('created_at', { ascending: false })

    // Se um dependente específico estiver selecionado, filtra por ele.
    // Se não (dependenteId é null), busca as receitas do Titular (onde dependente_id é null)
    if (dependenteId) {
      query = query.eq('dependente_id', dependenteId)
    } else {
      query = query.is('dependente_id', null)
    }

    const { data, error } = await query

    if (error) {
      console.error('Erro ao buscar histórico de receitas:', error)
      return []
    }

    return data as any
  } catch (e) {
    return []
  }
}

// ... (imports)

// ================================================================
// 26. ACTION: BUSCAR PENDÃŠNCIAS (VERSÃƒO CORRIGIDA E LIMPA)
// ================================================================
export async function searchPendenciasCliente(storeId: number, termo: string) {
  const supabaseAdmin = createAdminClient()
  const cleanTerm = termo.trim()
  const normalizeSearch = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  const normalizedTerm = normalizeSearch(cleanTerm)
  const searchTokens = normalizedTerm.split(/\s+/).filter(Boolean)
  const firstToken = searchTokens[0] || ''
  const cpfDigits = cleanTerm.replace(/\D/g, '')

  console.log(`[DEBUG] Iniciando busca para: "${cleanTerm}" na Loja: ${storeId}`)

  try {
    let parcelasQuery = supabaseAdmin
        .from('financiamento_parcelas')
        .select(`
            id,
            numero_parcela,
            valor_parcela,
            data_vencimento,
            financiamento_id,
            customer_id,
            status,
            financiamento_loja (
                venda_id,
                vendas!financiamento_loja_venda_id_fkey (
                    created_at,
                    service_orders (
                        dependente_id,
                        dependentes ( full_name )
                    )
                )
            ),
            customers!inner(id, full_name, cpf)
        `)
        .eq('store_id', storeId)
        .gt('valor_parcela', 0.01)
        .not('status', 'in', '("Pago","Quitado","Cancelado","Cancelada","pago","quitado","cancelado","cancelada")')

    if (cpfDigits.length > 0) {
        parcelasQuery = parcelasQuery.or(`cpf.ilike.%${cpfDigits}%,full_name.ilike.%${firstToken || cleanTerm}%`, { referencedTable: 'customers' })
    } else if (firstToken) {
        parcelasQuery = parcelasQuery.ilike('customers.full_name', `%${firstToken}%`)
    }

    const { data: parcelasBrutas, error: errParc } = await parcelasQuery.limit(500)

    if (errParc) {
      console.error("[DEBUG] Erro ao buscar parcelas:", errParc.message)
      return []
    }

    const parcelas = parcelasBrutas || []

    const parcelasFiltradas = parcelas.filter((p: any) => {
        const clienteName = normalizeSearch(p.customers?.full_name || '')
        if (searchTokens.length <= 1) return true
        return searchTokens.every((token: string) => clienteName.includes(token))
    })

    console.log(`[DEBUG] Parcelas pendentes encontradas:`, parcelasFiltradas.length)

    const agrupado = parcelasFiltradas.reduce((acc: any, p: any) => {
        const cliId = p.customer_id
        if (!acc[cliId]) {
            acc[cliId] = {
                cliente: p.customers,
                parcelas: []
            }
        }
        
        const venda = p.financiamento_loja?.vendas
        const os = venda?.service_orders?.[0]
        const nomeDependente = os?.dependentes?.full_name
        const nomeTitular = p.customers?.full_name
        const beneficiario = (nomeDependente && nomeDependente !== nomeTitular) ? nomeDependente : null

        acc[cliId].parcelas.push({
            id: p.id,
            numero_parcela: p.numero_parcela,
            valor_parcela: p.valor_parcela,
            data_vencimento: p.data_vencimento,
            venda_id: p.financiamento_loja?.venda_id,
            data_venda: venda?.created_at,
            beneficiario: beneficiario
        })
        return acc
    }, {})

    const resultado = Object.values(agrupado)

    console.log(`[DEBUG] Sucesso! Retornando ${resultado.length} grupos.`)
    return resultado

  } catch (e) {
    console.error("[DEBUG] Exceção crítica:", e)
    return []
  }
}

// ================================================================
// 27. ACTION: MARCAR PAGAMENTOS COMO IMPRESSOS
// ================================================================
export async function markPaymentsAsPrinted(
  paymentIds: number[]
): Promise<{ success: boolean }> {
  const supabaseAdmin = createAdminClient()
  try {
    await (supabaseAdmin.from('pagamentos') as any)
      .update({ receipt_printed_at: new Date().toISOString() })
      .in('id', paymentIds)

    return { success: true }
  } catch (e) {
    console.error("Erro ao marcar impressão:", e)
    return { success: false }
  }
}

// ... (mantenha o restante do arquivo como está)

// ================================================================
// 28. ACTION: BUSCAR ITENS COMPRADOS (PARA ASSISTÃŠNCIA)
// ================================================================
export type ItemComprado = {
  venda_item_id: number
  venda_id: number
  data_venda: string
  descricao: string
  product_id: number | null
  valor: number
}

export async function getItensCompradosPorCliente(storeId: number, customerId: number): Promise<ItemComprado[]> {
  const supabaseAdmin = createAdminClient()

  try {
    // Busca itens das últimas 20 vendas do cliente
    // Cast 'as any' para garantir os joins
    const { data, error } = await (supabaseAdmin.from('venda_itens') as any)
      .select(`
                id,
                descricao,
                product_id,
                valor_total_item,
                vendas!inner ( id, created_at, status )
            `)
      .eq('store_id', storeId)
      .eq('vendas.customer_id', customerId)
      .neq('vendas.status', 'Cancelada') // Ignora canceladas
      .order('id', { ascending: false })
      .limit(50)

    if (error) throw error

    return (data || []).map((i: any) => ({
      venda_item_id: i.id,
      venda_id: i.vendas.id,
      data_venda: i.vendas.created_at,
      descricao: i.descricao,
      product_id: i.product_id,
      valor: i.valor_total_item
    }))

  } catch (e) {
    console.error("Erro ao buscar compras:", e)
    return []
  }
}

// ================================================================
// 29. INTERNAL: ATUALIZAR RANKING DO CLIENTE (SILENCIOSO)
// ================================================================

export async function atualizarRankingCliente(clienteId: string) {
  const supabase = createClient()

  // 1. Soma o valor total das vendas fechadas desse cliente
  const { data: vendas, error } = await supabase
    .from('vendas')
    .select('valor_final')
    .eq('customer_id', clienteId)
    .eq('status', 'Fechada')

  if (error) {
    console.error('Erro ao calcular ranking:', error)
    return
  }

  const totalGasto = vendas?.reduce((acc, v) => acc + (v.valor_final || 0), 0) || 0

  // 2. Define a nova classificação baseada no valor gasto
  let novoRanking = 'Bronze'
  if (totalGasto >= 5000) {
    novoRanking = 'Diamante'
  } else if (totalGasto >= 2500) {
    novoRanking = 'Ouro'
  } else if (totalGasto >= 1000) {
    novoRanking = 'Prata'
  }

  // 3. Atualiza o cliente na tabela 'customers'
  await supabase
    .from('customers')
    .update({ ranking: novoRanking })
    .eq('id', clienteId)
}

// ================================================================
// 30. ACTION: ATUALIZAR CAMPOS EXPERIMENTAIS (OBS E NF)
// ================================================================
export async function updateVendaExperimentalFields(
  vendaId: number,
  storeId: number,
  fields: { obs_geral?: string | null; nf_emitida?: boolean }
): Promise<{ success: boolean; message: string }> {
  const supabaseAdmin = createAdminClient()
  try {
    const { error } = await (supabaseAdmin.from('vendas') as any)
      .update(fields)
      .eq('id', vendaId)
      .eq('store_id', storeId)

    if (error) throw error

    revalidatePath(`/dashboard/loja/${storeId}/vendas`)
    revalidatePath(`/dashboard/loja/${storeId}/financeiro/relatorios`, 'layout')
    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}/experimental`)
    
    return { success: true, message: 'Dados atualizados com sucesso.' }
  } catch (e: any) {
    console.error("Erro ao atualizar campos experimentais:", e)
    return { success: false, message: e.message }
  }
}


// ================================================================
// 31. ACTION: TRANSFERIR TITULARIDADE DA VENDA
// ================================================================
export async function transferirTitularidadeVenda(
  vendaId: number,
  storeId: number,
  novoCustomerId: number,
  justificativa: string,
  authedEmployeeId: number,
  authedEmployeeName: string
): Promise<{ success: boolean; message: string }> {
  try {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    
    if (!user) return { success: false, message: 'Usuário não autenticado.' }

    // 1. Validar a Venda e checar permissão via employee_id (PIN)
    const { data: venda, error: vendaError } = await (supabaseAdmin.from('vendas') as any)
      .select('customer_id, employee_id, created_by_user_id, financiamento_id')
      .eq('id', vendaId)
      .eq('store_id', storeId)
      .single()

    if (vendaError || !venda) throw new Error('Venda não encontrada.')

    // O funcionário autenticado por PIN deve ser quem abriu a venda
    if (venda.employee_id !== authedEmployeeId) {
      return { success: false, message: 'Apenas o vendedor que abriu esta venda pode transferir a titularidade.' }
    }

    if (Number(venda.customer_id) === Number(novoCustomerId)) {
      return { success: false, message: 'O novo titular deve ser diferente do atual.' }
    }

    // Identifica Tenant ID para o log de histórico
    const { data: profile } = await (supabaseAdmin.from('profiles') as any)
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    const oldCustomerId = venda.customer_id

    // Atualização em múltiplas tabelas (cascata lógica)
    const { error: errorVenda } = await (supabaseAdmin.from('vendas') as any)
      .update({ customer_id: novoCustomerId })
      .eq('id', vendaId)
      .eq('store_id', storeId)

    if (errorVenda) throw new Error('Erro ao atualizar titular da venda.')

    await (supabaseAdmin.from('service_orders') as any)
      .update({ customer_id: novoCustomerId })
      .eq('venda_id', vendaId)
      .eq('store_id', storeId)

    await (supabaseAdmin.from('financiamento_loja') as any)
      .update({ customer_id: novoCustomerId })
      .eq('venda_id', vendaId)
      .eq('store_id', storeId)

    const { data: financiamentos } = await (supabaseAdmin.from('financiamento_loja') as any)
      .select('id')
      .eq('venda_id', vendaId)
      .eq('store_id', storeId)

    const financiamentoIds = (financiamentos || []).map((f: any) => f.id)

    if (financiamentoIds.length > 0) {
      await (supabaseAdmin.from('financiamento_parcelas') as any)
        .update({ customer_id: novoCustomerId })
        .in('financiamento_id', financiamentoIds)
        .eq('store_id', storeId)
    }

    // Log Auditoria no novo cliente
    if (profile?.tenant_id) {
      await (supabaseAdmin.from('cobranca_historico') as any)
        .insert({
          tenant_id: profile.tenant_id,
          store_id: storeId,
          customer_id: novoCustomerId,
          venda_id: vendaId,
          tipo_contato: 'Auditoria',
          resumo_conversa: `[Transferência de Titularidade] Venda #$` + `{vendaId} transferida do cliente ID $` + `{oldCustomerId}. Autorizado por: $` + `{authedEmployeeName} (ID $` + `{authedEmployeeId}). Motivo: $` + `{justificativa}`,
          registrado_por_id: user.id
        })
    }

    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`)
    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}/experimental`)
    revalidatePath(`/dashboard/loja/${storeId}/vendas`)
    
    return { success: true, message: 'Titularidade transferida com sucesso! Lembre-se de revisar os dependentes manualmente dentro de cada OS.' }
  } catch (error: any) {
    console.error('Erro na transferência:', error)
    return { success: false, message: error.message || 'Erro inesperado.' }
  }
}
