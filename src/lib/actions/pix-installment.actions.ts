'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getInstallmentOutstanding } from '@/lib/installment-balance'
import { getStoreProfile } from '@/lib/actions/store.actions'
import {
  cancelSicrediImmediateCharge,
  createSicrediImmediateCharge,
  getSicrediImmediateCharge,
} from '@/lib/pix/sicredi-client.server'
import type { StoreSettings } from '@/lib/store-modules'
import { sendManualWhatsApp } from '@/lib/actions/manual-whatsapp.actions'
import { isSicrediPilotStoreCnpj } from '@/lib/pix/sicredi-availability'

type PixChargeStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'DIVERGENT' | 'ERROR'

export type PixInstallmentCharge = {
  id: number
  installmentId: number
  txid: string
  status: PixChargeStatus
  amount: number
  interestAmount: number
  strategy: 'quitacao_total' | 'baixa_parcial' | 'somar_proxima'
  pixCopyPaste: string | null
  location: string | null
  expiresAt: string | null
  createdAt: string
  paidAt: string | null
}

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; message: string }
type AccessProfile = { role: string; store_id: number | null }

const CreateChargeSchema = z.object({
  storeId: z.number().int().positive(),
  installmentId: z.number().int().positive(),
  employeeId: z.number().int().positive(),
  amount: z.number().positive().finite(),
  interestAmount: z.number().min(0).finite().default(0),
  strategy: z.enum(['quitacao_total', 'baixa_parcial', 'somar_proxima']),
})

const ChargeActionSchema = z.object({
  storeId: z.number().int().positive(),
  chargeId: z.number().int().positive(),
  employeeId: z.number().int().positive().optional(),
})

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function serializeCharge(row: any): PixInstallmentCharge {
  return {
    id: Number(row.id),
    installmentId: Number(row.installment_id),
    txid: String(row.txid),
    status: row.status as PixChargeStatus,
    amount: toNumber(row.amount),
    interestAmount: toNumber(row.interest_amount),
    strategy: row.strategy as PixInstallmentCharge['strategy'],
    pixCopyPaste: typeof row.pix_copy_paste === 'string' ? row.pix_copy_paste : null,
    location: typeof row.location === 'string' ? row.location : null,
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
    createdAt: String(row.created_at),
    paidAt: typeof row.paid_at === 'string' ? row.paid_at : null,
  }
}

function pixChargesTable(admin: any) {
  return admin.from('pix_installment_charges') as any
}

function mapSicrediStatus(status: string, expiresAt: string | null): PixChargeStatus {
  if (status === 'CONCLUIDA') return 'PAID'
  if (status === 'REMOVIDA_PELO_USUARIO_RECEBEDOR') return 'CANCELLED'
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return 'EXPIRED'
  return 'PENDING'
}

async function requireStoreAccess(storeId: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Usuario nao autenticado.')

  const profile = await getProfileByAdmin(user.id) as AccessProfile | null
  if (!profile || (profile.role !== 'admin' && profile.store_id !== storeId)) {
    throw new Error('Acesso negado para esta loja.')
  }

  return { userId: user.id, profile, admin: createAdminClient() }
}

async function assertEmployeeBelongsToStore(admin: any, employeeId: number, storeId: number) {
  const { data: employee, error } = await admin
    .from('employees')
    .select('id, store_id')
    .eq('id', employeeId)
    .eq('store_id', storeId)
    .maybeSingle()
  if (error || !employee) throw new Error('Funcionário autorizador invalido para esta loja.')
}

