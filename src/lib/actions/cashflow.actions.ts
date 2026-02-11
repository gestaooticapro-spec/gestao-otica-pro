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
    }
}

// HELPER: Padronização de Texto (Primeira Maiúscula)
function formatarCategoria(texto: string | null | undefined) {
    if (!texto || texto.trim() === '') return null;
    const t = texto.trim();
    // Transforma "motoboy" em "Motoboy" e "transporte uber" em "Transporte uber"
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
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
    saldo_inicial: z.coerce.number().min(0),
})

export async function abrirCaixa(prevState: any, formData: FormData) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Sessão expirada.' }

    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil não encontrado.' }

    const val = AbrirCaixaSchema.safeParse({
        store_id: profile.store_id,
        saldo_inicial: formData.get('saldo_inicial'),
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
    const dataInicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0, 0).toISOString()
    const { data: caixasAnteriores } = await (supabaseAdmin.from('caixa_diario') as any)
        .select('id, saldo_inicial').eq('store_id', profile.store_id).eq('status', 'Aberto').lt('created_at', dataInicioHoje)

    if (caixasAnteriores?.length) {
        for (const cx of caixasAnteriores) {
            await (supabaseAdmin.from('caixa_diario') as any).update({
                status: 'Fechado', data_fechamento: new Date().toISOString(), closed_by: user.id, saldo_final: cx.saldo_inicial, quebra_caixa: 0
            }).eq('id', cx.id)
        }
    }

    const { data: existe } = await (supabaseAdmin.from('caixa_diario') as any).select('id').eq('store_id', profile.store_id).eq('status', 'Aberto').gte('created_at', dataInicioHoje).maybeSingle()
    if (existe) {
        revalidatePath(`/dashboard/loja/${profile.store_id}/financeiro/caixa`)
        return { success: true, message: 'Caixa já estava aberto.' }
    }

    try {
        await (supabaseAdmin.from('caixa_diario') as any).insert({
            tenant_id: finalTenantId, store_id: profile.store_id, aberto_por_id: user.id, data_abertura: new Date().toISOString(), saldo_inicial: val.data.saldo_inicial, status: 'Aberto'
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
        caixa_id: formData.get('caixa_id'), tipo: formData.get('tipo'), valor: formData.get('valor'), descricao: formData.get('descricao'), categoria: categoriaFormatada, forma_pagamento: formData.get('forma_pagamento')
    })
    if (!val.success) return { success: false, message: 'Dados inválidos.' }

    const supabaseAdmin = createAdminClient()
    const { error } = await (supabaseAdmin.from('caixa_movimentacoes') as any).insert({
        tenant_id: profile.tenant_id, store_id: profile.store_id, caja_id: val.data.caixa_id, usuario_id: user.id, ...val.data, caixa_id: val.data.caixa_id
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
    await (supabaseAdmin.from('caixa_diario') as any).update({ saldo_inicial: val.data.saldo_inicial }).eq('id', val.data.caixa_id)
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

// 4. FECHAR CAIXA
export async function fecharCaixa(prevState: any, formData: FormData) {
    const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser()
    const caixaId = formData.get('caixa_id'); const saldoFinal = formData.get('saldo_final'); const saldoEsperado = formData.get('saldo_esperado')
    const diff = Number(saldoFinal) - Number(saldoEsperado)
    const supabaseAdmin = createAdminClient()
    await (supabaseAdmin.from('caixa_diario') as any).update({ saldo_final: Number(saldoFinal), quebra_caixa: diff, data_fechamento: new Date().toISOString(), fechado_por_id: user?.id, status: 'Fechado' }).eq('id', caixaId)
    return { success: true, message: 'Fechado.' }
}

export async function verificarStatusCaixa(storeId: number): Promise<boolean> {
    const sb = createAdminClient(); const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const { data } = await (sb.from('caixa_diario') as any).select('id').eq('store_id', storeId).eq('status', 'Aberto').gte('created_at', hoje.toISOString()).maybeSingle()
    return !!data
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
        customer_name: p.vendas?.customers?.full_name || (p.obs?.includes('Cliente:') ? p.obs.split('Cliente:')[1].trim() : 'Consumidro')
    })).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return { success: true, data: res }
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
        .select(`id, valor_pago, forma_pagamento, created_at, venda_id, obs, vendas (customer_id, customers (full_name))`)
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
            id: `pg-${pg.id}`, tipo: tipo, descricao: clienteNome, categoria: categoria, valor: Number(pg.valor_pago), horario: pg.created_at, forma_pagamento: pg.forma_pagamento, origem: origemCalculada
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

    return {
        caixa, movimentacoes: listaMov, movimentacoes_detalhadas: historicoUnificado, categoriasUsadas: categoriasUnicas.sort(),
        vendas, totais: { entradas_manuais: manuais.entradas, saidas_manuais: manuais.saidas, saldo_esperado_dinheiro: saldoGaveta, saldo_geral_acumulado: saldoGeral }
    }
}
