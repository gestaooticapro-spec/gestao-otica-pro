'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getStoreProfile } from '@/lib/actions/store.actions'
import { registrarSaidaVenda, updateVendaStatus } from '@/lib/actions/vendas.actions'
import { isSicrediPilotStoreCnpj } from '@/lib/pix/sicredi-availability'
import {
  cancelSicrediImmediateCharge,
  createSicrediImmediateCharge,
  getSicrediImmediateCharge,
  SicrediPixHttpError,
} from '@/lib/pix/sicredi-client.server'
import { issueEmployeeAuthorization, verifyEmployeeAuthorization } from '@/lib/server/employee-authorization'
import type { StoreSettings } from '@/lib/store-modules'

export type PixSaleCharge = {
  id: number
  vendaId: number
  txid: string
  status: 'CREATING' | 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'ERROR'
  amount: number
  pixCopyPaste: string | null
  location: string | null
  expiresAt: string | null
  paidAt: string | null
  settlementStatus: 'PENDING' | 'COMPLETED' | 'ERROR'
  settledAt: string | null
  settlementPagamentoId: number | null
}

type Result<T> = { success: true; data: T } | { success: false; message: string }
const CREATION_RECOVERY_DELAY_MS = 2 * 60 * 1000
const NOT_FOUND_CONFIRMATION_DELAY_MS = 30 * 1000

const CreateSchema = z.object({
  storeId: z.number().int().positive(),
  vendaId: z.number().int().positive(),
  amount: z.number().positive().finite(),
  authorizationToken: z.string().min(20),
})

const ExpressAuthorizationSchema = z.object({
  storeId: z.number().int().positive(),
  vendaId: z.number().int().positive(),
  amount: z.number().positive().finite(),
  authorizationToken: z.string().min(20),
})

const ChargeSchema = z.object({
  storeId: z.number().int().positive(),
  chargeId: z.number().int().positive(),
})

const AuthorizedSchema = ChargeSchema.extend({ authorizationToken: z.string().min(20) })

function table(admin: any) {
  return admin.from('pix_sale_charges') as any
}

function serialize(row: any): PixSaleCharge {
  return {
    id: Number(row.id),
    vendaId: Number(row.venda_id),
    txid: String(row.txid),
    status: row.status,
    amount: Number(row.amount),
    pixCopyPaste: row.pix_copy_paste || null,
    location: row.location || null,
    expiresAt: row.expires_at || null,
    paidAt: row.paid_at || null,
    settlementStatus: row.settlement_status,
    settledAt: row.settled_at || null,
    settlementPagamentoId: row.settlement_pagamento_id ? Number(row.settlement_pagamento_id) : null,
  }
}

async function access(storeId: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Usuario nao autenticado.')
  const profile = await getProfileByAdmin(user.id) as any
  const admin: any = createAdminClient()
  const { data: store }: { data: any } = await admin.from('stores').select('id, tenant_id, cnpj, settings').eq('id', storeId).maybeSingle()
  if (!profile?.tenant_id || !store || store.tenant_id !== profile.tenant_id || (profile.role !== 'admin' && profile.store_id !== storeId)) {
    throw new Error('Acesso negado para esta loja.')
  }
  return { userId: user.id, profile, admin, store }
}

function pixKey() {
  const value = process.env.SICREDI_PIX_PROD_PIX_KEY?.trim()
  if (!value) throw new Error('Configuracao Sicredi ausente: SICREDI_PIX_PROD_PIX_KEY.')
  return value
}

