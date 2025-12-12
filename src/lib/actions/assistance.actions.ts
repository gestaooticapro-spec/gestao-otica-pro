'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { registrarMovimentacao } from './stock.actions'

// --- SCHEMAS ---
const AssistanceSchema = z.object({
    store_id: z.coerce.number(),
    customer_id: z.coerce.number(),
    updated_phone: z.string().optional(),
    
    product_id: z.coerce.number().optional().nullable(),
    product_descricao: z.string().min(2, "Descrição do produto obrigatória"),
    venda_original_id: z.coerce.number().optional().nullable(),
    
    descricao_defeito: z.string().min(3, "Descreva o defeito"),
    fotos_urls: z.array(z.string()).optional(),
    
    modalidade: z.enum(['Padrao', 'TrocaGarantida', 'TrocaImediata']),
})

const TimelineSchema = z.object({
    ticket_id: z.coerce.number(),
    tipo: z.string(),
    mensagem: z.string().min(2),
})

export type CreateTicketResult = {
    success: boolean
    message: string
    ticket?: any // Retorna o objeto completo para o frontend
}

// 1. CRIAR TICKET (ATUALIZADA)
export async function createAssistanceTicket(formData: FormData): Promise<CreateTicketResult> {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    
    if (!user) return { success: false, message: 'Usuário não autenticado.' }
    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil inválido.' }

    const rawData = {
        store_id: formData.get('store_id'),
        customer_id: formData.get('customer_id'),
        updated_phone: formData.get('updated_phone'),
        product_id: formData.get('product_id'),
        product_descricao: formData.get('product_descricao'),
        venda_original_id: formData.get('venda_original_id'),
        descricao_defeito: formData.get('descricao_defeito'),
        modalidade: formData.get('modalidade'),
        fotos_urls: JSON.parse(formData.get('fotos_urls') as string || '[]')
    }

    const val = AssistanceSchema.safeParse(rawData)
    if (!val.success) return { success: false, message: 'Dados inválidos.' }

    const { 
        store_id, customer_id, updated_phone, product_id, product_descricao, 
        venda_original_id, descricao_defeito, modalidade, fotos_urls 
    } = val.data

    try {
        // Atualizar telefone
        if (updated_phone) {
            await (supabaseAdmin.from('customers') as any)
                .update({ fone_movel: updated_phone })
                .eq('id', customer_id)
        }

        // Criar Ticket
        const { data: ticket, error } = await (supabaseAdmin.from('assistance_tickets') as any)
            .insert({
                tenant_id: profile.tenant_id,
                store_id,
                customer_id,
                venda_original_id: venda_original_id || null,
                product_id: product_id || null,
                product_descricao,
                modalidade,
                descricao_defeito,
                fotos_urls,
                contato_usado: updated_phone,
                status: 'Triagem',
                status_publico: 'Solicitação Recebida',
                created_by_user_id: user.id
            })
            .select()
            .single()

        if (error) throw error

        await registrarTimeline(ticket.id, 'Sistema', 'Solicitação aberta.', user.id, profile.tenant_id)

        // Efeitos colaterais (Troca Imediata)
        if (modalidade === 'TrocaImediata' && product_id) {
            const fdSaida = new FormData()
            fdSaida.append('store_id', store_id.toString())
            fdSaida.append('employee_id', (profile.id || 0).toString())
            fdSaida.append('product_id', product_id.toString())
            fdSaida.append('tipo', 'Saida')
            fdSaida.append('quantidade', '1')
            fdSaida.append('motivo', `Troca Imediata Garantia Ticket #${ticket.id}`)
            
            await registrarMovimentacao({ success: false, message: '' }, fdSaida)
            await registrarTimeline(ticket.id, 'Alerta', 'Baixa de estoque realizada (Troca Imediata).', null, profile.tenant_id)
            
            await (supabaseAdmin.from('assistance_tickets') as any)
                .update({ status: 'LogisticaReversa', status_publico: 'Troca Realizada', dt_troca_cliente: new Date().toISOString() })
                .eq('id', ticket.id)
            
            ticket.status = 'LogisticaReversa' // Atualiza local para retorno
        }

        // RETORNAR DADO COMPLETO (JOIN) PARA O FRONT
        const { data: fullTicket } = await (supabaseAdmin.from('assistance_tickets') as any)
            .select('*, customers ( full_name, fone_movel )')
            .eq('id', ticket.id)
            .single()

        revalidatePath(`/dashboard/loja/${store_id}/assistencia`)
        return { success: true, message: 'Assistência aberta!', ticket: fullTicket }

    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// 2. BUSCAR TIMELINE
export async function getAssistanceTimeline(ticketId: number) {
    const supabaseAdmin = createAdminClient()
    try {
        const { data } = await (supabaseAdmin.from('assistance_timeline') as any)
            .select('*')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: false }) // Mais recente primeiro
        return data || []
    } catch { return [] }
}

