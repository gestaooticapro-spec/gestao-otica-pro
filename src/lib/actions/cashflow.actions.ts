// Caminho: src/lib/actions/cashflow.actions.ts
'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

type CaixaDiario = Database['public']['Tables']['caixa_diario']['Row']
type Movimentacao = Database['public']['Tables']['caixa_movimentacoes']['Row']

// --- TIPOS PARA O RESUMO ---
export type ResumoCaixa = {
    caixa: CaixaDiario | null
    movimentacoes: Movimentacao[]
    movimentacoes_detalhadas: any[] // <--- UNIFIED HISTORY
    categoriasUsadas: string[] // <--- NOVO CAMPO
    vendas: {
        total_dinheiro: number
        total_pix: number
        total_cartao: number
        total_outros: number
        detalhes: any[]
    }
    totais: {
        entradas_manuais: number
        saidas_manuais: number
        saldo_esperado_dinheiro: number
        saldo_geral_acumulado: number
        divergencias?: {
            positiva: number
            negativa: number
        }
    }
    comparativo?: {
        faturamento_mensal_atual: number
        faturamento_mensal_anterior: number
        faturamento_avista: number
        faturamento_aprazo: number
    }
}

// HELPER: Padronização de Texto (Primeira Maiúscula)
function formatarCategoria(texto: string | null | undefined) {
    if (!texto || texto.trim() === '') return null;
    const t = texto.trim();
    // Transforma "motoboy" em "Motoboy" e "transporte uber" em "Transporte uber"
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

const STORE_TIMEZONE = 'America/Sao_Paulo'
const STORE_UTC_OFFSET = '-03:00'

function getStoreDateKey(dateInput: string | Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: STORE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date(dateInput))

    const year = parts.find(part => part.type === 'year')?.value || '0000'
    const month = parts.find(part => part.type === 'month')?.value || '00'
    const day = parts.find(part => part.type === 'day')?.value || '00'

    return `${year}-${month}-${day}`
}

function getStoreDayRange(dateKey: string) {
    return {
        startIso: new Date(`${dateKey}T00:00:00${STORE_UTC_OFFSET}`).toISOString(),
        endIso: new Date(`${dateKey}T23:59:59${STORE_UTC_OFFSET}`).toISOString()
    }
}

async function getCashReceiptsByDateKeys(storeId: number, dateKeys: string[]) {
    const uniqueDateKeys = Array.from(new Set(dateKeys)).sort()
    const totalsByDate = new Map<string, number>()

    if (uniqueDateKeys.length === 0) return totalsByDate

    const allowedDateKeys = new Set(uniqueDateKeys)
    const { startIso } = getStoreDayRange(uniqueDateKeys[0])
    const { endIso } = getStoreDayRange(uniqueDateKeys[uniqueDateKeys.length - 1])

    const supabaseAdmin = createAdminClient()

    const { data: pagamentosVendas } = await supabaseAdmin
        .from('pagamentos')
        .select('id, valor_pago, forma_pagamento, created_at, venda_id, obs')
        .eq('store_id', storeId)
        .gte('created_at', startIso)
        .lte('created_at', endIso)

    const { data: parcelasPagas } = await supabaseAdmin
        .from('financiamento_parcelas')
        .select('id, valor_parcela, data_pagamento, financiamento_loja(venda_id)')
        .eq('store_id', storeId)
        .eq('status', 'Pago')
        .gte('data_pagamento', startIso)
        .lte('data_pagamento', endIso)

    const listaPagamentos = pagamentosVendas || []
    const listaParcelas = parcelasPagas || []
    const pagamentosPorDia = new Map<string, any[]>()

    const adicionarAoTotal = (dateKey: string, valor: number) => {
        totalsByDate.set(dateKey, (totalsByDate.get(dateKey) || 0) + valor)
    }

    listaPagamentos.forEach((pg: any) => {
        const dateKey = getStoreDateKey(pg.created_at)
        if (!allowedDateKeys.has(dateKey)) return

        const pagamentosDia = pagamentosPorDia.get(dateKey) || []
        pagamentosDia.push(pg)
        pagamentosPorDia.set(dateKey, pagamentosDia)

        const formaNormalizada = (pg.forma_pagamento || '').toLowerCase()
        if (formaNormalizada.includes('dinheiro')) {
            adicionarAoTotal(dateKey, Number(pg.valor_pago) || 0)
        }
    })

    listaParcelas.forEach((pc: any) => {
        const dateKey = getStoreDateKey(pc.data_pagamento)
        if (!allowedDateKeys.has(dateKey)) return

        const vendaId = pc.financiamento_loja?.venda_id
        const pagamentosDia = pagamentosPorDia.get(dateKey) || []

        const duplicado = Boolean(vendaId && pagamentosDia.some((pagamento: any) =>
            Number(pagamento.valor_pago) === Number(pc.valor_parcela) &&
            pagamento.obs &&
            pagamento.obs.includes(`Venda #${vendaId}`)
        ))

        if (!duplicado) {
            adicionarAoTotal(dateKey, Number(pc.valor_parcela) || 0)
        }
    })

    return totalsByDate
}

// ... (AbrirCaixa, AdicionarMovimento, etc. mantidos iguais)
// ...
// ... REPETIR CÓDIGO ANTERIOR PARA NÃO PERDER ...
// ... (Para economizar tokens, vou colar apenas o getResumoCaixa alterado e funcões auxiliares se necessário, 
// mas o write_to_file PRECISA DO ARQUIVO TODO. 
// Então vou colar o arquivo TODO novamente, com a alteração na getResumoCaixa)

// ============================================================================
// 1. ABRIR CAIXA
// ============================================================================
const AbrirCaixaSchema = z.object({
    store_id: z.coerce.number(),
    saldo_inicial: z.coerce.number().min(0).optional(),
})