async function getInstallmentContext(admin: any, storeId: number, installmentId: number) {
  const { data: installment, error: installmentError } = await admin
    .from('financiamento_parcelas')
    .select('id, tenant_id, store_id, financiamento_id, numero_parcela, data_vencimento, valor_parcela, valor_pago, valor_transferido_entrada, valor_transferido_saida, valor_renegociado_saida, status, customer_id')
    .eq('id', installmentId)
    .eq('store_id', storeId)
    .maybeSingle()
  if (installmentError || !installment) throw new Error('Parcela nao encontrada para esta loja.')
  if (String(installment.status).toLowerCase() === 'pago') throw new Error('Esta parcela ja esta paga.')

  const { data: financing, error: financingError } = await admin
    .from('financiamento_loja')
    .select('id, venda_id, customer_id')
    .eq('id', installment.financiamento_id)
    .maybeSingle()
  if (financingError || !financing) throw new Error('Financiamento da parcela nao encontrado.')

  return { installment, financing }
}

function revalidateInstallmentPaths(storeId: number) {
  revalidatePath(`/dashboard/loja/${storeId}`)
  revalidatePath(`/dashboard/loja/${storeId}/financeiro/parcelas`)
  revalidatePath(`/dashboard/loja/${storeId}/reports/parcelamento`)
}

