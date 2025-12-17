'use server'

import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { useCredit } from './wallet.actions'
import { calcularERegistrarComissao, cancelarComissao } from './commission.actions'

// ================================================================
// --- TIPOS GLOBAIS ---
// ================================================================

type Customer = Database['public']['Tables']['customers']['Row']
type Dependente = Database['public']['Tables']['dependentes']['Row']
type Venda = Database['public']['Tables']['vendas']['Row']
type VendaItem = Database['public']['Tables']['venda_itens']['Row']
type ServiceOrder = Database['public']['Tables']['service_orders']['Row']
type Oftalmologista = Database['public']['Tables']['oftalmologistas']['Row']
type Product = Database['public']['Tables']['products']['Row']
type Pagamento = Database['public']['Tables']['pagamentos']['Row']
type Financiamento = Database['public']['Tables']['financiamento_loja']['Row']
type FinanciamentoParcela = Database['public']['Tables']['financiamento_parcelas']['Row']
type Employee = Database['public']['Tables']['employees']['Row']

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
  serviceOrders: ServiceOrder[]
  pagamentos: Pagamento[]
  financiamento: (Financiamento & { financiamento_parcelas: FinanciamentoParcela[] }) | null
  // CORREÇÃO: Agora são listas de Product
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
// 1. ACTION: BUSCAR DADOS DA PÁGINA DE OS
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
    ])

    if (customerRes.error) throw new Error(`Cliente: ${customerRes.error.message}`)
    
    const data: OSPageData = {
      customer: customerRes.data,
      venda: vendaRes.data,
      dependentes: dependentesRes.data || [],
      oftalmologistas: oftalmosRes.data || [],
      employees: employeesRes.data || [],
      vendaItens: itensRes.data || [],
      existingOrders: osRes.data || [],
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
  // Lab
  lab_nome: z.string().nullable(),
  lab_pedido_por_id: z.coerce.number().optional().nullable(),
  dt_pedido_em: z.string().nullable(),
  dt_lente_chegou: z.string().nullable(),
  dt_montado_em: z.string().nullable(),
  dt_entregue_em: z.string().nullable(),
  dt_prometido_para: z.string().nullable(),
  obs_os: z.string().nullable(),
  protocolo_fisico: z.string().optional().nullable(),
})

const ItemLinkSchema = z.object({
  item_id: z.coerce.number(),
  uso: z.enum(['lente_od', 'lente_oe', 'armacao']),
})

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
    
    // ✅ CORREÇÃO 1: Pegamos o store_id do FORMULÁRIO (Contexto Real), não do Perfil
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
    lab_nome: nullIfEmpty(formData.get('lab_nome')),
    lab_pedido_por_id: nullIfEmpty(formData.get('lab_pedido_por_id')),
    dt_pedido_em: parseDate(formData.get('dt_pedido_em')),
    dt_lente_chegou: parseDate(formData.get('dt_lente_chegou')),
    dt_montado_em: parseDate(formData.get('dt_montado_em')),
    dt_entregue_em: parseDate(formData.get('dt_entregue_em')),
    dt_prometido_para: parseDate(formData.get('dt_prometido_para')),
    obs_os: nullIfEmpty(formData.get('obs_os')),
    protocolo_fisico: nullIfEmpty(formData.get('protocolo_fisico')),
  })

  if (!validated.success) {
    return { success: false, message: 'Erro de validação.', errors: validated.error.flatten().fieldErrors, timestamp: Date.now() }
  }

  const { id, ...osData } = validated.data

  let itemLinks: z.infer<typeof ItemLinkSchema>[] = []
  try {
    const json = formData.get('item_links_json') as string
    if (json) itemLinks = JSON.parse(json)
  } catch (e) {
    return { success: false, message: 'Erro nos vínculos de itens.', timestamp: Date.now() }
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

    // Limpa vínculos antigos
    await supabaseAdmin.from('venda_itens_os_links').delete().eq('service_order_id', savedId)

    // Insere novos vínculos
    if (itemLinks.length > 0) {
      const linksToInsert = itemLinks.map((link) => ({
        tenant_id: tenant_id, 
        store_id: osData.store_id, // ✅ CORREÇÃO 2: Usa o store_id validado (correto), não o do profile
        service_order_id: savedId, 
        venda_item_id: link.item_id, 
        uso_na_os: link.uso
      }))
      
      const { error: linkError } = await (supabaseAdmin.from('venda_itens_os_links') as any).insert(linksToInsert as any)
      if (linkError) {
          console.error("Erro ao salvar links:", linkError)
      }
    }

    revalidatePath(`/dashboard/loja/${osData.store_id}/vendas/${osData.venda_id}/os`)
    revalidatePath(`/dashboard/loja/${osData.store_id}/vendas/${osData.venda_id}`) 
    
    const { data: finalOS } = await supabaseAdmin
      .from('service_orders')
      .select('*, links:venda_itens_os_links(venda_item_id, uso_na_os)')
      .eq('id', savedId)
      .single()

    return { success: true, message: 'OS salva com sucesso!', data: finalOS as any, timestamp: Date.now() }
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
    const { error } = await supabaseAdmin.from('service_orders').delete().eq('id', id)
    if (error) throw error
    
    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}/os`)
    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`)

    return { success: true, message: 'OS excluída.', timestamp: Date.now() }
  } catch (e: any) {
    return { success: false, message: e.message, timestamp: Date.now() }
  }
}