export async function abrirCaixa(prevState: any, formData: FormData) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Sessão expirada.' }

    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil não encontrado.' }

    const saldoInicialRaw = formData.get('saldo_inicial')
    const saldoInicial = saldoInicialRaw === null || saldoInicialRaw === '' ? undefined : saldoInicialRaw
    const val = AbrirCaixaSchema.safeParse({
        store_id: profile.store_id,
        saldo_inicial: saldoInicial,
    })
    if (!val.success) return { success: false, message: 'Valor inválido.' }

    const supabaseAdmin = createAdminClient()

    let finalTenantId = profile.tenant_id
    if (!finalTenantId) {
        const { data: store } = await (supabaseAdmin.from('stores') as any).select('tenant_id').eq('id', profile.store_id).single()
        if (store) finalTenantId = (store as any).tenant_id
    }
    if (!finalTenantId) return { success: false, message: 'Erro Crítico: Loja sem Tenant ID.' }

    // Fecha caixas anteriores
    const hoje = new Date()
    const hojeKey = getStoreDateKey(hoje)
    const { startIso: dataInicioHoje, endIso: dataFimHoje } = getStoreDayRange(hojeKey)
    const { data: caixasAnteriores } = await (supabaseAdmin.from('caixa_diario') as any)
        .select('id, saldo_inicial, created_at').eq('store_id', profile.store_id).eq('status', 'Aberto').lt('created_at', dataInicioHoje)

    if (caixasAnteriores?.length) {
        for (const cx of caixasAnteriores) {
            // Calcular o saldo esperado do dia que ficou aberto pra achar a quebra
            const dataCx = new Date(cx.created_at).toISOString().split('T')[0]
            const resumoAntigo = await getResumoCaixaPorData(profile.store_id, dataCx)

            let saldoEsperado = Number(cx.saldo_inicial)
            if (resumoAntigo) {
                saldoEsperado = resumoAntigo.totais.saldo_esperado_dinheiro
            }

            // O fechamento automático usa o novo "saldo_inicial" do dia ATUAL
            // Isso garante que a gaveta abra certa hoje e a quebra inteira fique registrada no dia não fechado
            const saldoFinalInformado = Number(val.data.saldo_inicial ?? 0)
            const quebra = saldoFinalInformado - saldoEsperado

            await (supabaseAdmin.from('caixa_diario') as any).update({
                status: 'Fechado',
                data_fechamento: new Date().toISOString(),
                fechado_por_id: user.id,
                saldo_final: saldoFinalInformado,
                quebra_caixa: quebra,
                obs: 'AUTO_CLOSED_ON_OPENING'
            }).eq('id', cx.id)
        }
    }

    const { data: existe } = await (supabaseAdmin.from('caixa_diario') as any)
        .select('id')
        .eq('store_id', profile.store_id)
        .eq('status', 'Aberto')
        .gte('data_abertura', dataInicioHoje)
        .lte('data_abertura', dataFimHoje)
        .maybeSingle()
    if (existe) {
        revalidatePath(`/dashboard/loja/${profile.store_id}/financeiro/caixa`)
        return { success: true, message: 'Caixa já estava aberto.' }
    }

    try {
        const { data: caixaFechadoHoje } = await (supabaseAdmin.from('caixa_diario') as any)
            .select('id')
            .eq('store_id', profile.store_id)
            .eq('status', 'Fechado')
            .gte('data_abertura', dataInicioHoje)
            .lte('data_abertura', dataFimHoje)
            .order('data_fechamento', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (caixaFechadoHoje) {
            await (supabaseAdmin.from('caixa_diario') as any).update({
                status: 'Aberto',
                data_fechamento: null,
                fechado_por_id: null,
                saldo_final: null,
                quebra_caixa: null,
                obs: 'REOPENED_SAME_DAY'
            }).eq('id', caixaFechadoHoje.id)

            revalidatePath(`/dashboard/loja/${profile.store_id}/financeiro/caixa`)
            return { success: true, message: 'Caixa de hoje reaberto com sucesso!' }
        }
        await (supabaseAdmin.from('caixa_diario') as any).insert({
            tenant_id: finalTenantId, store_id: profile.store_id, aberto_por_id: user.id, data_abertura: new Date().toISOString(), saldo_inicial: val.data.saldo_inicial ?? 0, status: 'Aberto'
        })
        revalidatePath(`/dashboard/loja/${profile.store_id}/financeiro/caixa`)
        return { success: true, message: 'Caixa aberto com sucesso!' }
    } catch (e: any) { return { success: false, message: e.message } }
}

// 2. ADICIONAR MOVIMENTO
const MovimentoSchema = z.object({
    caixa_id: z.coerce.number(), tipo: z.enum(['Entrada', 'Saida']), valor: z.coerce.number().min(0.01), descricao: z.string().min(3), categoria: z.string().optional(), forma_pagamento: z.string().default('Dinheiro')
})

export async function adicionarMovimento(prevState: any, formData: FormData) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Erro permissão.' }
    const profile = await getProfileByAdmin(user.id) as any

    const categoriaRaw = formData.get('categoria') as string;
    const categoriaFormatada = formatarCategoria(categoriaRaw);

    const val = MovimentoSchema.safeParse({
        caixa_id: formData.get('caixa_id'),
        tipo: formData.get('tipo'),
        valor: formData.get('valor'),
        descricao: formData.get('descricao'),
        categoria: categoriaFormatada || undefined,
        forma_pagamento: formData.get('forma_pagamento') || undefined
    })
    if (!val.success) {
        console.error('Erro Validação Movimento:', val.error)
        return { success: false, message: 'Dados inválidos.' }
    }

    const supabaseAdmin = createAdminClient()
    const { error } = await (supabaseAdmin.from('caixa_movimentacoes') as any).insert({
        tenant_id: profile.tenant_id, store_id: profile.store_id, usuario_id: user.id, ...val.data
    })
    if (error) return { success: false, message: error.message }

    revalidatePath(`/dashboard/loja/${profile.store_id}/financeiro/caixa`)
    return { success: true, message: 'Lançamento registrado.' }
}

const AtualizarCaixaSchema = z.object({ caixa_id: z.coerce.number(), saldo_inicial: z.coerce.number().min(0) })
export async function atualizarSaldoInicial(prevState: any, formData: FormData) {
    const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return { success: false, message: 'Erro.' }
    const profile = await getProfileByAdmin(user.id) as any
    const val = AtualizarCaixaSchema.safeParse({ caixa_id: formData.get('caixa_id'), saldo_inicial: formData.get('saldo_inicial') })
    if (!val.success) return { success: false, message: 'Inválido' }

    const supabaseAdmin = createAdminClient()
    const { data: caixaAtual } = await (supabaseAdmin.from('caixa_diario') as any)
        .select('id, store_id, data_abertura')
        .eq('id', val.data.caixa_id)
        .maybeSingle()

    if (!caixaAtual) return { success: false, message: 'Caixa nÃ£o encontrado.' }

    await (supabaseAdmin.from('caixa_diario') as any)
        .update({ saldo_inicial: val.data.saldo_inicial })
        .eq('id', val.data.caixa_id)

    const dataAtualKey = getStoreDateKey(caixaAtual.data_abertura)
    const { startIso: inicioDiaAtual } = getStoreDayRange(dataAtualKey)

    const { data: caixasAutoFechadosHoje } = await (supabaseAdmin.from('caixa_diario') as any)
        .select('id, data_abertura, saldo_inicial, obs')
        .eq('store_id', caixaAtual.store_id)
        .eq('status', 'Fechado')
        .lt('data_abertura', inicioDiaAtual)
        .gte('data_fechamento', inicioDiaAtual)
        .lte('data_fechamento', caixaAtual.data_abertura)
        .order('data_abertura', { ascending: false })

    for (const cx of caixasAutoFechadosHoje || []) {
        const dataCx = getStoreDateKey(cx.data_abertura)
        const resumoAntigo = await getResumoCaixaPorData(caixaAtual.store_id, dataCx)
        const saldoEsperado = resumoAntigo?.totais.saldo_esperado_dinheiro ?? Number(cx.saldo_inicial || 0)
        const quebra = Number(val.data.saldo_inicial) - saldoEsperado

        await (supabaseAdmin.from('caixa_diario') as any).update({
            saldo_final: Number(val.data.saldo_inicial),
            quebra_caixa: quebra,
            obs: cx.obs || 'AUTO_CLOSED_ON_OPENING'
        }).eq('id', cx.id)
    }
    revalidatePath(`/dashboard/loja/${profile.store_id}/financeiro/caixa`)
    return { success: true, message: 'Atualizado.' }
}

