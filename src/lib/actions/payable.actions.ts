// Caminho: src/lib/actions/payable.actions.ts
'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

function parseReferenceMonth(dateStr?: string) {
    if (!dateStr) {
        const now = new Date()
        return { year: now.getUTCFullYear(), monthIndex: now.getUTCMonth() }
    }

    const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(dateStr)
    if (match) {
        return {
            year: Number(match[1]),
            monthIndex: Number(match[2]) - 1,
        }
    }

    const parsed = new Date(dateStr)
    return { year: parsed.getUTCFullYear(), monthIndex: parsed.getUTCMonth() }
}

function getMonthBounds(dateStr?: string) {
    const { year, monthIndex } = parseReferenceMonth(dateStr)
    const monthStart = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0))
    const nextMonthStart = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0))
    return { year, monthIndex, monthStart, nextMonthStart }
}

function buildMonthDate(year: number, monthIndex: number, preferredDay: number) {
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
    return new Date(Date.UTC(year, monthIndex, Math.min(preferredDay, lastDay), 0, 0, 0, 0))
}

function normalizeDueDateStart(dateStr: string) {
    const date = new Date(dateStr)
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)).toISOString()
}

// ==============================================================================
// 1. LISTAR CONTAS (FILTRO POR MÊS) + GERAÇÃO PREGUIÇOSA DE RECORRENTES
// ==============================================================================
export async function getBills(storeId: number, dateStr?: string) {
    const supabaseAdmin = createAdminClient()

    const { year, monthIndex, monthStart, nextMonthStart } = getMonthBounds(dateStr)
    const firstDay = monthStart.toISOString()
    const nextMonth = nextMonthStart.toISOString()

    try {
        // 1. Buscar contas do mês solicitado
        const { data, error } = await (supabaseAdmin
            .from('accounts_payable') as any)
            .select('*, suppliers ( nome_fantasia )')
            .eq('store_id', storeId)
            .gte('due_date', firstDay)
            .lt('due_date', nextMonth)
            .order('due_date', { ascending: true })

        if (error) throw error

        // 2. Buscar contas recorrentes de MESES ANTERIORES (lazy generation)
        const { data: recurringSource } = await (supabaseAdmin
            .from('accounts_payable') as any)
            .select('*')
            .eq('store_id', storeId)
            .eq('is_recurring', true)
            .neq('status', 'Cancelado')
            .lt('due_date', firstDay)
            .order('due_date', { ascending: false }) // mais recente primeiro

        if (recurringSource && recurringSource.length > 0) {
            // Pega o registro mais recente de cada grupo de recorrência
            const latestByGroup: Record<string, any> = {}
            for (const bill of recurringSource) {
                if (bill.recurring_group_id && !latestByGroup[bill.recurring_group_id]) {
                    latestByGroup[bill.recurring_group_id] = bill
                }
            }

            // Verifica quais grupos já têm entrada no mês atual
            const monthGroupIds = new Set(
                (data || [])
                    .filter((b: any) => b.recurring_group_id)
                    .map((b: any) => b.recurring_group_id)
            )

            // Cria as entradas recorrentes que ainda não existem neste mês
            const toInsert = []
            for (const [groupId, sourceBill] of Object.entries(latestByGroup)) {
                if (!monthGroupIds.has(groupId)) {
                    // Mantém o mesmo dia do mês do lançamento original
                    const sourceDay = new Date(sourceBill.due_date).getUTCDate()
                    const targetDate = buildMonthDate(year, monthIndex, sourceDay)

                    toInsert.push({
                        tenant_id: sourceBill.tenant_id,
                        store_id: sourceBill.store_id,
                        description: sourceBill.description,
                        amount: sourceBill.amount,
                        amount_paid: 0,
                        due_date: targetDate.toISOString(),
                        payment_date: null,
                        status: 'Pendente',
                        category: sourceBill.category,
                        supplier_id: sourceBill.supplier_id,
                        is_recurring: true,
                        recurring_group_id: groupId,
                        installment_number: null,
                        installment_total: null,
                        created_by_user_id: sourceBill.created_by_user_id,
                    })
                }
            }

            if (toInsert.length > 0) {
                const { data: newBills, error: insertError } = await (supabaseAdmin
                    .from('accounts_payable') as any)
                    .insert(toInsert)
                    .select('*, suppliers ( nome_fantasia )')

                if (!insertError && newBills) {
                    const combined = [...(data || []), ...newBills].sort(
                        (a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
                    )
                    return { success: true, data: combined }
                }
            }
        }

        return { success: true, data: data || [] }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// ==============================================================================
// 2. SALVAR CONTA (CRIAR / EDITAR) — COM SUPORTE A PARCELAS E RECORRÊNCIA
// ==============================================================================
const BillSchema = z.object({
    id: z.coerce.number().optional(),
    store_id: z.coerce.number(),
    description: z.string().min(3, 'Descrição obrigatória'),
    amount: z.coerce.number().min(0.01, 'Valor inválido'),
    due_date: z.string().min(10, 'Data inválida'),
    category: z.string().optional(),
    supplier_id: z.coerce.number().optional().nullable(),
})

type EditScope = 'single' | 'future'

export async function saveBill(prevState: any, formData: FormData) {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()

    if (!user) return { success: false, message: 'Login necessário.' }

    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil inválido.' }

    // Parâmetros de recorrência / parcelamento
    const isRecurring = formData.get('is_recurring') === 'true'
    const installments = Math.min(60, Math.max(1, parseInt(formData.get('installments') as string || '1', 10)))
    const editScope = (formData.get('edit_scope') as EditScope) || 'single'

    const rawData = {
        id: formData.get('id'),
        store_id: profile.store_id,
        description: formData.get('description'),
        amount: formData.get('amount'),
        due_date: formData.get('due_date'),
        category: formData.get('category'),
        supplier_id: formData.get('supplier_id'),
    }

    const val = BillSchema.safeParse(rawData)
    if (!val.success) return { success: false, message: 'Dados inválidos: ' + val.error.issues[0]?.message }

    const { id, ...billData } = val.data

    try {
        if (id) {
            const { data: existingBill, error: existingBillError } = await (supabaseAdmin.from('accounts_payable') as any)
                .select('*')
                .eq('id', id)
                .single()

            if (existingBillError || !existingBill) {
                return { success: false, message: 'Conta não encontrada para edição.' }
            }

            const baseUpdate = {
                ...billData,
                tenant_id: profile.tenant_id,
                updated_at: new Date().toISOString(),
            }

            if (existingBill.is_recurring && existingBill.recurring_group_id) {
                if (editScope === 'future') {
                    await (supabaseAdmin.from('accounts_payable') as any)
                        .update(baseUpdate)
                        .eq('recurring_group_id', existingBill.recurring_group_id)
                        .eq('status', 'Pendente')
                        .gte('due_date', normalizeDueDateStart(existingBill.due_date))
                } else {
                    await (supabaseAdmin.from('accounts_payable') as any)
                        .update({
                            ...baseUpdate,
                            is_recurring: false,
                        })
                        .eq('id', id)
                }
            } else {
                await (supabaseAdmin.from('accounts_payable') as any)
                    .update(baseUpdate)
                    .eq('id', id)
            }

        } else if (installments > 1) {
            // MODO PARCELADO: cria N registros com datas incrementadas
            const groupId = crypto.randomUUID()
            const baseDate = new Date(billData.due_date)
            const baseYear = baseDate.getUTCFullYear()
            const baseMonth = baseDate.getUTCMonth()
            const baseDay = baseDate.getUTCDate()

            const records = Array.from({ length: installments }, (_, i) => {
                const dueDate = buildMonthDate(baseYear, baseMonth + i, baseDay)
                return {
                    ...billData,
                    due_date: dueDate.toISOString(),
                    tenant_id: profile.tenant_id,
                    created_by_user_id: user.id,
                    is_recurring: false,
                    recurring_group_id: groupId,
                    installment_number: i + 1,
                    installment_total: installments,
                    status: 'Pendente',
                    amount_paid: 0,
                }
            })

            await (supabaseAdmin.from('accounts_payable') as any).insert(records)

        } else {
            // MODO SIMPLES ou RECORRENTE: cria 1 registro
            const groupId = isRecurring ? crypto.randomUUID() : null

            await (supabaseAdmin.from('accounts_payable') as any).insert({
                ...billData,
                tenant_id: profile.tenant_id,
                created_by_user_id: user.id,
                is_recurring: isRecurring,
                recurring_group_id: groupId,
                installment_number: null,
                installment_total: null,
                status: 'Pendente',
                amount_paid: 0,
            })
        }

        revalidatePath(`/dashboard/loja/${profile.store_id}/financeiro/contas`)
        return { success: true, message: 'Conta salva com sucesso!' }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// ==============================================================================
// 3. PAGAR CONTA (BAIXA + INTEGRAÇÃO COM CAIXA)
// ==============================================================================
const PayBillSchema = z.object({
    bill_id: z.coerce.number(),
    store_id: z.coerce.number(),
    amount_paid: z.coerce.number(),
    payment_date: z.string(),
    source: z.enum(['Caixa', 'Banco'])
})

export async function payBill(prevState: any, formData: FormData) {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()

    const profile = await getProfileByAdmin(user!.id) as any

    const input = {
        bill_id: formData.get('bill_id'),
        store_id: profile?.store_id,
        amount_paid: formData.get('amount_paid'),
        payment_date: formData.get('payment_date'),
        source: formData.get('source')
    }

    const val = PayBillSchema.safeParse(input)
    if (!val.success) return { success: false, message: 'Dados de pagamento inválidos.' }

    const { bill_id, store_id, amount_paid, payment_date, source } = val.data

    try {
        if (source === 'Caixa') {
            const hoje = new Date()
            const dataInicioHoje = new Date(hoje.setHours(0, 0, 0, 0)).toISOString()

            const { data: caixaAberto } = await (supabaseAdmin
                .from('caixa_diario') as any)
                .select('id')
                .eq('store_id', store_id)
                .eq('status', 'Aberto')
                .gte('created_at', dataInicioHoje)
                .maybeSingle()

            if (!caixaAberto) {
                return { success: false, message: 'Erro: Não há caixa aberto para realizar pagamento em dinheiro.' }
            }

            const { data: conta } = await (supabaseAdmin.from('accounts_payable') as any)
                .select('description')
                .eq('id', bill_id)
                .single()

            await (supabaseAdmin.from('caixa_movimentacoes') as any).insert({
                tenant_id: profile?.tenant_id,
                store_id: store_id,
                caixa_id: caixaAberto.id,
                usuario_id: user?.id,
                tipo: 'Saida',
                valor: amount_paid,
                descricao: `Pagto Conta: ${conta?.description || 'Despesa'}`,
                categoria: 'Despesa Operacional',
                forma_pagamento: 'Dinheiro'
            })
        }

        await (supabaseAdmin.from('accounts_payable') as any).update({
            status: 'Pago',
            amount_paid: amount_paid,
            payment_date: payment_date,
            updated_at: new Date().toISOString()
        }).eq('id', bill_id)

        revalidatePath(`/dashboard/loja/${store_id}/financeiro/contas`)

        if (source === 'Caixa') {
            revalidatePath(`/dashboard/loja/${store_id}/financeiro/caixa`)
        }

        return { success: true, message: 'Pagamento registrado com sucesso!' }

    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// ==============================================================================
// 4. EXCLUIR CONTA
// ==============================================================================
export async function deleteBill(billId: number, storeId: number) {
    const supabaseAdmin = createAdminClient()
    try {
        await (supabaseAdmin.from('accounts_payable') as any).delete().eq('id', billId)
        revalidatePath(`/dashboard/loja/${storeId}/financeiro/contas`)
        return { success: true, message: 'Conta removida.' }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

export async function deleteSingleRecurringOccurrence(billId: number, storeId: number) {
    const supabaseAdmin = createAdminClient()
    try {
        await (supabaseAdmin.from('accounts_payable') as any)
            .update({
                status: 'Cancelado',
                is_recurring: false,
                updated_at: new Date().toISOString(),
            })
            .eq('id', billId)

        revalidatePath(`/dashboard/loja/${storeId}/financeiro/contas`)
        return { success: true, message: 'Ocorrência removida.' }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// ==============================================================================
// 5. CANCELAR RECORRÊNCIA (EXCLUI TODAS AS FUTURAS DO MESMO GRUPO)
// ==============================================================================
export async function cancelRecurring(billId: number, storeId: number) {
    const supabaseAdmin = createAdminClient()
    try {
        const { data: bill, error: billError } = await (supabaseAdmin.from('accounts_payable') as any)
            .select('recurring_group_id, due_date')
            .eq('id', billId)
            .single()

        if (billError || !bill?.recurring_group_id) {
            return { success: false, message: 'Recorrência não encontrada.' }
        }

        const cutoffDate = normalizeDueDateStart(bill.due_date)

        await (supabaseAdmin.from('accounts_payable') as any)
            .update({
                is_recurring: false,
                updated_at: new Date().toISOString(),
            })
            .eq('recurring_group_id', bill.recurring_group_id)

        await (supabaseAdmin.from('accounts_payable') as any)
            .update({
                status: 'Cancelado',
                updated_at: new Date().toISOString(),
            })
            .eq('recurring_group_id', bill.recurring_group_id)
            .eq('status', 'Pendente')
            .gte('due_date', cutoffDate)

        revalidatePath(`/dashboard/loja/${storeId}/financeiro/contas`)
        return { success: true, message: 'Recorrência cancelada.' }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}