// 3. SALVAR NOVA INTERAÇÃO (TIMELINE)
export async function saveAssistanceInteraction(formData: FormData) {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    if (!user) return { success: false, message: 'Login necessário' }

    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil erro' }

    const raw = {
        ticket_id: formData.get('ticket_id'),
        tipo: formData.get('tipo'),
        mensagem: formData.get('mensagem')
    }

    const val = TimelineSchema.safeParse(raw)
    if (!val.success) return { success: false, message: 'Dados inválidos' }

    try {
        await (supabaseAdmin.from('assistance_timeline') as any).insert({
            tenant_id: profile.tenant_id,
            ticket_id: val.data.ticket_id,
            tipo: val.data.tipo,
            mensagem: val.data.mensagem,
            usuario_id: user.id
        })

        revalidatePath(`/dashboard/loja/${profile.store_id}/assistencia`)
        return { success: true, message: 'Registrado.' }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// ... (Mantenha updateTicketStatus, getAssistanceTickets, getPublicTicket e registrarTimeline do arquivo anterior)
// Apenas garanta que registrarTimeline esteja exportada ou acessível
async function registrarTimeline(ticketId: number, tipo: string, mensagem: string, userId: string | null, tenantId: string) {
    const supabaseAdmin = createAdminClient()
    await (supabaseAdmin.from('assistance_timeline') as any).insert({
        ticket_id: ticketId,
        tenant_id: tenantId,
        tipo,
        mensagem,
        usuario_id: userId
    })
}

// (Repita as outras funções updateTicketStatus, getAssistanceTickets, etc., para o arquivo ficar completo se você for substituir tudo)
// Vou incluir as funções que já mandei antes para garantir integridade se for copy-paste
export async function updateTicketStatus(ticketId: number, novoStatus: string, storeId: number, obs?: string) {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    const profile = await getProfileByAdmin(user!.id) as any

    const updates: any = { status: novoStatus }
    let statusPublico = 'Em Análise'
    let mensagemLog = `Status alterado para ${novoStatus}`
    const agora = new Date().toISOString()

    switch (novoStatus) {
        case 'EmTratativa': statusPublico = 'Em Tratativa com Fabricante'; updates.dt_solicitacao_peca = agora; break;
        case 'AguardandoChegada': statusPublico = 'Aguardando Peça'; break;
        case 'AguardandoCliente': statusPublico = 'Pronto para Retirada'; updates.dt_chegada_peca = agora; mensagemLog = 'Peça chegou. Prazo de devolução iniciado.'; break;
        case 'LogisticaReversa': statusPublico = 'Em Processo de Devolução'; updates.dt_troca_cliente = agora; break;
        case 'Concluido': statusPublico = 'Finalizado'; updates.dt_conclusao = agora; updates.dt_envio_fornecedor = agora; break;
        case 'Cancelado': statusPublico = 'Cancelado'; break;
    }
    updates.status_publico = statusPublico

    try {
        await (supabaseAdmin.from('assistance_tickets') as any).update(updates).eq('id', ticketId)
        await registrarTimeline(ticketId, 'MudancaStatus', obs || mensagemLog, user!.id, profile.tenant_id)
        revalidatePath(`/dashboard/loja/${storeId}/assistencia`)
        return { success: true, message: 'Status atualizado.' }
    } catch (e: any) { return { success: false, message: e.message } }
}

export async function getAssistanceTickets(storeId: number) {
    const supabaseAdmin = createAdminClient()
    try {
        const { data } = await (supabaseAdmin.from('assistance_tickets') as any)
            .select('*, customers ( full_name, fone_movel )')
            .eq('store_id', storeId)
            .neq('status', 'Cancelado')
            .order('updated_at', { ascending: false })
        return data || []
    } catch { return [] }
}
// ARQUIVO: src/lib/actions/assistance.actions.ts (Trecho Atualizado)

export async function getPublicTicket(token: string) {
    const supabaseAdmin = createAdminClient()
    
    const { data } = await (supabaseAdmin.from('assistance_tickets') as any)
        .select(`
            status,             
            status_publico,
            product_descricao,
            dt_abertura,
            dt_solicitacao_peca,
            dt_chegada_peca,
            dt_troca_cliente,
            dt_envio_fornecedor,
            dt_conclusao,
            // ATUALIZAÇÃO: Buscando colunas extras da loja
            stores ( name, whatsapp, phone ) 
        `)
        .eq('tracking_token', token)
        .single()
        
    return data
}