function revalidateSale(storeId: number, vendaId: number) {
  revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}/experimental`)
  revalidatePath(`/dashboard/loja/${storeId}`)
}

export async function getPixSaleCharge(storeId: number, vendaId: number): Promise<PixSaleCharge | null> {
  try {
    const { admin } = await access(storeId)
    const { data } = await table(admin).select('*').eq('store_id', storeId).eq('venda_id', vendaId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    return data ? serialize(data) : null
  } catch {
    return null
  }
}

export async function createPixSaleCharge(input: z.input<typeof CreateSchema>): Promise<Result<PixSaleCharge>> {
  try {
    const data = CreateSchema.parse(input)
    const { admin, userId, profile, store } = await access(data.storeId)
    const settings = store.settings as StoreSettings | null
    if (!isSicrediPilotStoreCnpj(store.cnpj) || settings?.pix_provider !== 'sicredi') throw new Error('A integracao Pix Sicredi nao esta habilitada para esta loja.')
    const authorization = verifyEmployeeAuthorization(data.authorizationToken, {
      userId,
      tenantId: profile.tenant_id,
      storeId: data.storeId,
      purpose: 'pix_charge_create',
      context: `sale:${data.vendaId}:${data.amount.toFixed(2)}`,
    })
    if (!authorization) throw new Error('Autorizacao expirada ou invalida. Informe novamente o PIN para gerar o Pix.')

    const { data: venda, error: vendaError }: { data: any; error: any } = await admin.from('vendas').select('id, tenant_id, customer_id, valor_restante').eq('id', data.vendaId).eq('store_id', data.storeId).maybeSingle()
    if (vendaError || !venda) throw new Error('Venda nao encontrada.')
    if (Number(venda.valor_restante || 0) > 0 && data.amount > Number(venda.valor_restante) + 0.01) throw new Error('O valor do Pix nao pode ser maior que o saldo da venda.')

    const { data: latest, error: latestError } = await table(admin)
      .select('*')
      .eq('store_id', data.storeId)
      .eq('venda_id', data.vendaId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestError) throw new Error('Nao foi possivel verificar cobrancas Pix anteriores desta venda.')

    if (latest?.status === 'PAID' && latest.settlement_status !== 'COMPLETED') {
      const settled = await settleSaleCharge(admin, latest)
      return { success: true, data: serialize(settled) }
    }
    if (latest?.status === 'ERROR') {
      throw new Error('Existe uma cobranca Pix anterior com erro. Confira a situacao antes de gerar outro QR Code.')
    }
    if (latest?.status === 'PENDING' && latest.expires_at && new Date(latest.expires_at).getTime() <= Date.now()) {
      const { data: expired } = await table(admin)
        .update({ status: 'EXPIRED', updated_at: new Date().toISOString() })
        .eq('id', latest.id)
        .eq('status', 'PENDING')
        .select('*')
        .maybeSingle()
      if (!expired) {
        const { data: current } = await table(admin).select('*').eq('id', latest.id).maybeSingle()
        if (current?.status === 'PAID') {
          const settled = current.settlement_status === 'COMPLETED' ? current : await settleSaleCharge(admin, current)
          return { success: true, data: serialize(settled) }
        }
        if (current?.status === 'PENDING' || current?.status === 'CREATING') {
          return { success: true, data: serialize(current) }
        }
      }
    } else if (latest?.status === 'PENDING') {
      return { success: true, data: serialize(latest) }
    } else if (latest?.status === 'CREATING') {
      const stale = new Date(latest.created_at).getTime() + CREATION_RECOVERY_DELAY_MS <= Date.now()
      if (!stale) return { success: true, data: serialize(latest) }
      await table(admin).update({ status: 'ERROR', provider_response: { recovery: 'creating_timeout' }, updated_at: new Date().toISOString() }).eq('id', latest.id).eq('status', 'CREATING')
    }

    const configuredExpiration = Number(process.env.SICREDI_PIX_PROD_CHARGE_EXPIRATION_SECONDS || 86_400)
    const expirationSeconds = Number.isInteger(configuredExpiration) && configuredExpiration >= 60 ? configuredExpiration : 86_400
    const txid = randomUUID().replace(/-/g, '')
    const { data: reservation, error: reservationError } = await table(admin).insert({
      tenant_id: venda.tenant_id || profile.tenant_id,
      store_id: data.storeId,
      venda_id: data.vendaId,
      customer_id: venda.customer_id || null,
      provider: 'sicredi',
      txid,
      status: 'CREATING',
      amount: data.amount.toFixed(2),
      expires_at: new Date(Date.now() + expirationSeconds * 1000).toISOString(),
      created_by_employee_id: authorization.employeeId,
      created_by_user_id: userId,
      provider_response: { reservation: true },
    }).select('*').single()
    if (reservationError || !reservation) {
      const { data: concurrent } = await table(admin).select('*').eq('store_id', data.storeId).eq('venda_id', data.vendaId).in('status', ['CREATING', 'PENDING']).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (concurrent) return { success: true, data: serialize(concurrent) }
      throw new Error('Nao foi possivel reservar a cobranca Pix da venda.')
    }

    try {
      const remote = await createSicrediImmediateCharge({
        txid,
        pixKey: pixKey(),
        amount: data.amount,
        expirationSeconds,
        payerRequest: `Pagamento da venda ${data.vendaId}`,
        additionalInfo: [{ name: 'Venda', value: String(data.vendaId) }],
      })
      const { data: updated, error } = await table(admin).update({
        status: 'PENDING',
        pix_copy_paste: remote.pixCopyPaste,
        location: remote.location,
        expires_at: remote.expirationSeconds ? new Date(Date.now() + remote.expirationSeconds * 1000).toISOString() : reservation.expires_at,
        provider_response: remote.raw,
        updated_at: new Date().toISOString(),
      }).eq('id', reservation.id).eq('status', 'CREATING').select('*').single()
      if (error || !updated) throw new Error('Nao foi possivel registrar a cobranca Pix da venda.')
      revalidateSale(data.storeId, data.vendaId)
      return { success: true, data: serialize(updated) }
    } catch (error) {
      const { data: current } = await table(admin).select('*').eq('id', reservation.id).maybeSingle()
      if (current && current.status !== 'CREATING') return { success: true, data: serialize(current) }
      try { await cancelSicrediImmediateCharge(txid) } catch { /* tentativa de limpeza remota */ }
      await table(admin).update({ status: 'ERROR', provider_response: { error: String(error).slice(0, 500) }, updated_at: new Date().toISOString() }).eq('id', reservation.id).eq('status', 'CREATING')
      throw new Error('Nao foi possivel gerar o QR Code da venda.')
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel gerar o Pix da venda.' }
  }
}

export async function createPixSaleChargeWithExpressAuthorization(input: z.input<typeof ExpressAuthorizationSchema>): Promise<Result<PixSaleCharge>> {
  try {
    const data = ExpressAuthorizationSchema.parse(input)
    const { admin, userId, profile } = await access(data.storeId)
    const authorization = verifyEmployeeAuthorization(data.authorizationToken, {
      userId,
      tenantId: profile.tenant_id,
      storeId: data.storeId,
      purpose: 'pix_charge_create',
      context: `express:${data.amount.toFixed(2)}`,
    })
    if (!authorization) throw new Error('Autorizacao expirada ou invalida. Informe novamente o PIN para gerar o Pix.')

    const { data: venda, error } = await admin.from('vendas').select('id, status, valor_restante').eq('id', data.vendaId).eq('store_id', data.storeId).maybeSingle()
    if (error || !venda) throw new Error('Venda expressa nao encontrada.')
    if (venda.status === 'Fechada' || venda.status === 'Cancelada') throw new Error('Esta venda nao esta disponivel para pagamento.')
    if (Number(venda.valor_restante || 0) + 0.01 < data.amount) throw new Error('O valor do Pix nao pode ser maior que o saldo da venda.')

    const authorizationToken = issueEmployeeAuthorization({
      userId,
      tenantId: profile.tenant_id,
      storeId: data.storeId,
      employeeId: authorization.employeeId,
      purpose: 'pix_charge_create',
      context: `sale:${data.vendaId}:${data.amount.toFixed(2)}`,
    })
    const result = await createPixSaleCharge({ storeId: data.storeId, vendaId: data.vendaId, amount: data.amount, authorizationToken })
    if (!result.success) {
      await admin.from('vendas').update({ status: 'Cancelada', data_fechamento: new Date().toISOString(), valor_restante: 0 }).eq('id', data.vendaId).eq('status', 'Em Aberto')
    }
    return result
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel gerar o Pix da venda expressa.' }
  }
}

export async function refreshPixSaleCharge(input: z.input<typeof ChargeSchema>): Promise<Result<PixSaleCharge>> {
  try {
    const data = ChargeSchema.parse(input)
    const { admin } = await access(data.storeId)
    const { data: row } = await table(admin).select('*').eq('id', data.chargeId).eq('store_id', data.storeId).maybeSingle()
    if (!row) throw new Error('Cobranca Pix nao encontrada.')
    if (row.status === 'PAID') {
      const settled = row.settlement_status === 'COMPLETED' ? row : await settleSaleCharge(admin, row)
      return { success: true, data: serialize(settled) }
    }
    if (row.status === 'ERROR') {
      try {
        const remote = await getSicrediImmediateCharge(row.txid)
        const status = remote.status === 'CONCLUIDA'
          ? 'PAID'
          : remote.status === 'REMOVIDA_PELO_USUARIO_RECEBEDOR'
            ? 'CANCELLED'
            : 'PENDING'
        const { data: reconciled } = await table(admin)
          .update({
            status,
            paid_at: status === 'PAID' ? row.paid_at || new Date().toISOString() : row.paid_at,
            cancelled_at: status === 'CANCELLED' ? row.cancelled_at || new Date().toISOString() : row.cancelled_at,
            provider_response: remote.raw,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .eq('status', 'ERROR')
          .select('*')
          .maybeSingle()
        if (!reconciled) throw new Error('Nao foi possivel atualizar a cobranca Pix com erro.')
        const settled = status === 'PAID' ? await settleSaleCharge(admin, reconciled) : reconciled
        return { success: true, data: serialize(settled) }
      } catch (error) {
        if (!(error instanceof SicrediPixHttpError) || error.statusCode !== 404) throw error
        const now = new Date()
        const previousNotFoundAt = Date.parse(String(row.provider_response?.recovery_not_found_at || ''))
        if (!Number.isFinite(previousNotFoundAt) || now.getTime() - previousNotFoundAt < NOT_FOUND_CONFIRMATION_DELAY_MS) {
          const { data: awaitingConfirmation } = await table(admin)
            .update({
              provider_response: {
                ...(row.provider_response || {}),
                recovery_not_found_at: now.toISOString(),
                recovery: 'Primeira consulta nao localizou a cobranca; aguardando nova confirmacao.',
              },
              updated_at: now.toISOString(),
            })
            .eq('id', row.id)
            .eq('status', 'ERROR')
            .select('*')
            .single()
          if (!awaitingConfirmation) throw new Error('Nao foi possivel registrar a conferencia da cobranca com erro.')
          return { success: true, data: serialize(awaitingConfirmation) }
        }
        const { data: cancelled } = await table(admin)
          .update({
            status: 'CANCELLED',
            cancelled_at: now.toISOString(),
            provider_response: { ...(row.provider_response || {}), recovery: 'Cobranca nao localizada em duas consultas.' },
            updated_at: now.toISOString(),
          })
          .eq('id', row.id)
          .eq('status', 'ERROR')
          .select('*')
          .single()
        if (!cancelled) throw new Error('Nao foi possivel liberar a cobranca com erro.')
        return { success: true, data: serialize(cancelled) }
      }
    }
    if (row.status === 'PENDING' && row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      const { data: expired } = await table(admin).update({ status: 'EXPIRED', updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'PENDING').select('*').maybeSingle()
      if (expired) return { success: true, data: serialize(expired) }
      const { data: current } = await table(admin).select('*').eq('id', row.id).maybeSingle()
      if (!current) throw new Error('Cobranca Pix nao encontrada.')
      const settled = current.status === 'PAID' && current.settlement_status !== 'COMPLETED'
        ? await settleSaleCharge(admin, current)
        : current
      return { success: true, data: serialize(settled) }
    }
    if (row.status === 'CREATING' && new Date(row.created_at).getTime() + CREATION_RECOVERY_DELAY_MS <= Date.now()) {
      const { data: recovered } = await table(admin).update({ status: 'ERROR', provider_response: { recovery: 'creating_timeout' }, updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'CREATING').select('*').single()
      return { success: true, data: serialize(recovered || { ...row, status: 'ERROR' }) }
    }
    if (row.status === 'PENDING') {
      const remote = await getSicrediImmediateCharge(row.txid)
      const status = remote.status === 'CONCLUIDA' ? 'PAID' : remote.status === 'REMOVIDA_PELO_USUARIO_RECEBEDOR' ? 'CANCELLED' : 'PENDING'
      const { data: updated } = await table(admin).update({ status, paid_at: status === 'PAID' ? new Date().toISOString() : row.paid_at, provider_response: remote.raw, updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'PENDING').select('*').maybeSingle()
      if (!updated) {
        const { data: current } = await table(admin).select('*').eq('id', row.id).maybeSingle()
        if (!current) throw new Error('Cobranca Pix nao encontrada.')
        const settled = current.status === 'PAID' && current.settlement_status !== 'COMPLETED'
          ? await settleSaleCharge(admin, current)
          : current
        return { success: true, data: serialize(settled) }
      }
      const settled = status === 'PAID' ? await settleSaleCharge(admin, updated) : updated
      return { success: true, data: serialize(settled) }
    }
    return { success: true, data: serialize(row) }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel consultar o Pix da venda.' }
  }
}

export async function cancelPixSaleCharge(input: z.input<typeof AuthorizedSchema>): Promise<Result<PixSaleCharge>> {
  try {
    const data = AuthorizedSchema.parse(input)
    const { admin, userId, profile } = await access(data.storeId)
    const authorization = verifyEmployeeAuthorization(data.authorizationToken, { userId, tenantId: profile.tenant_id, storeId: data.storeId, purpose: 'pix_charge_cancel', context: String(data.chargeId) })
    if (!authorization) throw new Error('Autorizacao expirada ou invalida.')
    const { data: row } = await table(admin).select('*').eq('id', data.chargeId).eq('store_id', data.storeId).maybeSingle()
    if (!row) throw new Error('Cobranca Pix nao encontrada.')
    if (row.status !== 'PENDING') throw new Error('Apenas cobrancas Pix pendentes podem ser canceladas.')
    const remote = await getSicrediImmediateCharge(row.txid)
    if (remote.status === 'CONCLUIDA') throw new Error('A cobranca ja foi paga e nao pode ser cancelada.')
    const cancelled = await cancelSicrediImmediateCharge(row.txid)
    const { data: updated } = await table(admin).update({ status: 'CANCELLED', cancelled_at: new Date().toISOString(), provider_response: cancelled.raw, updated_at: new Date().toISOString() }).eq('id', row.id).select('*').single()
    if (!updated) throw new Error('Nao foi possivel registrar o cancelamento.')
    revalidateSale(data.storeId, Number(row.venda_id))
    return { success: true, data: serialize(updated) }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel cancelar o Pix da venda.' }
  }
}

async function settleSaleCharge(admin: any, row: any) {
  if (row.settlement_status === 'COMPLETED') return row
  const idempotencyKey = String(row.settlement_idempotency_key || row.txid)
  const obs = `Pix Sicredi venda #${row.venda_id} txid ${row.txid} idempotencia ${idempotencyKey}`
  const legacyObs = `Pix Sicredi venda #${row.venda_id} txid ${row.txid}`
  let { data: existing } = await admin.from('pagamentos').select('id').eq('venda_id', row.venda_id).eq('obs', obs).maybeSingle()
  if (!existing) {
    const legacy = await admin.from('pagamentos').select('id').eq('venda_id', row.venda_id).eq('obs', legacyObs).maybeSingle()
    existing = legacy.data
  }
  if (existing) {
    await finalizeSaleFinancials(admin, row)
    const { data: settled } = await table(admin).update({ settlement_status: 'COMPLETED', settlement_pagamento_id: existing.id, settled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id).select('*').single()
    return settled || { ...row, settlement_status: 'COMPLETED', settlement_pagamento_id: existing.id }
  }
  let payment: any = null
  const { data: insertedPayment, error } = await admin.from('pagamentos').insert({
    tenant_id: row.tenant_id,
    store_id: row.store_id,
    venda_id: row.venda_id,
    customer_id: row.customer_id,
    employee_id: row.created_by_employee_id,
    forma_pagamento: 'Pix Sicredi',
    valor_pago: row.amount,
    parcelas: 1,
    data_pagamento: new Date().toISOString().slice(0, 10),
    obs,
    created_by_user_id: row.created_by_user_id,
  }).select('id').single()
  if (insertedPayment) payment = insertedPayment
  if (!payment && error) {
    const { data: concurrentPayment } = await admin.from('pagamentos').select('id').eq('venda_id', row.venda_id).in('obs', [obs, legacyObs]).maybeSingle()
    if (concurrentPayment) payment = concurrentPayment
  }
  if (!payment) {
    await table(admin).update({ settlement_status: 'ERROR', updated_at: new Date().toISOString() }).eq('id', row.id)
    throw new Error('Pagamento confirmado, mas a venda nao foi baixada.')
  }
  await finalizeSaleFinancials(admin, row)
  const { data: settled } = await table(admin).update({ settlement_status: 'COMPLETED', settlement_pagamento_id: payment.id, settled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id).select('*').single()
  revalidateSale(Number(row.store_id), Number(row.venda_id))
  return settled || { ...row, settlement_status: 'COMPLETED', settlement_pagamento_id: payment.id }
}

async function finalizeSaleFinancials(admin: any, row: any) {
  const { error: financeError } = await admin.rpc('update_venda_financeiro', { p_venda_id: Number(row.venda_id) })
  if (financeError) throw new Error('Pagamento confirmado, mas nao foi possivel recalcular o saldo da venda.')

  const { data: venda } = await admin.from('vendas').select('status, valor_restante, financiamento_id').eq('id', row.venda_id).maybeSingle()
  const shouldClose = venda?.status === 'Em Aberto'
    && !venda?.financiamento_id
    && Number(venda?.valor_restante || 0) <= 0.01
  if (shouldClose) {
    const closed = await updateVendaStatus(Number(row.venda_id), Number(row.store_id), 'Fechada', Number(row.created_by_employee_id || 0))
    if (!closed.success) throw new Error(closed.message || 'Pagamento confirmado, mas nao foi possivel fechar a venda.')
    if (row.created_by_user_id && row.tenant_id) {
      await registrarSaidaVenda(Number(row.venda_id), Number(row.store_id), String(row.created_by_user_id), String(row.tenant_id))
    }
  }
}

export async function processSicrediPixSaleWebhook(txid: string) {
  const admin = createAdminClient()
  const { data: row } = await table(admin).select('*').eq('txid', txid).maybeSingle()
  if (!row) return false
  const remote = await getSicrediImmediateCharge(txid)
  const status = remote.status === 'CONCLUIDA' ? 'PAID' : remote.status === 'REMOVIDA_PELO_USUARIO_RECEBEDOR' ? 'CANCELLED' : row.status
  const { data: updated } = await table(admin).update({ status, paid_at: status === 'PAID' ? row.paid_at || new Date().toISOString() : row.paid_at, provider_response: remote.raw, updated_at: new Date().toISOString() }).eq('id', row.id).select('*').single()
  if (status === 'PAID' && updated) await settleSaleCharge(admin, updated)
  return true
}