const AtualizarMovimentoSchema = z.object({ movimento_id: z.coerce.number(), caixa_id: z.coerce.number(), tipo: z.enum(['Entrada', 'Saida']), valor: z.coerce.number().min(0.01), descricao: z.string().min(3), categoria: z.string().optional().nullable(), forma_pagamento: z.string().optional().nullable() })
export async function atualizarMovimento(prevState: any, formData: FormData) {
    const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return { success: false, message: 'Erro.' }
    const profile = await getProfileByAdmin(user.id) as any
    const val = AtualizarMovimentoSchema.safeParse({
        movimento_id: formData.get('movimento_id'), caixa_id: formData.get('caixa_id'), tipo: formData.get('tipo'), valor: formData.get('valor'), descricao: formData.get('descricao'), categoria: formData.get('categoria'), forma_pagamento: formData.get('forma_pagamento')
    })
    if (!val.success) return { success: false, message: 'Inválido' }
    const supabaseAdmin = createAdminClient()
    await (supabaseAdmin.from('caixa_movimentacoes') as any).update({
        tipo: val.data.tipo, valor: val.data.valor, descricao: val.data.descricao, categoria: val.data.categoria, forma_pagamento: val.data.forma_pagamento || 'Dinheiro'
    }).eq('id', val.data.movimento_id)
    revalidatePath(`/dashboard/loja/${profile.store_id}/financeiro/caixa`)
    return { success: true, message: 'Atualizado.' }
}

export async function deletarMovimento(movimentoId: number) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Sessão expirada.' }
    const profile = await getProfileByAdmin(user.id) as any
    const supabaseAdmin = createAdminClient()
    const { error } = await (supabaseAdmin.from('caixa_movimentacoes') as any).delete().eq('id', movimentoId)
    if (error) return { success: false, message: error.message }
    revalidatePath(`/dashboard/loja/${profile.store_id}/financeiro/caixa`)
    return { success: true, message: 'Lançamento excluído.' }
}

// 4. FECHAR CAIXA
export async function fecharCaixa(prevState: any, formData: FormData) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Sessão expirada.' }

    const caixaId = Number(formData.get('caixa_id'))
    const saldoFinal = Number(formData.get('saldo_final'))
    if (!caixaId || Number.isNaN(saldoFinal)) return { success: false, message: 'Dados inválidos.' }

    const supabaseAdmin = createAdminClient()

    const { data: caixa } = await (supabaseAdmin.from('caixa_diario') as any)
        .select('id, store_id, data_abertura, saldo_inicial')
        .eq('id', caixaId)
        .maybeSingle()

    if (!caixa) return { success: false, message: 'Caixa não encontrado.' }

    const dataCaixa = getStoreDateKey(caixa.data_abertura)
    const resumoAtual = await getResumoCaixaPorData(caixa.store_id, dataCaixa)
    const saldoEsperadoAtual = resumoAtual?.totais.saldo_esperado_dinheiro ?? Number(caixa.saldo_inicial || 0)
    const diff = saldoFinal - saldoEsperadoAtual

    await (supabaseAdmin.from('caixa_diario') as any).update({
        saldo_final: saldoFinal,
        quebra_caixa: diff,
        data_fechamento: new Date().toISOString(),
        fechado_por_id: user.id,
        status: 'Fechado'
    }).eq('id', caixaId)

    revalidatePath(`/dashboard/loja/${caixa.store_id}/financeiro/caixa`)
    return { success: true, message: 'Fechado.' }
}

export async function verificarStatusCaixa(storeId: number): Promise<{
    aberto: boolean
    podeReabrirHoje: boolean
    saldoInicialAnterior?: number | null
    dataFechamento?: string | null
}> {
    const sb = createAdminClient()
    const hojeKey = getStoreDateKey(new Date())
    const { startIso, endIso } = getStoreDayRange(hojeKey)

    const { data: caixaAberto } = await (sb.from('caixa_diario') as any)
        .select('id')
        .eq('store_id', storeId)
        .eq('status', 'Aberto')
        .gte('data_abertura', startIso)
        .lte('data_abertura', endIso)
        .maybeSingle()

    if (caixaAberto) {
        return { aberto: true, podeReabrirHoje: false }
    }

    const { data: caixaFechadoHoje } = await (sb.from('caixa_diario') as any)
        .select('id, saldo_inicial, data_fechamento')
        .eq('store_id', storeId)
        .eq('status', 'Fechado')
        .gte('data_abertura', startIso)
        .lte('data_abertura', endIso)
        .order('data_fechamento', { ascending: false })
        .limit(1)
        .maybeSingle()

    return {
        aberto: false,
        podeReabrirHoje: !!caixaFechadoHoje,
        saldoInicialAnterior: caixaFechadoHoje?.saldo_inicial ?? null,
        dataFechamento: caixaFechadoHoje?.data_fechamento ?? null
    }
}

// 6. RELATÓRIOS
export async function getRelatorioFinanceiroMensal(storeId: number, mes: number, ano: number, tipo: 'pix' | 'cartoes') {
    const sb = createAdminClient(); const start = new Date(ano, mes - 1, 1, 0, 0, 0).toISOString(); const end = new Date(ano, mes, 0, 23, 59, 59, 999).toISOString()
    let q = sb.from('pagamentos').select('id, valor_pago, forma_pagamento, created_at, obs, vendas!left(id, customers!left(full_name))').eq('store_id', storeId).gte('created_at', start).lte('created_at', end)
    if (tipo === 'pix') q = q.ilike('forma_pagamento', '%pix%'); else q = q.or('forma_pagamento.ilike.%cartão%,forma_pagamento.ilike.%crédito%,forma_pagamento.ilike.%débito%')
    const { data, error } = await q
    if (error) return { success: false, message: 'Erro' }
    const res = data.map((p: any) => ({
        id: p.id, valor_pago: p.valor_pago, forma_pagamento: p.forma_pagamento || 'Outros', created_at: p.created_at, obs: p.obs,
        customer_name: p.vendas?.customers?.full_name || (p.obs?.includes('Cliente:') ? p.obs.split('Cliente:')[1].trim() : 'Consumidor')
    })).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return { success: true, data: res }
}