async function expireLocalChargeIfNeeded(admin: any, row: any) {
  if (row.status === 'PENDING' && row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    const { data, error } = await pixChargesTable(admin)
      .update({ status: 'EXPIRED', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .select('*')
      .single()
    if (!error && data) return data
  }
  return row
}

export async function getPixProviderForStore(storeId: number): Promise<'manual' | 'sicredi'> {
  try {
    await requireStoreAccess(storeId)
    const store = await getStoreProfile(storeId)
    if (!isSicrediPilotStoreCnpj(store?.cnpj)) return 'manual'
    const provider = (store?.settings as StoreSettings | null)?.pix_provider
    return provider === 'sicredi' ? 'sicredi' : 'manual'
  } catch {
    return 'manual'
  }
}

export async function getPixChargesForInstallments(
  storeId: number,
  installmentIds: number[],
): Promise<Record<number, PixInstallmentCharge>> {
  if (!installmentIds.length) return {}
  try {
    const { admin } = await requireStoreAccess(storeId)
    const { data, error } = await pixChargesTable(admin)
      .select('*')
      .eq('store_id', storeId)
      .in('installment_id', installmentIds)
      .order('created_at', { ascending: false })
    if (error) throw error

    const byInstallment: Record<number, PixInstallmentCharge> = {}
    for (const row of data || []) {
      const current = await expireLocalChargeIfNeeded(admin, row)
      const installmentId = Number(current.installment_id)
      if (!byInstallment[installmentId]) byInstallment[installmentId] = serializeCharge(current)
    }
    return byInstallment
  } catch {
    return {}
  }
}

export async function createPixInstallmentCharge(input: z.input<typeof CreateChargeSchema>): Promise<ActionResult<PixInstallmentCharge>> {
  try {
    const data = CreateChargeSchema.parse(input)
    const { admin, userId } = await requireStoreAccess(data.storeId)
    await assertEmployeeBelongsToStore(admin, data.employeeId, data.storeId)

    const store = await getStoreProfile(data.storeId)
    if (!isSicrediPilotStoreCnpj(store?.cnpj)) {
      throw new Error('A integração Sicredi está liberada somente para a Ótica Ocular.')
    }
    const settings = (store?.settings as StoreSettings | null)
    if (settings?.pix_provider !== 'sicredi') {
      throw new Error('A integração Pix Sicredi não está habilitada para esta loja.')
    }

    const { installment, financing } = await getInstallmentContext(admin, data.storeId, data.installmentId)
    const tenantId = installment.tenant_id || store?.tenant_id
    if (!tenantId) throw new Error('Tenant da loja não encontrado para registrar a cobrança Pix.')
    const outstanding = getInstallmentOutstanding(installment)
    const principalAmount = data.amount - data.interestAmount
    if (principalAmount <= 0) throw new Error('Os juros nao podem ser iguais ou maiores que o valor cobrado.')
    if (principalAmount < outstanding - 0.01 && data.strategy === 'quitacao_total') {
      throw new Error('Escolha como tratar o saldo restante da parcela.')
    }

    const { data: pendingRows, error: pendingError } = await pixChargesTable(admin)
      .select('*')
      .eq('installment_id', data.installmentId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(1)
    if (pendingError) throw new Error('Nao foi possivel verificar cobranças Pix pendentes.')
    const pending = pendingRows?.[0] ? await expireLocalChargeIfNeeded(admin, pendingRows[0]) : null
    if (pending?.status === 'PENDING') {
      return { success: true, data: serializeCharge(pending) }
    }

    const pixKey = process.env.SICREDI_PIX_HML_PIX_KEY?.trim()
    if (!pixKey) {
      throw new Error('Configuracao Sicredi ausente: SICREDI_PIX_HML_PIX_KEY.')
    }

    const expirationSeconds = Number(process.env.SICREDI_PIX_HML_CHARGE_EXPIRATION_SECONDS || 86_400)
    const charge = await createSicrediImmediateCharge({
      pixKey,
      amount: data.amount,
      expirationSeconds: Number.isInteger(expirationSeconds) && expirationSeconds >= 60 ? expirationSeconds : 86_400,
      payerRequest: `Parcela ${installment.numero_parcela} da venda ${financing.venda_id}`,
      additionalInfo: [
        { name: 'Venda', value: String(financing.venda_id) },
        { name: 'Parcela', value: String(installment.numero_parcela) },
      ],
    })
    if (!charge.pixCopyPaste) throw new Error('O Sicredi nao retornou o codigo Pix copia e cola.')

    const createdAt = charge.createdAt ? new Date(charge.createdAt) : new Date()
    const expiresAt = charge.expirationSeconds
      ? new Date(createdAt.getTime() + charge.expirationSeconds * 1000).toISOString()
      : null
    const { data: inserted, error: insertError } = await pixChargesTable(admin)
      .insert({
        tenant_id: tenantId,
        store_id: data.storeId,
        customer_id: installment.customer_id || financing.customer_id || null,
        venda_id: financing.venda_id,
        financiamento_id: installment.financiamento_id,
        installment_id: installment.id,
        provider: 'sicredi',
        txid: charge.txid,
        status: mapSicrediStatus(charge.status, expiresAt),
        amount: data.amount.toFixed(2),
        interest_amount: data.interestAmount.toFixed(2),
        strategy: data.strategy,
        pix_copy_paste: charge.pixCopyPaste,
        location: charge.location,
        expires_at: expiresAt,
        created_by_employee_id: data.employeeId,
        created_by_user_id: userId,
        provider_response: charge.raw,
      })
      .select('*')
      .single()
    if (insertError || !inserted) throw new Error('A cobrança foi criada no Sicredi, mas não foi possível registrá-la no sistema.')

    revalidateInstallmentPaths(data.storeId)
    return { success: true, data: serializeCharge(inserted) }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel gerar a cobrança Pix.' }
  }
}

export async function refreshPixInstallmentCharge(input: z.input<typeof ChargeActionSchema>): Promise<ActionResult<PixInstallmentCharge>> {
  try {
    const data = ChargeActionSchema.parse(input)
    const { admin } = await requireStoreAccess(data.storeId)
    const { data: row, error } = await pixChargesTable(admin)
      .select('*')
      .eq('id', data.chargeId)
      .eq('store_id', data.storeId)
      .maybeSingle()
    if (error || !row) throw new Error('Cobrança Pix não encontrada.')

    const remote = await getSicrediImmediateCharge(row.txid)
    const status = mapSicrediStatus(remote.status, row.expires_at || null)
    const { data: updated, error: updateError } = await pixChargesTable(admin)
      .update({
        status,
        pix_copy_paste: remote.pixCopyPaste || row.pix_copy_paste,
        location: remote.location || row.location,
        paid_at: status === 'PAID' ? new Date().toISOString() : row.paid_at,
        provider_response: remote.raw,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select('*')
      .single()
    if (updateError || !updated) throw new Error('Nao foi possivel atualizar o status da cobrança Pix.')

    revalidateInstallmentPaths(data.storeId)
    return { success: true, data: serializeCharge(updated) }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel consultar a cobrança Pix.' }
  }
}

export async function cancelPixInstallmentCharge(input: z.input<typeof ChargeActionSchema>): Promise<ActionResult<PixInstallmentCharge>> {
  try {
    const data = ChargeActionSchema.parse(input)
    if (!data.employeeId) throw new Error('Funcionário autorizador obrigatório.')
    const { admin } = await requireStoreAccess(data.storeId)
    await assertEmployeeBelongsToStore(admin, data.employeeId, data.storeId)
    const { data: row, error } = await pixChargesTable(admin)
      .select('*')
      .eq('id', data.chargeId)
      .eq('store_id', data.storeId)
      .maybeSingle()
    if (error || !row) throw new Error('Cobrança Pix não encontrada.')
    if (row.status !== 'PENDING') throw new Error('Apenas cobranças Pix pendentes podem ser canceladas.')

    const remoteBeforeCancellation = await getSicrediImmediateCharge(row.txid)
    if (remoteBeforeCancellation.status === 'CONCLUIDA') {
      const { data: paid } = await pixChargesTable(admin)
        .update({ status: 'PAID', paid_at: new Date().toISOString(), provider_response: remoteBeforeCancellation.raw, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .select('*')
        .single()
      if (!paid) throw new Error('A cobrança já foi paga. Atualize a tela antes de gerar outra.')
      return { success: false, message: 'A cobrança já foi paga e não pode ser cancelada.' }
    }

    const cancelled = await cancelSicrediImmediateCharge(row.txid)
    const { data: updated, error: updateError } = await pixChargesTable(admin)
      .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString(), provider_response: cancelled.raw, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .select('*')
      .single()
    if (updateError || !updated) throw new Error('Nao foi possivel registrar o cancelamento da cobrança Pix.')

    revalidateInstallmentPaths(data.storeId)
    return { success: true, data: serializeCharge(updated) }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel cancelar a cobrança Pix.' }
  }
}

export async function sendPixInstallmentChargeWhatsApp(input: z.input<typeof ChargeActionSchema>): Promise<ActionResult<{ externalUrl?: string; shouldOpenExternal?: boolean }>> {
  try {
    const data = ChargeActionSchema.parse(input)
    const { admin } = await requireStoreAccess(data.storeId)
    const { data: charge, error } = await pixChargesTable(admin)
      .select('*')
      .eq('id', data.chargeId)
      .eq('store_id', data.storeId)
      .maybeSingle()
    if (error || !charge) throw new Error('Cobrança Pix não encontrada.')
    if (charge.status !== 'PENDING') throw new Error('A cobrança Pix não está pendente para envio.')
    if (!charge.pix_copy_paste) throw new Error('Código Pix copia e cola indisponível.')

    const { data: customer } = await (admin.from('customers') as any)
      .select('full_name, fone_movel, phone')
      .eq('id', charge.customer_id)
      .maybeSingle()
    const phone = String(customer?.fone_movel || customer?.phone || '').trim()
    if (!phone) throw new Error('O cliente não possui telefone cadastrado para WhatsApp.')

    const message = [
      `Olá${customer?.full_name ? `, ${customer.full_name}` : ''}.`,
      `Segue o Pix referente à parcela da venda #${charge.venda_id}: R$ ${Number(charge.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
      'Copie e cole o código abaixo no aplicativo do seu banco:',
      String(charge.pix_copy_paste),
    ].join('\n\n')
    const result = await sendManualWhatsApp({
      storeId: data.storeId,
      remotePhone: phone,
      messageText: message,
      messageType: 'pix_charge',
      source: 'pix.installment_charge',
      metadata: { pixChargeId: charge.id, txid: charge.txid },
    })
    if (!result.success) throw new Error(result.message)
    return { success: true, data: { externalUrl: result.externalUrl, shouldOpenExternal: result.shouldOpenExternal } }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Não foi possível enviar a cobrança Pix.' }
  }
}
