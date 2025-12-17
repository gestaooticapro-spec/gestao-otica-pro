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

// ============================================================================
// 1. ABRIR CAIXA (VERSÃO BLINDADA CONTRA ERRO DE TENANT)
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

  if (!val.success) {
    return { success: false, message: 'Valor inválido.' }
  }

  const supabaseAdmin = createAdminClient()

  // --- CORREÇÃO DE SEGURANÇA (FIX) ---
  // Se o perfil do usuário estiver sem tenant_id (erro de cadastro),
  // buscamos o tenant_id direto da loja para não travar o sistema.
  let finalTenantId = profile.tenant_id

  if (!finalTenantId) {
    const { data: store } = await (supabaseAdmin
      .from('stores') as any)
      .select('tenant_id')
      .eq('id', profile.store_id)
      .single()

    if (store) {
      finalTenantId = (store as any).tenant_id
    }
  }

  if (!finalTenantId) {
    return {
      success: false,
      message: 'Erro Crítico: Loja sem Tenant ID configurado. Contate o suporte.',
    }
  }
  // ------------------------------------

  // Verifica se já existe caixa aberto hoje
  const hoje = new Date()
  const dataInicioHoje = new Date(hoje.setHours(0, 0, 0, 0)).toISOString()

  const { data: existe } = await (supabaseAdmin
    .from('caixa_diario') as any)
    .select('id')
    .eq('store_id', profile.store_id)
    .eq('status', 'Aberto')
    .gte('created_at', dataInicioHoje)
    .maybeSingle()

  if (existe) {
    revalidatePath(`/dashboard/loja/${profile.store_id}/financeiro/caixa`)
    return { success: true, message: 'Caixa já estava aberto.' }
  }

  try {
    await (supabaseAdmin
      .from('caixa_diario') as any)
      .insert({
        tenant_id: finalTenantId,
        store_id: profile.store_id,
        aberto_por_id: user.id,
        data_abertura: new Date().toISOString(),
        saldo_inicial: val.data.saldo_inicial,
        status: 'Aberto',
      })

    revalidatePath(`/dashboard/loja/${profile.store_id}/financeiro/caixa`)
    return { success: true, message: 'Caixa aberto com sucesso!' }
  } catch (e: any) {
    console.error('Erro abrir caixa:', e)
    return { success: false, message: `Erro ao abrir caixa: ${e.message}` }
  }
}

// ============================================================================
// 2. LANÇAR MOVIMENTAÇÃO (ATUALIZADO COM CATEGORIA)
// ============================================================================
const MovimentoSchema = z.object({
    caixa_id: z.coerce.number(),
    tipo: z.enum(['Entrada', 'Saida']),
    valor: z.coerce.number().min(0.01),
    descricao: z.string().min(3),
    categoria: z.string().optional(),
    forma_pagamento: z.string().default('Dinheiro')
})