// ================================================================
// 4. ACTIONS: BUSCAR CLIENTES (BLOCO COMPLETO)
// ================================================================

export type CustomerSearchResult = Pick<Customer, 'id' | 'full_name' | 'cpf' | 'fone_movel' | 'obs_debito'>

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
  return { success: true, data: data as any } 
}

// 2. Busca por Nome ou CPF (A que corrigimos antes)
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
    .limit(20)

  if (error) {
    return { success: false, message: error.message }
  }
  return { success: true, data }
}

// 3. Busca por ID (Detalhes)
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
// 5. ACTION: CRIAR NOVA VENDA (LIMPA E CORRIGIDA)
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
    const { data, error } = await (supabaseAdmin.from('vendas') as any)
        .insert(vendaData)
        .select()
        .single()
    
    if (error) throw error
    return { success: true, message: 'Venda iniciada.', data }
  } 
  catch (error: any) {
    return { success: false, message: `Erro ao criar venda: ${error.message}` }
  }
}

// ================================================================
// 6. ACTION: BUSCAR DADOS DA PÁGINA DE VENDA (ATUALIZADO PARA UNIFICAÇÃO)
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
      // BUSCA AGORA NA TABELA PRODUCTS COM FILTRO
      lentesRes,
      armacoesRes,
      tratamentosRes,
    ] = await Promise.all([
      supabaseAdmin.from('customers').select('*').eq('id', customer_id).single(),
      employee_id ? supabaseAdmin.from('employees').select('*').eq('id', employee_id).single() : Promise.resolve({ data: null }),
      supabaseAdmin.from('venda_itens').select('*').eq('venda_id', vendaId).order('id'),
      supabaseAdmin.from('service_orders').select('*').eq('venda_id', vendaId),
      supabaseAdmin.from('pagamentos').select('*').eq('venda_id', vendaId).order('data_pagamento'),
      supabaseAdmin.from('financiamento_loja').select('*, financiamento_parcelas(*)').eq('venda_id', vendaId).maybeSingle(),
      
      // Consultas unificadas
      supabaseAdmin.from('products').select('*').eq('store_id', storeId).eq('tipo_produto', 'Lente'),
      supabaseAdmin.from('products').select('*').eq('store_id', storeId).eq('tipo_produto', 'Armacao'),
      supabaseAdmin.from('products').select('*').eq('store_id', storeId).eq('tipo_produto', 'Tratamento'),
    ])
    
    const data: VendaPageData = {
      venda,
      customer: customerRes.data,
      employee: employeeRes.data,
      vendaItens: itensRes.data || [],
      serviceOrders: osRes.data || [],
      pagamentos: pagamentosRes.data || [],
      financiamento: financiamentoRes.data as any, 
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
// 7. ACTION: ADICIONAR ITEM À VENDA (CORRIGIDO COM 'AS ANY')
// ================================================================
const VendaItemSchema = z.object({
  venda_id: z.coerce.number(),
  item_tipo: z.enum(['Lente', 'Armacao', 'Tratamento', 'Servico', 'Outro']),
  descricao: z.string().min(1, { message: 'Descrição é obrigatória.' }),
  lente_id: z.coerce.number().optional().nullable(),
  armacao_id: z.coerce.number().optional().nullable(),
  tratamento_id: z.coerce.number().optional().nullable(),
  quantidade: z.coerce.number().min(1),
  valor_unitario: z.coerce.number(),
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
  })

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Erro de validação.',
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }

  const data = validatedFields.data
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
    tenant_id: (profile as any).tenant_id, // Forçamos aqui
    store_id: (profile as any).store_id,   // CORREÇÃO: Forçamos aqui também
  }