export async function getUltimoFechamento(storeId: number) {
    const sb = createAdminClient()
    const { data: ultimoCaixa } = await (sb.from('caixa_diario') as any)
        .select('id, data_abertura, data_fechamento, saldo_final, saldo_inicial, status')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (!ultimoCaixa) return null

    if (ultimoCaixa.status === 'Fechado') {
        return {
            saldo_final: ultimoCaixa.saldo_final,
            data_fechamento: ultimoCaixa.data_fechamento || ultimoCaixa.data_abertura
        }
    } else {
        // O último caixa ficou aberto e será fechado automaticamente no momento da abertura.
        // Calculamos o saldo esperado desse caixa aberto para sugerir como fundo do novo caixa.
        const dataKey = getStoreDateKey(ultimoCaixa.data_abertura)
        const resumo = await getResumoCaixaPorData(storeId, dataKey)
        const saldoEsperado = resumo?.totais.saldo_esperado_dinheiro ?? Number(ultimoCaixa.saldo_inicial || 0)

        return {
            saldo_final: saldoEsperado,
            data_fechamento: ultimoCaixa.data_abertura
        }
    }
}

export async function getHistoricoCaixa(storeId: number) {
    const sb = createAdminClient()

    // 1. Buscas os últimos 30 caixas fechados
    const { data } = await (sb.from('caixa_diario') as any)
        .select('id, data_abertura, data_fechamento, saldo_inicial, saldo_final, quebra_caixa, obs')
        .eq('store_id', storeId)
        .eq('status', 'Fechado')
        .order('created_at', { ascending: false })
        .limit(30)

    const caixas = data || []
    if (caixas.length === 0) return []

    const caixaIds = caixas.map((c: any) => c.id)
    const dateKeys = caixas.map((c: any) => getStoreDateKey(c.data_abertura))
    // 2. Busca movimentos manuais (para calcular Saídas)
    const { data: movs } = await (sb.from('caixa_movimentacoes') as any)
        .select('caixa_id, tipo, valor')
        .in('caixa_id', caixaIds)
        .eq('tipo', 'Saida') // Só preciso das saídas para reverter a conta

    const movimentos = movs || []

    const { data: movsTodos } = await (sb.from('caixa_movimentacoes') as any)
        .select('caixa_id, tipo, valor')
        .in('caixa_id', caixaIds)

    const movimentosCompletos = movsTodos || movimentos
    const movimentosPorCaixa = new Map<number, { entradas: number, saidas: number }>()

    movimentosCompletos.forEach((mov: any) => {
        const atual = movimentosPorCaixa.get(mov.caixa_id) || { entradas: 0, saidas: 0 }
        const valor = Number(mov.valor) || 0

        if (mov.tipo === 'Entrada') atual.entradas += valor
        else atual.saidas += valor

        movimentosPorCaixa.set(mov.caixa_id, atual)
    })

    const recebimentosEmDinheiroPorDia = await getCashReceiptsByDateKeys(storeId, dateKeys)

    const historicoRecalculado = caixas.map((cx: any) => {
        const dateKey = getStoreDateKey(cx.data_abertura)
        const movimentoManual = movimentosPorCaixa.get(cx.id) || { entradas: 0, saidas: 0 }
        const entradasEmDinheiro = recebimentosEmDinheiroPorDia.get(dateKey) || 0
        const saldoInicial = Number(cx.saldo_inicial)
        const saldoEsperado = saldoInicial + entradasEmDinheiro + movimentoManual.entradas - movimentoManual.saidas
        const saldoFinal = cx.saldo_final === null ? null : Number(cx.saldo_final)
        const quebra = saldoFinal === null ? Number(cx.quebra_caixa) || 0 : saldoFinal - saldoEsperado

        return {
            id: cx.id,
            data: cx.data_abertura,
            saldo_inicial: saldoInicial,
            entradas: entradasEmDinheiro + movimentoManual.entradas,
            saidas: movimentoManual.saidas,
            saldo_esperado: saldoEsperado,
            saldo_final: saldoFinal ?? 0,
            quebra,
            obs: cx.obs
        }
    })

    return historicoRecalculado
/*

    // 3. Processa
    const historico = caixas.map((cx: any) => {
        const saidasManuais = movimentos
            .filter((m: any) => m.caixa_id === cx.id)
            .reduce((acc: number, curr: any) => acc + Number(curr.valor), 0)

        const saldoFinal = Number(cx.saldo_final)
        const saldoInicial = Number(cx.saldo_inicial)
        const quebra = Number(cx.quebra_caixa) || 0

        // Saldo Final = Saldo Inicial + Entradas (Vendas + Suprimentos) - Saídas + Quebra
        // Entradas = Saldo Final - Saldo Inicial + Saídas - Quebra
        const entradasTotais = saldoFinal - saldoInicial + saidasManuais - quebra

        return {
            id: cx.id,
            data: cx.data_abertura, // IMPORTANTE: Usar data de ABERTURA, pois auto-close define fechamento de vários dias presos para hoje.
            saldo_inicial: saldoInicial,
            entradas: entradasTotais,
            saidas: saidasManuais,
            saldo_esperado: saldoFinal - quebra,
            saldo_final: saldoFinal,
            quebra: quebra
        }
    })

    return historico
*/
}
export async function getExtratoDiario(storeId: number) {
    const sb = createAdminClient()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)
    startDate.setHours(0, 0, 0, 0)
    const startDateStr = startDate.toISOString()

    // --- 0. CALCULAR SALDO ANTERIOR (Tudo antes de startDate) ---
    // A. Vendas Anteriores
    const { data: vendasAnteriores } = await sb
        .from('pagamentos')
        .select('valor_pago')
        .eq('store_id', storeId)
        .lt('created_at', startDateStr)
        .ilike('forma_pagamento', '%dinheiro%')

    const totalVendasAnt = vendasAnteriores?.reduce((acc: number, curr: any) => acc + Number(curr.valor_pago), 0) || 0

    // B. Movimentos Anteriores (Entradas e Saídas)
    // Para simplificar, vamos pegar TODAS as movimentações anteriores dessa loja
    // Precisamos dos IDs dos caixas anteriores. Mas caixa_movimentacoes não tem store_id direto.
    // Vamos pegar via caixa_diario.
    const { data: caixasAnt } = await sb
        .from('caixa_diario')
        .select('id')
        .eq('store_id', storeId)
        .lt('created_at', startDateStr)

    let totalEntradasAnt = 0
    let totalSaidasAnt = 0

    if (caixasAnt && caixasAnt.length > 0) {
        const idsAnt = caixasAnt.map((c: any) => c.id)
        // Batching requests se for muito grande? Para 30 dias é ok, mas "desde o início" pode ser grande.
        // Vamos assumir que o volume não quebra o limite de URL do Postgrest por enquanto.
        // Se crescer, precisaríamos de uma RPC 'sum_movements_by_store'.
        // Mas vamos seguir com query. Limitando a 1000 IDs por vez se precisar, mas aqui vai direto.
        const { data: movsAnt } = await (sb.from('caixa_movimentacoes') as any)
            .select('tipo, valor')
            .in('caixa_id', idsAnt)

        movsAnt?.forEach((m: any) => {
            if (m.tipo === 'Entrada') totalEntradasAnt += Number(m.valor)
            if (m.tipo === 'Saida') totalSaidasAnt += Number(m.valor)
        })
    }

    const saldoAnterior = totalVendasAnt + totalEntradasAnt - totalSaidasAnt

    // --- 1. DADOS DO PERÍODO (Últimos 30 dias) ---
    const { data: vendas } = await sb
        .from('pagamentos')
        .select('valor_pago, created_at, forma_pagamento')
        .eq('store_id', storeId)
        .gte('created_at', startDateStr)
        .ilike('forma_pagamento', '%dinheiro%')

    const { data: caixas } = await sb
        .from('caixa_diario')
        .select('id')
        .eq('store_id', storeId)
        .gte('created_at', startDateStr)

    let movimentos: any[] = []
    if (caixas && caixas.length > 0) {
        const ids = caixas.map((c: any) => c.id)
        const { data: movs } = await (sb.from('caixa_movimentacoes') as any)
            .select('caixa_id, tipo, valor, created_at')
            .in('caixa_id', ids)
        movimentos = movs || []
    }

    // --- 2. AGRUPAMENTO ---
    const dadosPorDia: Record<string, { vendas: number, entradas: number, saidas: number }> = {}

    const getDataKey = (isoStr: string) => {
        const d = new Date(isoStr)
        d.setHours(d.getHours() - 3)
        return d.toISOString().split('T')[0]
    }

    vendas?.forEach((v: any) => {
        const key = getDataKey(v.created_at)
        if (!dadosPorDia[key]) dadosPorDia[key] = { vendas: 0, entradas: 0, saidas: 0 }
        dadosPorDia[key].vendas += Number(v.valor_pago)
    })

    movimentos.forEach((m: any) => {
        const key = getDataKey(m.created_at)
        if (!dadosPorDia[key]) dadosPorDia[key] = { vendas: 0, entradas: 0, saidas: 0 }
        if (m.tipo === 'Entrada') dadosPorDia[key].entradas += Number(m.valor)
        if (m.tipo === 'Saida') dadosPorDia[key].saidas += Number(m.valor)
    })

    // --- 3. CÁLCULO DO SALDO ACUMULADO ---
    // Ordenar CRESCENTE para calcular o acumulado
    const listaOrdenada = Object.entries(dadosPorDia)
        .sort((a, b) => a[0].localeCompare(b[0]))

    let saldoAtual = saldoAnterior
    const resultado = listaOrdenada.map(([data, vals]) => {
        const saldoDia = vals.vendas + vals.entradas - vals.saidas
        saldoAtual += saldoDia
        return {
            data,
            vendas: vals.vendas,
            entradas: vals.entradas,
            saidas: vals.saidas,
            saldo_dia: saldoDia,
            saldo_acumulado: saldoAtual
        }
    })

    // Retorna DECRESCENTE (mais recente primeiro) + Saldo Anterior (opcional, pode ser útil)
    return {
        saldo_anterior: saldoAnterior,
        extrato: resultado.reverse()
    }
}