export async function adicionarMovimento(prevState: any, formData: FormData) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Erro de permissão.' }

    const profile = await getProfileByAdmin(user.id) as any

    
    // 1. Sanitização da Categoria (Aqui acontece a mágica da padronização)
    const categoriaRaw = formData.get('categoria') as string;
    const categoriaFormatada = formatarCategoria(categoriaRaw);

    const rawData = {
        caixa_id: formData.get('caixa_id'),
        tipo: formData.get('tipo'),
        valor: formData.get('valor'),
        descricao: formData.get('descricao'),
        categoria: categoriaFormatada || undefined, // Envia formatado para validação
        forma_pagamento: formData.get('forma_pagamento') || undefined
    }

    const val = MovimentoSchema.safeParse(rawData)

    if (!val.success) {
        return { success: false, message: 'Dados inválidos. Verifique os campos.' }
    }

    const supabaseAdmin = createAdminClient()

    try {
const { error } = await (supabaseAdmin
    .from('caixa_movimentacoes') as any)
    .insert({
        tenant_id: profile?.tenant_id!,
        store_id: profile?.store_id!,
        caixa_id: val.data.caixa_id,
        usuario_id: user.id,
        tipo: val.data.tipo,
        valor: val.data.valor,
        descricao: val.data.descricao,
        categoria: val.data.categoria,
        forma_pagamento: val.data.forma_pagamento
    })

        if (error) throw error

        revalidatePath(`/dashboard/loja/${profile?.store_id}/financeiro/caixa`)
        return { success: true, message: 'Lançamento registrado.' }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// ============================================================================
// 3. OBTER O RESUMO DO DIA
// ============================================================================
export async function getResumoCaixa(storeId: number): Promise<ResumoCaixa | null> {
    const supabaseAdmin = createAdminClient()
    
    // 1. Buscar Caixa Aberto Hoje
    const hojeInicio = new Date()
    hojeInicio.setHours(0,0,0,0)

const { data: caixa } = await (supabaseAdmin
    .from('caixa_diario')
    .select('*')
    .eq('store_id', storeId)
    .eq('status', 'Aberto')
    .gte('created_at', hojeInicio.toISOString())
    .order('created_at', { ascending: false })
    .maybeSingle() as any)

    if (!caixa) return null 

    // 2. Buscar Movimentações Manuais
    const { data: movimentos } = await supabaseAdmin
        .from('caixa_movimentacoes')
        .select('*')
        .eq('caixa_id', caixa.id)
        .order('created_at', { ascending: false })

    const listaMov = movimentos || []

    // --- NOVO: Buscar histórico de categorias usadas recentemente ---
    // Isso alimenta o autocomplete. Pegamos os últimos 100 lançamentos da loja para extrair categorias.
    const { data: historicoCategorias } = await (supabaseAdmin
    .from('caixa_movimentacoes')
    .select('categoria')
    .eq('store_id', storeId)
    .not('categoria', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100) as any)

    
    // Filtra duplicatas no JS (Set)
   // Filtra duplicatas, MAS formata antes de agrupar.
// Isso funde "transporte" e "Transporte" numa coisa só visualmente.
const categoriasUnicas = Array.from(new Set(
    historicoCategorias
        ?.map((c: any) => formatarCategoria(c.categoria))
        .filter(Boolean) as string[]
));

    // 3. BUSCAR VENDAS
    const dataReferencia = new Date(caixa.data_abertura)
    dataReferencia.setHours(0,0,0,0)

    const { data: pagamentosVendas } = await supabaseAdmin
        .from('pagamentos')
        .select('id, valor_pago, forma_pagamento, created_at')
        .eq('store_id', storeId)
        .gte('created_at', dataReferencia.toISOString()) 
    
    const listaPagamentos = pagamentosVendas || []

    // 4. CALCULAR TOTAIS
    const vendas = {
        total_dinheiro: 0,
        total_pix: 0,
        total_cartao: 0,
        total_outros: 0,
        detalhes: listaPagamentos
    }

listaPagamentos.forEach((pg: any) => {
    const valor = Number(pg.valor_pago)
    const forma = pg.forma_pagamento.toLowerCase()

    if (forma.includes('dinheiro')) vendas.total_dinheiro += valor
    else if (forma.includes('pix')) vendas.total_pix += valor
    else if (forma.includes('cart')) vendas.total_cartao += valor
    else vendas.total_outros += valor
})

const manuais = {
        entradas: 0,
        saidas: 0
    }

    listaMov.forEach((m: any) => {

        const val = Number(m.valor)
        if (m.tipo === 'Entrada') manuais.entradas += val
        else manuais.saidas += val
    })

    const saldoGaveta = 
        Number(caixa.saldo_inicial) + 
        vendas.total_dinheiro + 
        manuais.entradas - 
        manuais.saidas

    const saldoGeral = 
        saldoGaveta + 
        vendas.total_pix + 
        vendas.total_cartao + 
        vendas.total_outros

    return {
        caixa,
        movimentacoes: listaMov,
        categoriasUsadas: categoriasUnicas.sort(), // Ordena alfabeticamente para o menu
        vendas,
        totais: {
            entradas_manuais: manuais.entradas,
            saidas_manuais: manuais.saidas,
            saldo_esperado_dinheiro: saldoGaveta,
            saldo_geral_acumulado: saldoGeral
        }
    }
}

// ============================================================================
// 4. FECHAR CAIXA
// ============================================================================
export async function fecharCaixa(prevState: any, formData: FormData) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    const caixaId = formData.get('caixa_id')
    const saldoFinalInformado = formData.get('saldo_final')
    const saldoEsperado = formData.get('saldo_esperado')

    const diferenca = Number(saldoFinalInformado) - Number(saldoEsperado)

    const supabaseAdmin = createAdminClient()

    try {
 await (
  supabaseAdmin
    .from('caixa_diario') as any
)
.update({
    saldo_final: Number(saldoFinalInformado),
    quebra_caixa: diferenca,
    data_fechamento: new Date().toISOString(),
    fechado_por_id: user?.id,
    status: 'Fechado'
})
.eq('id', caixaId)

        return { success: true, message: 'Caixa fechado com sucesso.' }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// ============================================================================
// 5. CHECAGEM RÁPIDA DE STATUS (PARA O GUARD)
// ============================================================================
export async function verificarStatusCaixa(storeId: number): Promise<boolean> {
    const supabaseAdmin = createAdminClient()
    
    const hojeInicio = new Date()
    hojeInicio.setHours(0,0,0,0)

    try {
        // Verifica se existe algum registro com status 'Aberto' criado hoje
        const { data } = await (supabaseAdmin.from('caixa_diario') as any)
            .select('id')
            .eq('store_id', storeId)
            .eq('status', 'Aberto')
            .gte('created_at', hojeInicio.toISOString())
            .maybeSingle()

        return !!data // Retorna true se achou, false se não achou
    } catch (e) {
        console.error("Erro ao verificar status do caixa:", e)
        return false // Na dúvida, assume fechado para evitar erros, ou true para não bloquear. 
                     // Aqui retornamos false para forçar a verificação visual se der erro.
    }
}