const supabaseAdmin = createAdminClient();

  try {
    // CORREÇÃO 1: Usamos (as any) na chamada da tabela
    const { data: newItem, error: itemError } = await (supabaseAdmin.from('venda_itens') as any)
      .insert(itemToInsert)
      .select()
      .single()

    if (itemError) throw itemError
    if (!newItem) throw new Error('Falha ao inserir item.')

    // CORREÇÃO 2: Cast no supabaseAdmin para o RPC funcionar sem reclamar
    const { error: rpcError } = await (supabaseAdmin as any).rpc('update_venda_financeiro', {
      p_venda_id: data.venda_id,
    })
    
    if (rpcError) throw new Error(`Erro ao recalcular total: ${rpcError.message}`)

    // CORREÇÃO 3: Cast no profile para o revalidatePath
    revalidatePath(`/dashboard/loja/${(profile as any).store_id}/vendas`)
    revalidatePath(`/dashboard/loja/${(profile as any).store_id}/vendas/${data.venda_id}`)
    
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

    // CORREÇÃO: Usamos (as any) para o RPC funcionar sem erro de tipagem
    const { error: rpcError } = await (supabaseAdmin as any).rpc('update_venda_financeiro', {
      p_venda_id: vendaId,
    })
    
    if (rpcError) throw new Error(`Erro ao recalcular total: ${rpcError.message}`)
    
    revalidatePath(`/dashboard/loja/${storeId}/vendas`)
    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`)
    
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

  // --- LÓGICA DE CRÉDITO (Carteira do Cliente) ---
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

  const pagToInsert = {
    ...pagamentoData,
    venda_id,
    tenant_id,
    store_id,
    created_by_user_id: user.id,
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
        
        // --- CÁLCULO DE CENTAVOS (CORREÇÃO) ---
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

    revalidatePath(`/dashboard/loja/${store_id}/vendas`)
    revalidatePath(`/dashboard/loja/${store_id}/vendas/${venda_id}`)
    
    return { success: true, message: 'Pagamento registrado!', data: newPagamento as any, timestamp: Date.now() }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// ================================================================
// 10. ACTION: DELETAR PAGAMENTO (CORRIGIDA: LIMPA RECEBÍVEIS)
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
  // CORREÇÃO: Usamos AdminClient para evitar Loop de RLS
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

    revalidatePath(`/dashboard/loja/${storeId}/vendas`)
    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`)
    
    return { success: true, message: 'Pagamento removido.' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// ================================================================
// 11. ACTION: ATUALIZAR STATUS DA VENDA (COM TIMESTAMP E AUDITORIA)
// ================================================================
export type CreateVendaResult = {
  success: boolean
  message?: string
  data?: Venda 
  timestamp?: number
}

export async function updateVendaStatus(
  vendaId: number,
  storeId: number,
  newStatus: 'Fechada' | 'Cancelada' | 'Em Aberto',
  acting_employee_id?: number // NOVO: Quem realizou a ação
): Promise<CreateVendaResult> { 
  
  const supabaseAdmin = createAdminClient()

  try {
    const updatePayload: any = { status: newStatus };

    if (newStatus === 'Em Aberto') {
      // REABERTURA: 
      // 1. Remove o vínculo com financiamento (se houver, para permitir recriar)
      updatePayload.financiamento_id = null;
      
      // 2. IMPORTANTE: Estorna a comissão gerada anteriormente para evitar duplicidade
      await cancelarComissao(vendaId)
    }

    const { data, error } = await (supabaseAdmin.from('vendas') as any)
      .update(updatePayload) 
      .eq('id', vendaId)
      .select()
      .single()

    if (error) throw error

    // --- GATILHO DE FECHAMENTO ---
    if (newStatus === 'Fechada') {
       // Calcula comissão nova
       await calcularERegistrarComissao(vendaId)
       
       // Opcional: Aqui poderíamos salvar um log de "Quem fechou" se houvesse tabela de logs
       // Por enquanto, confiamos no PIN validado no frontend para a sessão
    } else if (newStatus === 'Cancelada') {
        await cancelarComissao(vendaId)
    }
    // ---------------------------

    revalidatePath(`/dashboard/loja/${storeId}/vendas`)
    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`)
    
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

export async function updateVendaDesconto(
  prevState: UpdateDescontoResult,
  formData: FormData
): Promise<UpdateDescontoResult> {
  const supabase = createClient()

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
    const { error: updateError } = await supabase
      .from('vendas')
      .update({ valor_desconto: valor_desconto })
      .eq('id', venda_id)

    if (updateError) throw updateError

    const { error: rpcError } = await supabase.rpc('update_venda_financeiro', {
      p_venda_id: venda_id,
    })

    if (rpcError)
      throw new Error(`Erro ao recalcular totais: ${rpcError.message}`)

    revalidatePath(`/dashboard/loja/${store_id}/vendas`)
    revalidatePath(`/dashboard/loja/${store_id}/vendas/${venda_id}`)
    
    return { success: true, message: 'Desconto aplicado!' }
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

  if (erroVenda || !vendaReal) return { success: false, message: 'Venda não encontrada.' };

  // --- TRAVA DE SEGURANÇA ---
  // Se não for Admin, só pode mexer se a loja do usuário for igual à da venda
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
  const valorParcela = Number((Number(valor_total) / Number(qtd_parcelas)).toFixed(2));
  const diferenca = Number((Number(valor_total) - (valorParcela * Number(qtd_parcelas))).toFixed(2));
  
  const parcelas = [];
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
      status: novoStatus
    })
    .eq('id', venda_id);

  if (erroUpdate) return { success: false, message: `Erro ao atualizar venda: ${erroUpdate.message}` };

  revalidatePath(`/vendas/${venda_id}`);
  return { success: true, message: 'Carnê gerado com sucesso!' };
}

// ================================================================
// 14. ACTION: LISTAR VENDAS (COM FILTROS: PENDÊNCIAS OU PERÍODO)
// ================================================================
export type SalesFilterOptions = {
    mode?: 'pendencias' | 'historico'
    startDate?: string
    endDate?: string
}

export async function getSalesList(storeId: number, options?: SalesFilterOptions) {
  const supabaseAdmin = createAdminClient()
  
  const mode = options?.mode || 'pendencias'

  try {
    let query = supabaseAdmin
      .from('vendas')
      .select(`
        *,
        customers ( full_name )
      `)
      .eq('store_id', storeId)

    if (mode === 'pendencias') {
        // MODO PENDÊNCIAS: Traz tudo que está aberto, ignorando data (Prioridade Total)
        query = query.eq('status', 'Em Aberto')
                     .order('created_at', { ascending: true }) // Mais antigas primeiro (para resolver logo)
    } else {
        // MODO HISTÓRICO: Traz tudo (Aberto, Fechada, Cancelada) dentro do prazo
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
  tipo: 'Lente' | 'Armacao' | 'Tratamento' | 'Servico' | 'Outro'
  descricao: string
  detalhes: string
  preco_venda: number
  estoque?: number
}

export type SearchProductResult = {
  success: boolean
  message?: string
  data?: ProductSearchResult[]
}

// ATUALIZAÇÃO: Adicionado 'Todos' na assinatura para permitir busca global
export async function searchProductCatalog(
  query: string,
  storeId: number,
  type: 'Lente' | 'Armacao' | 'Tratamento' | 'Servico' | 'Outro' | 'Todos'
): Promise<SearchProductResult> {
  
  const supabaseAdmin = createAdminClient()
  let results: ProductSearchResult[] = []
  
  try {
      let q = supabaseAdmin
        .from('products')
        .select('*')
        .eq('store_id', storeId)

      // ATUALIZAÇÃO: Se for 'Todos', não filtra por tipo no banco
      if (type !== 'Todos') {
          let dbType = type
          if (type === 'Armacao') dbType = 'Armacao'
          if (type === 'Lente') dbType = 'Lente'
          if (type === 'Tratamento') dbType = 'Tratamento'
          if (type === 'Servico') dbType = 'Servico'
          if (type === 'Outro') dbType = 'Outro'
          
          q = q.eq('tipo_produto', dbType)
      }

      // Aplica a busca por texto
      q = q.or(`nome.ilike.%${query}%,codigo_barras.eq.${query},referencia.ilike.%${query}%`)
      q = q.limit(20)

      const { data } = await q

      if (data) {
          results = data.map((p: any) => {
              const d = p.detalhes || {}
              let detalhesStr = ''
              
              // ATUALIZAÇÃO: Mapeia o tipo do banco de volta para o tipo do Front
              let tipoFront: ProductSearchResult['tipo'] = 'Outro'
              if (p.tipo_produto === 'Lente') tipoFront = 'Lente'
              else if (p.tipo_produto === 'Armacao') tipoFront = 'Armacao'
              else if (p.tipo_produto === 'Tratamento') tipoFront = 'Tratamento'
              else if (p.tipo_produto === 'Servico') tipoFront = 'Servico'
              
              if (tipoFront === 'Lente') detalhesStr = `${p.marca || ''} ${d.material || ''}`
              if (tipoFront === 'Armacao') detalhesStr = `Ref: ${p.referencia || '-'} | Cor: ${d.cor || '-'}`
              if (tipoFront === 'Tratamento') detalhesStr = d.descricao || ''

              return {
                  id: p.id,
                  tipo: tipoFront, 
                  descricao: p.nome,
                  detalhes: detalhesStr,
                  preco_venda: p.preco_venda,
                  estoque: p.estoque_atual
              }
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
}

export async function buscarProdutoExpress(query: string, storeId: number) {
    const supabaseAdmin = createAdminClient()
    const termo = query.trim()
    const resultados: ProdutoExpressResult[] = []

    try {
        const { data } = await supabaseAdmin
            .from('products')
            .select('*')
            .eq('store_id', storeId)
            .in('tipo_produto', ['Armacao', 'Outro']) 
            .or(`codigo_barras.eq.${termo},nome.ilike.%${termo}%`)
            .limit(10)

        // CORREÇÃO: Adicionado (p: any) para o TypeScript aceitar as propriedades
        data?.forEach((p: any) => {
            resultados.push({
                id: p.id,
                // Mapeia para compatibilidade com o front antigo
                tipo_origem: p.tipo_produto === 'Armacao' ? 'armacoes' : 'produtos_gerais',
                descricao: p.nome,
                preco: p.preco_venda,
                estoque: p.estoque_atual,
                codigo_barras: p.codigo_barras
            })
        })

        return resultados

    } catch (e) {
        console.error("Erro busca express:", e)
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
    // CORREÇÃO: Adicionado (as any) para destravar o update
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
// 18. ACTION: RECEBER PARCELA (COM LÓGICA DE JUROS HÍBRIDA)
// ================================================================
const ReceberParcelaSchema = z.object({
  parcela_id: z.coerce.number(),
  venda_id: z.coerce.number(),
  store_id: z.coerce.number(),
  employee_id: z.coerce.number(), 
  valor_original: z.coerce.number(),
  valor_pago_total: z.coerce.number().min(0.01), // Quanto dinheiro entrou
  valor_juros: z.coerce.number().default(0),     // Quanto disso é juros
  forma_pagamento: z.string().min(1),
  data_pagamento: z.string(),
  estrategia: z.enum(['quitacao_total', 'criar_pendencia', 'somar_proxima']).default('quitacao_total'),
})

export async function receberParcela(prevState: any, formData: FormData) {
  const supabaseAdmin = createAdminClient()
  const { data: { user } } = await createClient().auth.getUser()
  
  if (!user) return { success: false, message: 'Usuário não autenticado.' }
  
  const profile = await getProfileByAdmin(user.id)
  if (!profile) return { success: false, message: 'Perfil não encontrado.' }

  const valorRaw = formData.get('valor_pago_total') as string
  const valorPagoTotal = valorRaw ? parseFloat(valorRaw.replace(/\./g, '').replace(',', '.')) : 0

  const jurosRaw = formData.get('valor_juros') as string
  const valorJuros = jurosRaw ? parseFloat(jurosRaw.replace(/\./g, '').replace(',', '.')) : 0

  const inputData = {
      parcela_id: formData.get('parcela_id'),
      venda_id: formData.get('venda_id'),
      store_id: formData.get('store_id'),
      employee_id: formData.get('employee_id'),
      valor_original: formData.get('valor_original'),
      valor_pago_total: valorPagoTotal,
      valor_juros: valorJuros,
      forma_pagamento: formData.get('forma_pagamento'),
      data_pagamento: formData.get('data_pagamento'),
      estrategia: formData.get('estrategia')
  }

  const validated = ReceberParcelaSchema.safeParse(inputData)
  if (!validated.success) return { success: false, message: 'Dados inválidos.' }

  const { parcela_id, venda_id, store_id, valor_original, valor_pago_total, valor_juros, forma_pagamento, estrategia, data_pagamento } = validated.data
  
  // O PULO DO GATO MATEMÁTICO:
  // O quanto da dívida estamos matando? = (Dinheiro Total - Juros)
  const principalAbatido = valor_pago_total - valor_juros
  
  // A diferença real na dívida
  const diferencaDivida = valor_original - principalAbatido

  try {
      // 1. Busca dados da parcela atual
      const { data: parcelaRaw } = await supabaseAdmin
          .from('financiamento_parcelas')
          .select('*')
          .eq('id', parcela_id)
          .single()
      
      if (!parcelaRaw) throw new Error('Parcela não encontrada.')
      const parcelaAtual = parcelaRaw as any;

      // 2. Registra o Pagamento (Valor CHEIO que entrou no caixa)
      await (supabaseAdmin.from('pagamentos') as any).insert({
          tenant_id: (profile as any).tenant_id,
          store_id: store_id,
          venda_id: venda_id,
          created_by_user_id: user.id,
          valor_pago: valor_pago_total, // Entra R$ 60,00 no caixa
          forma_pagamento: forma_pagamento,
          data_pagamento: data_pagamento,
          parcelas: 1, 
          obs: `Ref. Parcela ${parcelaAtual.numero_parcela} (Principal: ${principalAbatido.toFixed(2)} + Juros: ${valor_juros.toFixed(2)})`
      })

      // 3. Baixa a parcela atual
      // IMPORTANTE: Atualizamos o valor_parcela para o que foi efetivamente abatido (R$ 50,00) para fins de histórico
      await (supabaseAdmin.from('financiamento_parcelas') as any).update({
          status: 'Pago',
          data_pagamento: new Date().toISOString(),
          valor_parcela: principalAbatido 
      }).eq('id', parcela_id)

      // 4. Lógica de Diferença da Dívida
      if (diferencaDivida > 0.01) {
          // --- FALTOU DINHEIRO (Cenário do Exemplo: Faltam R$ 50) ---
          
          if (estrategia === 'criar_pendencia') {
              await (supabaseAdmin.from('financiamento_parcelas') as any).insert({
                  tenant_id: (profile as any).tenant_id,
                  store_id: store_id,
                  financiamento_id: parcelaAtual.financiamento_id,
                  customer_id: parcelaAtual.customer_id,
                  numero_parcela: parcelaAtual.numero_parcela, // Mantém número para indicar que é 'filha'
                  data_vencimento: parcelaAtual.data_vencimento, // Vence hoje ou mantem original
                  valor_parcela: diferencaDivida,
                  status: 'Pendente'
              })
          } else if (estrategia === 'somar_proxima') {
              const { data: proxParcela } = await supabaseAdmin
                  .from('financiamento_parcelas')
                  .select('*')
                  .eq('financiamento_id', parcelaAtual.financiamento_id)
                  .gt('numero_parcela', parcelaAtual.numero_parcela)
                  .eq('status', 'Pendente')
                  .order('numero_parcela', { ascending: true })
                  .limit(1)
                  .maybeSingle()

              if (proxParcela) {
                  const prox = proxParcela as any;
                  await (supabaseAdmin.from('financiamento_parcelas') as any)
                      .update({ valor_parcela: prox.valor_parcela + diferencaDivida })
                      .eq('id', prox.id)
              } else {
                  // Se não tem próxima, cria nova para 30 dias
                  const novaData = new Date(parcelaAtual.data_vencimento)
                  novaData.setDate(novaData.getDate() + 30)
                  await (supabaseAdmin.from('financiamento_parcelas') as any).insert({
                      tenant_id: (profile as any).tenant_id,
                      store_id: store_id,
                      financiamento_id: parcelaAtual.financiamento_id,
                      customer_id: parcelaAtual.customer_id,
                      numero_parcela: parcelaAtual.numero_parcela + 1,
                      data_vencimento: novaData.toISOString(),
                      valor_parcela: diferencaDivida,
                      status: 'Pendente'
                  })
              }
          }
      } else if (diferencaDivida < -0.01) {
          // --- PAGOU A MAIS (AMORTIZAÇÃO) ---
          const excedente = Math.abs(diferencaDivida)

          const { data: proxParcela } = await supabaseAdmin
                  .from('financiamento_parcelas')
                  .select('*')
                  .eq('financiamento_id', parcelaAtual.financiamento_id)
                  .gt('numero_parcela', parcelaAtual.numero_parcela)
                  .eq('status', 'Pendente')
                  .order('numero_parcela', { ascending: true })
                  .limit(1)
                  .maybeSingle()
            
          if (proxParcela) {
              const prox = proxParcela as any;
              await (supabaseAdmin.from('financiamento_parcelas') as any)
                  .update({ valor_parcela: prox.valor_parcela - excedente })
                  .eq('id', prox.id)
          }
      }

      await (supabaseAdmin as any).rpc('update_venda_financeiro', { p_venda_id: venda_id })
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

  // --- TRAVA DE SEGURANÇA ---
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
// 20. ACTION: SALVAR OBSERVAÇÃO (CPF NA NOTA)
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
// 21. ACTION: FINALIZAR VENDA EXPRESS (ATÔMICA) - CORRIGIDO FINAL
// ================================================================
export async function finalizarVendaExpress(formData: FormData) {
    const supabaseAdmin = createAdminClient()
    
    const { data: { user } } = await createClient().auth.getUser()
    
    if (!user) return { success: false, message: 'Sem permissão.' }
    const profile = await getProfileByAdmin(user.id)
    
    const rawItens = JSON.parse(formData.get('itens') as string)
    const rawPagamento = JSON.parse(formData.get('pagamento') as string)
    
    // CORREÇÃO 1: Conversão explícita para Number
    const storeId = parseInt(formData.get('store_id') as string)
    const employeeId = parseInt(formData.get('employee_id') as string)

    const data = {
        store_id: storeId,
        employee_id: employeeId,
        itens: formData.get('itens'),
        pagamento: rawPagamento,
        cpf_nota: formData.get('cpf_nota')
    }

    // 1. Busca Consumidor Final (ou cria)
   let customerId: number
    
    // CORREÇÃO: Usamos .select().limit(1) em vez de .maybeSingle().
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

    // 3. INSERÇÃO (Venda)
    const { data: novaVenda, error: errVenda } = await (supabaseAdmin.from('vendas') as any).insert({
        store_id: storeId,
        tenant_id: (profile as any).tenant_id,
        customer_id: customerId,
        employee_id: employeeId,
        created_by_user_id: user.id,
        status: 'Fechada',
        valor_total: totalVenda,
        valor_final: totalVenda,
        valor_restante: 0
    }).select().single()

    if (errVenda) return { success: false, message: 'Erro ao criar venda.' }

    // 4. INSERÇÃO (Itens)
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

    // 5. INSERÇÃO (Pagamento)
    await (supabaseAdmin.from('pagamentos') as any).insert({
        tenant_id: (profile as any).tenant_id,
        store_id: storeId,
        venda_id: novaVenda.id,
        created_by_user_id: user.id,
        valor_pago: data.pagamento.valor,
        forma_pagamento: data.pagamento.forma,
        parcelas: data.pagamento.parcelas,
        data_pagamento: data.pagamento.data,
        obs: data.cpf_nota ? `CPF Nota: ${data.cpf_nota}` : null
    })

await calcularERegistrarComissao(novaVenda.id)

    revalidatePath(`/dashboard/loja/${storeId}/vendas`)
    return { success: true, message: 'Venda finalizada!', vendaId: novaVenda.id }
}

// ================================================================
// 22. ACTION: CRIAR PARCIAL PARA CARNÊ (CORRIGIDO FINAL)
// ================================================================
export async function criarVendaParcialCarnê(formData: FormData) {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    const profile = await getProfileByAdmin(user!.id)

    // CORREÇÃO 1: Conversão explícita para Number
    const storeId = parseInt(formData.get('store_id') as string)
    const customerId = parseInt(formData.get('customer_id') as string)
    const employeeId = parseInt(formData.get('employee_id') as string)
    
    const rawItens = JSON.parse(formData.get('itens') as string)
    const totalVenda = rawItens.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0)

    // CORREÇÃO 2: Cast no insert da venda
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
    
    // CORREÇÃO 3: Cast no insert dos itens
    await (supabaseAdmin.from('venda_itens') as any).insert(itensToInsert)

    return { success: true, vendaId: novaVenda.id }
}

// ================================================================
// 23. ACTION: AUTENTICAR FUNCIONÁRIO POR PIN (FALTAVA ISSO)
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
// 24. ACTION: BUSCAR HISTÓRICO DE VENDAS (DOSSIÊ DO CLIENTE) - V3 (FINAL)
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
            const atrasadas = parcelas.filter((p: any) => p.status === 'Pendente' && new Date(p.data_vencimento) < new Date(new Date().setHours(0,0,0,0))).length
            
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
// 25. ACTION: BUSCAR HISTÓRICO DE RECEITAS (MODAL DE IMPORTAÇÃO)
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
// 26. ACTION: BUSCAR PENDÊNCIAS (VERSÃO CORRIGIDA E LIMPA)
// ================================================================
export async function searchPendenciasCliente(storeId: number, termo: string) {
    const supabaseAdmin = createAdminClient()
    const cleanTerm = termo.trim()

    console.log(`🔍 [DEBUG] Iniciando busca para: "${cleanTerm}" na Loja: ${storeId}`)

    try {
        // PASSO 1: Busca Clientes
        const { data: clientes, error: errCli } = await supabaseAdmin
            .from('customers')
            .select('id, full_name, cpf')
            .eq('store_id', storeId)
            .or(`full_name.ilike.%${cleanTerm}%,cpf.ilike.%${cleanTerm}%`)
            .limit(50)
        
        if (errCli) {
            console.error("❌ [DEBUG] Erro ao buscar clientes:", errCli.message)
            return []
        }

        console.log(`👤 [DEBUG] Clientes encontrados:`, clientes?.length || 0)
        
        if (!clientes || clientes.length === 0) return []

        const idsClientes = clientes.map((c: any) => c.id)

        // PASSO 2: Busca Parcelas
        const { data: parcelas, error: errParc } = await (supabaseAdmin
            .from('financiamento_parcelas') as any)
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
                )
            `)
            .in('customer_id', idsClientes)
            .eq('store_id', storeId)
            .order('data_vencimento', { ascending: true })

        if (errParc) {
            console.error("❌ [DEBUG] Erro ao buscar parcelas:", errParc.message)
            return []
        }

        const parcelasPendentes = parcelas?.filter((p: any) => p.status === 'Pendente') || []
        console.log(`📦 [DEBUG] Parcelas pendentes encontradas:`, parcelasPendentes.length)

        // PASSO 3: Agrupamento
        const resultado = clientes.map((cli: any) => {
            const parcs = parcelasPendentes.filter((p: any) => p.customer_id === cli.id)

            if (parcs.length === 0) return null

            const parcsFormatadas = parcs.map((p: any) => {
                const venda = p.financiamento_loja?.vendas
                const os = venda?.service_orders?.[0]
                
                const nomeDependente = os?.dependentes?.full_name
                const nomeTitular = cli.full_name
                
                const beneficiario = (nomeDependente && nomeDependente !== nomeTitular) 
                    ? nomeDependente 
                    : null

                return {
                    id: p.id,
                    numero_parcela: p.numero_parcela,
                    valor_parcela: p.valor_parcela,
                    data_vencimento: p.data_vencimento,
                    venda_id: p.financiamento_loja?.venda_id,
                    data_venda: venda?.created_at,
                    beneficiario: beneficiario
                }
            })

            return {
                cliente: cli,
                parcelas: parcsFormatadas
            }
        }).filter(Boolean)

        console.log(`🚀 [DEBUG] Sucesso! Retornando ${resultado.length} grupos.`)
        return resultado

    } catch (e) {
        console.error("🔥 [DEBUG] Exceção crítica:", e)
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
// 28. ACTION: BUSCAR ITENS COMPRADOS (PARA ASSISTÊNCIA)
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