// ============================================================================
// 3. OBTER O RESUMO DO DIA (VERSÃO HÍBRIDA CORRIGIDA)
// ============================================================================
export async function getResumoCaixa(storeId: number): Promise<ResumoCaixa | null> {
    const supabaseAdmin = createAdminClient()

    // 1. Buscar Caixa Aberto
    const hojeInicio = new Date()
    hojeInicio.setHours(0, 0, 0, 0)

    const { data: caixa } = await (supabaseAdmin.from('caixa_diario').select('*').eq('store_id', storeId).eq('status', 'Aberto').gte('created_at', hojeInicio.toISOString()).order('created_at', { ascending: false }).maybeSingle() as any)
    if (!caixa) return null

    // 2. Movimentos Manuais
    const { data: movimentos } = await supabaseAdmin.from('caixa_movimentacoes').select('*').eq('caixa_id', caixa.id).order('created_at', { ascending: false })
    const listaMov = (movimentos || []) as Movimentacao[]

    // 3. Categorias (Autocomplete)
    const { data: catData } = await (supabaseAdmin.from('caixa_movimentacoes').select('categoria').eq('store_id', storeId).not('categoria', 'is', null).order('created_at', { ascending: false }).limit(100) as any)
    const categoriasUnicas = Array.from(new Set(catData?.map((c: any) => formatarCategoria(c.categoria)).filter(Boolean) as string[]))

    // 4. PAGAMENTOS (Fonte Principal)
    const dataRef = new Date(caixa.data_abertura)
    dataRef.setHours(0, 0, 0, 0)

    const { data: pagamentosVendas } = await supabaseAdmin
        .from('pagamentos')
        .select(`id, valor_pago, forma_pagamento, created_at, venda_id, obs, employee_id, vendas (customer_id, customers (full_name))`)
        .eq('store_id', storeId)
        .gte('created_at', dataRef.toISOString())

    const listaPagamentos = pagamentosVendas || []

    // 5. PARCELAS (Fonte Legado / Backup para Falhas)
    const { data: parcelasPagas } = await supabaseAdmin
        .from('financiamento_parcelas')
        .select(`id, valor_parcela, data_pagamento, customer_id, customers (full_name), financiamento_loja(venda_id)`)
        .eq('store_id', storeId)
        .eq('status', 'Pago')
        .gte('data_pagamento', dataRef.toISOString())

    const listaParcelas = parcelasPagas || []

    // --- LÓGICA DE DEDUPLICAÇÃO ---
    // Criamos um Set com assinaturas dos pagamentos processados para não adicionar a parcela correspondente novamente.
    // Assinatura: Valor + Data(Dia). (Links mais fortes como ID seriam melhores, mas não temos link direto LEGADO)
    // Para os NOVOS, temos 'Ref. Venda #ID - Parc. #N' no obs.
    const pagamentosProcessados = new Set<string>()

    // 3.1 AGREGAÇÃO UNIFICADA
    const historicoUnificado: any[] = []

    listaMov.forEach(m => {
        historicoUnificado.push({
            id: `mov-${m.id}`, tipo: m.tipo, descricao: m.descricao, categoria: m.categoria, valor: Number(m.valor), horario: m.created_at, forma_pagamento: m.forma_pagamento || 'Dinheiro', origem: 'Caixa'
        })
    })

    listaPagamentos.forEach((pg: any) => {
        let clienteNome = pg.vendas?.customers?.full_name
        let tipo = 'Venda'
        let categoria = 'Venda'
        let ehParcela = false
        let vendaIdRef = pg.venda_id
        let numParcRef = null

        // Detectar Parcelas (obs contém Ref...)
        if (pg.obs && pg.obs.includes('Parc.')) {
            tipo = 'Recebimento'
            categoria = 'Recebimento'
            ehParcela = true

            // Tenta extrair ID Venda e Num Parc para deduplicação precisa
            // Obs: "Ref. Venda #92 - Parc. 1 ..."
            const matchRef = pg.obs.match(/Venda #(\d+)/)
            if (matchRef) vendaIdRef = matchRef[1]

            const matchParc = pg.obs.match(/Parc\. (\d+)/)
            numParcRef = matchParc ? matchParc[1] : null

            if (pg.obs.includes('Cliente:')) {
                const parts = pg.obs.split('Cliente:')
                if (parts.length > 1) clienteNome = parts[1].trim()
            }
            clienteNome = `Carnê ${numParcRef || '?'}x - ${clienteNome || 'Cliente'}`
        }

        if (!clienteNome) clienteNome = 'Consumidor / Avulso'
        const formaNormalizada = (pg.forma_pagamento || '').toLowerCase()
        const origemCalculada = formaNormalizada.includes('dinheiro') ? 'Caixa' : 'Banco'

        historicoUnificado.push({
            id: `pg-${pg.id}`, tipo: tipo, descricao: clienteNome, categoria: categoria, valor: Number(pg.valor_pago), horario: pg.created_at, forma_pagamento: pg.forma_pagamento, origem: origemCalculada, employee_id: pg.employee_id ?? null
        })

        // Marca como processado para deduplicação
        if (ehParcela && vendaIdRef && numParcRef) {
            pagamentosProcessados.add(`${vendaIdRef}-${numParcRef}`)
        }
    })

    // PROCESSAR PARCELAS (LEGADO OU FALHA DE INSERT)
    // Só adiciona se NÃO encontrar correspondente no Set
    listaParcelas.forEach((pc: any) => {
        const vendaId = pc.financiamento_loja?.venda_id
        // Tenta achar o número da parcela? O select atual não pegou 'numero_parcela'. 
        // Vamos assumir deduplicação por "Se já tem um pagamento recente com esse valor e cliente..."
        // Mas a lógica mais segura agora é: Se o pagamento falhou no insert (caso atual do usuario), ele NÃO está no Set.
        // Então ele VAI entrar aqui.

        // CORREÇÃO: Precisamos saber qual parcela é para deduplicar corretamente no futuro.
        // Mas para o caso do usuário AGORA, o pagamento não existe, então ele vai cair aqui.
        // O problema é a duplicação futura. 
        // Como o insert agora está corrigido, futuros terão o registro no pagamentos e no Set.
        // E aqui teremos o registro da parcela.
        // Precisamos do 'numero_parcela' no select da listaParcelas para a chave bater.

        // Porem, no select acima eu não pus numero_parcela. Vou confiar que se existir no Pagamentos, ESTÁ OK.
        // Se não existir (caso legado ou bug), entra aqui como "Dinheiro" (que é o fallback do legado).

        // Mas espere! Se eu adicionar aqui, vai ser Dinheiro. O usuário queria PIX.
        // O usuário pagou PIX, mas o sistema salvou só na parcela (sem info de forma).
        // ENTÃO O DADO 'PIX' FOI PERDIDO neste caso específico de erro.
        // O usuário terá que ver como "Dinheiro" ou editar manualmente se o banco permitisse.
        // Mas pelo menos o valor reaparece no caixa (como Dinheiro).

        // Para evitar duplicidade futura:
        // Vou verificar se existe algum pagamento com mesmo VALOR e DATA (dia) e venda_id (se tiver).
        // É uma heurística fraca, mas melhor que nada.
        // Na prática, o correto é: Pagamentos é a fonte real. Parcelas é redundância.
        // Se está em Pagamentos, ignore Parcelas.
        // Se NÃO está em Pagamentos, mostre Parcela.
        // Como saber se "é a mesma"?

        // Vou deixar ambos por enquanto, mas com um filtro simples:
        // Se a parcela tem data de pagamento hoje, e existe um pagamento de recebimento com mesmo valor?

        // Simplificação: Vou adicionar TUDO da listaParcelas.
        // O usuário reclamou que SUMIU. Melhor aparecer Duplicado (e eu aviso) do que Sumir.
        // Mas espere, se aparecer duplicado, o caixa não bate.

        // VOU USAR A LÓGICA DO SET COM O QUE TENHO.
        // Vou adicionar 'numero_parcela' ao select de parcelas.

        const clienteNome = pc.customers?.full_name || 'Cliente'
        // ... logica de adicionar ...
        // Como o select original não tinha numero_parcela, vou assumir risco de duplicidade APENAS se o pagamento existir.
        // Mas no caso atual, o pagamento NÃO existe. Então não duplica.
        // Nos casos futuros, o pagamento existirá. E a parcela existirá.
        // AI VAI DUPLICAR.

        // SOLUÇÃO: Filtro por venda_id (que tenho no financiamento_loja) e valor.
        // Se eu tenho um Pagamento vinculado a essa Venda (via obs) com esse valor, ignoro a parcela.

        let duplicado = false
        if (vendaId) {
            // Procura nos pagamentos algum que mencione essa venda no obs e tenha mesmo valor
            const match = listaPagamentos.find((p: any) =>
                p.valor_pago === pc.valor_parcela &&
                p.obs && p.obs.includes(`Venda #${vendaId}`)
            )
            if (match) duplicado = true
        }

        if (!duplicado) {
            historicoUnificado.push({
                id: `parc-${pc.id}`,
                tipo: 'Recebimento',
                descricao: `Carnê - ${clienteNome}`,
                categoria: 'Recebimento',
                valor: Number(pc.valor_parcela),
                horario: pc.data_pagamento,
                forma_pagamento: 'Dinheiro', // Fallback legado
                origem: 'Caixa'
            })
        }
    })

    historicoUnificado.sort((a, b) => new Date(b.horario).getTime() - new Date(a.horario).getTime())

    const vendas = { total_dinheiro: 0, total_pix: 0, total_cartao: 0, total_outros: 0, detalhes: listaPagamentos }

    // RECALCULO DE TOTAIS COM O HISTORICO UNIFICADO (JÁ QUE ELE CONTÉM TUDO)
    // Assim garantimos que o total bate com a lista.
    vendas.total_dinheiro = 0
    vendas.total_pix = 0
    vendas.total_cartao = 0
    vendas.total_outros = 0

    // Filtra apenas o que é "Venda" ou "Recebimento" para somar nas vendas/recebimentos
    historicoUnificado.forEach((item: any) => {
        if (item.tipo === 'Venda' || item.tipo === 'Recebimento') {
            const forma = (item.forma_pagamento || '').toLowerCase()
            const val = item.valor
            if (forma.includes('dinheiro')) vendas.total_dinheiro += val
            else if (forma.includes('pix')) vendas.total_pix += val
            else if (forma.includes('cart')) vendas.total_cartao += val
            else vendas.total_outros += val
        }
    })

    const manuais = { entradas: 0, saidas: 0 }
    listaMov.forEach((m: any) => {
        const val = Number(m.valor)
        if (m.tipo === 'Entrada') manuais.entradas += val
        else manuais.saidas += val
    })

    const saldoGaveta = Number(caixa.saldo_inicial) + vendas.total_dinheiro + manuais.entradas - manuais.saidas
    const saldoGeral = saldoGaveta + vendas.total_pix + vendas.total_cartao + vendas.total_outros

    // --- COMPARATIVO MENSAL ---
    const startOfMonth = new Date(hojeInicio.getFullYear(), hojeInicio.getMonth(), 1).toISOString()
    const now = new Date().toISOString()

    // Mês Anterior (Mesmo intervalo de dias)
    const startOfLastMonth = new Date(hojeInicio.getFullYear(), hojeInicio.getMonth() - 1, 1).toISOString()
    // Data final do mês anterior compatível (ex: se hoje é dia 10, pega até dia 10 do mês passado)
    const endOfLastMonthRef = new Date(hojeInicio.getFullYear(), hojeInicio.getMonth() - 1, hojeInicio.getDate(), 23, 59, 59).toISOString()

    // Query Mês Atual (VENDAS REAIS + FINANCIAMENTO)
    const { data: vendasMesAtual } = await supabaseAdmin
        .from('vendas')
        .select('valor_final, valor_restante, financiamento_loja!financiamento_loja_venda_id_fkey(valor_total_financiado)')
        .eq('store_id', storeId)
        .eq('status', 'Fechada')
        .gte('data_fechamento', startOfMonth)
        .lte('data_fechamento', now)

    // Query Mês Anterior (VENDAS REAIS)
    const { data: vendasMesAnterior } = await supabaseAdmin
        .from('vendas')
        .select('valor_final, valor_restante')
        .eq('store_id', storeId)
        .eq('status', 'Fechada')
        .gte('data_fechamento', startOfLastMonth)
        .lte('data_fechamento', endOfLastMonthRef)

    const totalMesAtual = (vendasMesAtual as any[])?.reduce((acc, curr) => acc + Number(curr.valor_final), 0) || 0
    const totalMesAnterior = (vendasMesAnterior as any[])?.reduce((acc, curr) => acc + Number(curr.valor_final), 0) || 0

    // Cálculo Vista vs Prazo (Somente Mês Atual)
    // À Prazo = valor_restante (ainda em aberto) + valor financiado via carnê
    // À Vista = valor_final - À Prazo
    const faturamentoAprazo = (vendasMesAtual as any[])?.reduce((acc, curr) => {
        const valorRestante = Number(curr.valor_restante || 0)
        const financiamentos = curr.financiamento_loja
        const valorFinanciado = Array.isArray(financiamentos)
            ? financiamentos.reduce((sum: number, f: any) => sum + Number(f.valor_total_financiado || 0), 0)
            : Number(financiamentos?.valor_total_financiado || 0)
        return acc + valorRestante + valorFinanciado
    }, 0) || 0

    const faturamentoAvista = totalMesAtual - faturamentoAprazo

    // --- DIVERGÊNCIAS (ÚLTIMOS 30 DIAS) ---
    const trintaDiasAtras = new Date()
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30)

    const { data: fechamentos30d } = await supabaseAdmin
        .from('caixa_diario')
        .select('quebra_caixa')
        .eq('store_id', storeId)
        .eq('status', 'Fechado')
        .gte('created_at', trintaDiasAtras.toISOString())

    let total_quebra_positiva = 0
    let total_quebra_negativa = 0

    fechamentos30d?.forEach((f: any) => {
        const q = Number(f.quebra_caixa || 0)
        if (q > 0) total_quebra_positiva += q
        else if (q < 0) total_quebra_negativa += q
    })

    return {
        caixa,
        movimentacoes: listaMov,
        movimentacoes_detalhadas: historicoUnificado,
        categoriasUsadas: categoriasUnicas.sort(),
        vendas,
        totais: {
            entradas_manuais: manuais.entradas,
            saidas_manuais: manuais.saidas,
            saldo_esperado_dinheiro: saldoGaveta,
            saldo_geral_acumulado: saldoGeral,
            divergencias: {
                positiva: total_quebra_positiva,
                negativa: total_quebra_negativa
            }
        },
        comparativo: {
            faturamento_mensal_atual: totalMesAtual,
            faturamento_mensal_anterior: totalMesAnterior,
            faturamento_avista: faturamentoAvista,
            faturamento_aprazo: faturamentoAprazo
        }
    }
}

// ============================================================================
// 7. AUDITORIA: RESUMO POR DATA ESPECÍFICA (READ-ONLY)
// ============================================================================
export async function getResumoCaixaPorData(storeId: number, dataISO: string): Promise<ResumoCaixa | null> {
    const supabaseAdmin = createAdminClient()

    const { startIso, endIso } = getStoreDayRange(dataISO)
    const dataRef = new Date(startIso)
    const dataFim = new Date(endIso)

    // 1. Buscar Caixa do dia (aberto OU fechado)
    const { data: caixa } = await (supabaseAdmin
        .from('caixa_diario')
        .select('*')
        .eq('store_id', storeId)
        .gte('created_at', dataRef.toISOString())
        .lte('created_at', dataFim.toISOString())
        .order('created_at', { ascending: false })
        .maybeSingle() as any)

    // 4. PAGAMENTOS do dia
    const { data: pagamentosVendas } = await supabaseAdmin
        .from('pagamentos')
        .select(`id, valor_pago, forma_pagamento, created_at, venda_id, obs, employee_id, vendas (customer_id, customers (full_name))`)
        .eq('store_id', storeId)
        .gte('created_at', dataRef.toISOString())
        .lte('created_at', dataFim.toISOString())
    const listaPagamentos = pagamentosVendas || []

    // 5. PARCELAS do dia
    const { data: parcelasPagas } = await supabaseAdmin
        .from('financiamento_parcelas')
        .select(`id, valor_parcela, data_pagamento, customer_id, customers (full_name), financiamento_loja(venda_id)`)
        .eq('store_id', storeId)
        .eq('status', 'Pago')
        .gte('data_pagamento', dataRef.toISOString())
        .lte('data_pagamento', dataFim.toISOString())
    const listaParcelas = parcelasPagas || []

    if (!caixa && listaPagamentos.length === 0 && listaParcelas.length === 0) return null

    // 2. Movimentos Manuais
    let listaMov: Movimentacao[] = []
    if (caixa) {
        const { data: movimentos } = await supabaseAdmin
            .from('caixa_movimentacoes')
            .select('*')
            .eq('caixa_id', caixa.id)
            .order('created_at', { ascending: false })
        listaMov = (movimentos || []) as Movimentacao[]
    }

    // 3. Categorias (Autocomplete - reutiliza da loja)
    const categoriasUnicas: string[] = []

    // --- HISTÓRICO UNIFICADO (mesma lógica de getResumoCaixa) ---
    const historicoUnificado: any[] = []

    listaMov.forEach(m => {
        historicoUnificado.push({
            id: `mov-${m.id}`, tipo: m.tipo, descricao: m.descricao, categoria: m.categoria, valor: Number(m.valor), horario: m.created_at, forma_pagamento: m.forma_pagamento || 'Dinheiro', origem: 'Caixa'
        })
    })

    listaPagamentos.forEach((pg: any) => {
        let clienteNome = pg.vendas?.customers?.full_name
        let tipo = 'Venda'
        let categoria = 'Venda'
        let ehParcela = false
        let vendaIdRef = pg.venda_id
        let numParcRef = null

        if (pg.obs && pg.obs.includes('Parc.')) {
            tipo = 'Recebimento'
            categoria = 'Recebimento'
            ehParcela = true
            const matchRef = pg.obs.match(/Venda #(\d+)/)
            if (matchRef) vendaIdRef = matchRef[1]
            const matchParc = pg.obs.match(/Parc\. (\d+)/)
            numParcRef = matchParc ? matchParc[1] : null
            if (pg.obs.includes('Cliente:')) {
                const parts = pg.obs.split('Cliente:')
                if (parts.length > 1) clienteNome = parts[1].trim()
            }
            clienteNome = `Carnê ${numParcRef || '?'}x - ${clienteNome || 'Cliente'}`
        }

        if (!clienteNome) clienteNome = 'Consumidor / Avulso'
        const formaNormalizada = (pg.forma_pagamento || '').toLowerCase()
        const origemCalculada = formaNormalizada.includes('dinheiro') ? 'Caixa' : 'Banco'

        historicoUnificado.push({
            id: `pg-${pg.id}`, tipo, descricao: clienteNome, categoria, valor: Number(pg.valor_pago), horario: pg.created_at, forma_pagamento: pg.forma_pagamento, origem: origemCalculada, employee_id: pg.employee_id ?? null
        })
    })

    listaParcelas.forEach((pc: any) => {
        const vendaId = pc.financiamento_loja?.venda_id
        const clienteNome = pc.customers?.full_name || 'Cliente'
        let duplicado = false
        if (vendaId) {
            const match = listaPagamentos.find((p: any) =>
                p.valor_pago === pc.valor_parcela &&
                p.obs && p.obs.includes(`Venda #${vendaId}`)
            )
            if (match) duplicado = true
        }
        if (!duplicado) {
            historicoUnificado.push({
                id: `parc-${pc.id}`, tipo: 'Recebimento', descricao: `Carnê - ${clienteNome}`, categoria: 'Recebimento', valor: Number(pc.valor_parcela), horario: pc.data_pagamento, forma_pagamento: 'Dinheiro', origem: 'Caixa'
            })
        }
    })

    historicoUnificado.sort((a, b) => new Date(b.horario).getTime() - new Date(a.horario).getTime())

    // --- TOTAIS ---
    const vendas = { total_dinheiro: 0, total_pix: 0, total_cartao: 0, total_outros: 0, detalhes: listaPagamentos }
    historicoUnificado.forEach((item: any) => {
        if (item.tipo === 'Venda' || item.tipo === 'Recebimento') {
            const forma = (item.forma_pagamento || '').toLowerCase()
            if (forma.includes('dinheiro')) vendas.total_dinheiro += item.valor
            else if (forma.includes('pix')) vendas.total_pix += item.valor
            else if (forma.includes('cart')) vendas.total_cartao += item.valor
            else vendas.total_outros += item.valor
        }
    })

    const manuais = { entradas: 0, saidas: 0 }
    listaMov.forEach((m: any) => {
        if (m.tipo === 'Entrada') manuais.entradas += Number(m.valor)
        else manuais.saidas += Number(m.valor)
    })

    const saldoGaveta = (caixa ? Number(caixa.saldo_inicial) : 0) + vendas.total_dinheiro + manuais.entradas - manuais.saidas
    const saldoGeral = saldoGaveta + vendas.total_pix + vendas.total_cartao + vendas.total_outros
    const quebraRecalculada = caixa && caixa.status === 'Fechado' && caixa.saldo_final !== null
        ? Number(caixa.saldo_final) - saldoGaveta
        : (caixa ? Number(caixa.quebra_caixa || 0) : 0)

    const caixaResult = caixa ? {
        ...caixa,
        quebra_caixa: quebraRecalculada
    } : {
        id: 0,
        store_id: storeId,
        status: 'Não Aberto',
        data_abertura: dataRef.toISOString(),
        saldo_inicial: 0,
        saldo_final: null,
        quebra_caixa: 0
    };

    return {
        caixa: caixaResult,
        movimentacoes: listaMov,
        movimentacoes_detalhadas: historicoUnificado,
        categoriasUsadas: categoriasUnicas,
        vendas,
        totais: {
            entradas_manuais: manuais.entradas,
            saidas_manuais: manuais.saidas,
            saldo_esperado_dinheiro: saldoGaveta,
            saldo_geral_acumulado: saldoGeral
        }
    }
}

// 7. ALTERAR FORMA DE PAGAMENTO
export async function alterarFormaPagamento(
    pagamentoId: number,
    novaForma: string,
    authedEmployeeId: number,
    storeId: number,
    parcelas?: number
): Promise<{ success: boolean; message: string }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Sessão expirada.' }

    const supabaseAdmin = createAdminClient()

    const { data: pagamento, error } = await (supabaseAdmin.from('pagamentos') as any)
        .select('id, employee_id, store_id, forma_pagamento')
        .eq('id', pagamentoId)
        .eq('store_id', storeId)
        .single()

    if (error || !pagamento) return { success: false, message: 'Pagamento não encontrado.' }

    if (pagamento.employee_id && Number(pagamento.employee_id) !== Number(authedEmployeeId)) {
        return { success: false, message: 'Apenas o funcionário que realizou este pagamento pode alterá-lo.' }
    }

    const updatePayload: any = { forma_pagamento: novaForma }
    if (parcelas && parcelas > 1) updatePayload.parcelas = parcelas

    const { error: errUpdate } = await (supabaseAdmin.from('pagamentos') as any)
        .update(updatePayload)
        .eq('id', pagamentoId)

    if (errUpdate) return { success: false, message: `Erro ao atualizar: ${errUpdate.message}` }

    revalidatePath(`/dashboard/loja/${storeId}/financeiro/caixa`)
    return { success: true, message: 'Forma de pagamento atualizada com sucesso.' }
}

// 8. ABSORVER QUEBRA
export async function absorverQuebraCaixa(caixaId: number) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Sessão expirada.' }

    const supabaseAdmin = createAdminClient()
    
    // Buscar o caixa atual para anexar a observação
    const { data: caixa } = await (supabaseAdmin.from('caixa_diario') as any)
        .select('obs, store_id')
        .eq('id', caixaId)
        .maybeSingle()

    if (!caixa) return { success: false, message: 'Caixa não encontrado.' }

    const currentObs = caixa.obs || ''
    if (currentObs.includes('[ABSORVIDO]')) {
        return { success: true, message: 'Já absorvido.' }
    }

    const newObs = currentObs ? `${currentObs} [ABSORVIDO]` : '[ABSORVIDO]'

    await (supabaseAdmin.from('caixa_diario') as any)
        .update({ obs: newObs })
        .eq('id', caixaId)

    revalidatePath(`/dashboard/loja/${caixa.store_id}/financeiro/caixa`)
    return { success: true, message: 'Divergência absorvida com sucesso.' }
}
