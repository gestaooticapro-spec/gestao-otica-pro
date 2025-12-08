// ARQUIVO: src/lib/actions/catalog.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { Database, Json } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'

export type CatalogActionResult = {
  success: boolean
  message: string
  errors?: Record<string, string[]>
  generatedCode?: string
}

export type CatalogItemResult = {
  id: number
  title: string
  subtitle?: string
  price?: number
  stock?: number
  raw: any 
}

// --- HELPER DE CONTEXTO ---
async function getContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Usuário não autenticado')
  
  const profile: any = await getProfileByAdmin(user.id)
  
  return { user, profile, supabaseAdmin: createAdminClient() }
}

// --- HELPER: BARCODE INTELIGENTE ---
async function generateSmartBarcode(storeId: number, costPrice: number | null | undefined) {
    const supabaseAdmin = createAdminClient()
    const date = new Date()
    
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const yy = String(date.getFullYear()).slice(-2)
    const custoRaw = costPrice ? (costPrice * 100).toFixed(0) : '00000'
    const prefixo = `${mm}.${custoRaw}.${yy}.`
    
    const { count } = await supabaseAdmin
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .ilike('codigo_barras', `${prefixo}%`)

    const nextSeq = String((count || 0) + 1).padStart(3, '0')
    return `${prefixo}${nextSeq}`
}

// --- SCHEMAS ---
const LenteSchema = z.object({
  id: z.coerce.number().optional(),
  store_id: z.coerce.number(),
  nome_lente: z.string().min(2, 'Nome é obrigatório'),
  marca: z.string().optional().nullable(),
  tipo: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  indice_refracao: z.string().optional().nullable(),
  preco_custo: z.coerce.number().optional().nullable(),
  preco_venda: z.coerce.number().min(0, 'Preço obrigatório'),
})

const ArmacaoSchema = z.object({
  id: z.coerce.number().optional(),
  store_id: z.coerce.number(),
  marca: z.string().min(2, 'Marca é obrigatória'),
  modelo: z.string().optional().nullable(),
  referencia: z.string().optional().nullable(),
  cor: z.string().optional().nullable(),
  tamanho_aro: z.string().optional().nullable(),
  tamanho_ponte: z.string().optional().nullable(),
  tamanho_haste: z.string().optional().nullable(),
  preco_custo: z.coerce.number().optional().nullable(),
  preco_venda: z.coerce.number().min(0),
  quantidade_estoque: z.coerce.number().int().default(0),
  codigo_barras: z.string().optional().nullable(),
})

const TratamentoSchema = z.object({
  id: z.coerce.number().optional(),
  store_id: z.coerce.number(),
  nome_tratamento: z.string().min(2, 'Nome é obrigatório'),
  descricao: z.string().optional().nullable(),
  preco_custo_adicional: z.coerce.number().optional().nullable(),
  preco_venda_adicional: z.coerce.number().min(0),
})

const ProdutoGeralSchema = z.object({
  id: z.coerce.number().optional(),
  store_id: z.coerce.number(),
  categoria: z.string().min(2, 'Categoria é obrigatória'),
  descricao: z.string().min(2, 'Descrição é obrigatória'),
  marca: z.string().optional().nullable(),
  preco_custo: z.coerce.number().optional().nullable(),
  preco_venda: z.coerce.number().min(0),
  estoque_atual: z.coerce.number().int().default(0),
  estoque_minimo: z.coerce.number().int().default(1),
  codigo_barras: z.string().optional().nullable(),
})

const OftalmoSchema = z.object({
  id: z.coerce.number().optional(),
  store_id: z.coerce.number(),
  nome_completo: z.string().min(2, 'Nome é obrigatório'),
  crm: z.string().optional().nullable(),
  telefone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  clinica: z.string().optional().nullable(),
})

const SupplierSchema = z.object({
  id: z.coerce.number().optional(),
  store_id: z.coerce.number(),
  nome_fantasia: z.string().min(2, 'Nome Fantasia é obrigatório'),
  razao_social: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  inscricao_estadual: z.string().optional().nullable(),
  telefone: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  uf: z.string().optional().nullable(),
})

// ============================================================================
// ACTIONS DE SALVAR (COM CORREÇÃO DE TIPAGEM 'as any')
// ============================================================================

export async function saveLente(prevState: CatalogActionResult, formData: FormData): Promise<CatalogActionResult> {
  try {
    const { profile, supabaseAdmin } = await getContext()
    const nullIfEmpty = (v: any) => (v === '' ? null : v)

    const validated = LenteSchema.safeParse({
      id: nullIfEmpty(formData.get('id')),
      store_id: profile.store_id,
      nome_lente: formData.get('nome_lente'),
      marca: nullIfEmpty(formData.get('marca')),
      tipo: nullIfEmpty(formData.get('tipo')),
      material: nullIfEmpty(formData.get('material')),
      indice_refracao: nullIfEmpty(formData.get('indice_refracao')),
      preco_custo: nullIfEmpty(formData.get('preco_custo')),
      preco_venda: formData.get('preco_venda'),
    })

    if (!validated.success) return { success: false, message: 'Erro validação', errors: validated.error.flatten().fieldErrors }
    const { id, ...data } = validated.data

    const detalhes: Json = {
        material: data.material,
        tipo_desenho: data.tipo,
        indice: data.indice_refracao
    }

    const payload = {
        tenant_id: profile.tenant_id,
        store_id: profile.store_id,
        nome: data.nome_lente,
        marca: data.marca,
        tipo_produto: 'Lente',
        categoria: 'Lente Oftálmica',
        preco_custo: data.preco_custo,
        preco_venda: data.preco_venda,
        detalhes: detalhes,
        gerencia_estoque: false,
        tem_grade: false 
    }

    if (id) {
      // CORREÇÃO: Cast para 'any' ANTES do update para ignorar verificação estrita de tipo no payload
      await (supabaseAdmin.from('products') as any)
        .update(payload)
        .eq('id', id)
    } else {
      // CORREÇÃO: Cast para 'any' ANTES do insert
      await (supabaseAdmin.from('products') as any)
        .insert(payload)
    }

    revalidatePath(`/dashboard/loja/${profile.store_id}/cadastros`)
    return { success: true, message: 'Lente salva!' }
  } catch (e: any) { return { success: false, message: e.message } }
}

export async function saveArmacao(prevState: CatalogActionResult, formData: FormData): Promise<CatalogActionResult> {
  try {
    const { profile, supabaseAdmin } = await getContext()
    const nullIfEmpty = (v: any) => (v === '' ? null : v)

    const validated = ArmacaoSchema.safeParse({
      id: nullIfEmpty(formData.get('id')),
      store_id: profile.store_id,
      marca: formData.get('marca'),
      modelo: nullIfEmpty(formData.get('modelo')),
      referencia: nullIfEmpty(formData.get('referencia')),
      cor: nullIfEmpty(formData.get('cor')),
      tamanho_aro: nullIfEmpty(formData.get('tamanho_aro')),
      tamanho_ponte: nullIfEmpty(formData.get('tamanho_ponte')),
      tamanho_haste: nullIfEmpty(formData.get('tamanho_haste')),
      preco_custo: nullIfEmpty(formData.get('preco_custo')),
      preco_venda: formData.get('preco_venda'),
      quantidade_estoque: formData.get('quantidade_estoque'),
      codigo_barras: nullIfEmpty(formData.get('codigo_barras')),
    })

    if (!validated.success) return { success: false, message: 'Erro validação', errors: validated.error.flatten().fieldErrors }
    const { id, ...data } = validated.data

    let finalBarcode = data.codigo_barras
    if (!finalBarcode) finalBarcode = await generateSmartBarcode(profile.store_id, data.preco_custo)

    const detalhes: Json = {
        modelo: data.modelo,
        cor: data.cor,
        aro: data.tamanho_aro,
        ponte: data.tamanho_ponte,
        haste: data.tamanho_haste
    }

    const payload = {
        tenant_id: profile.tenant_id,
        store_id: profile.store_id,
        nome: `${data.marca} ${data.modelo || ''} ${data.referencia || ''}`.trim(),
        marca: data.marca,
        referencia: data.referencia,
        codigo_barras: finalBarcode,
        tipo_produto: 'Armacao',
        categoria: 'Armação',
        preco_custo: data.preco_custo,
        preco_venda: data.preco_venda,
        estoque_atual: data.quantidade_estoque,
        gerencia_estoque: true,
        detalhes: detalhes
    }

    if (id) {
        await (supabaseAdmin.from('products') as any).update(payload).eq('id', id)
    } else {
        await (supabaseAdmin.from('products') as any).insert(payload)
    }

    revalidatePath(`/dashboard/loja/${profile.store_id}/cadastros`)
    return { success: true, message: `Armação salva! Cód: ${finalBarcode}`, generatedCode: finalBarcode || undefined }
  } catch (e: any) { return { success: false, message: e.message } }
}

export async function saveProdutoGeral(prevState: CatalogActionResult, formData: FormData): Promise<CatalogActionResult> {
  try {
    const { profile, supabaseAdmin } = await getContext()
    const nullIfEmpty = (v: any) => (v === '' ? null : v)

    const validated = ProdutoGeralSchema.safeParse({
      id: nullIfEmpty(formData.get('id')),
      store_id: profile.store_id,
      categoria: formData.get('categoria'),
      descricao: formData.get('descricao'),
      marca: nullIfEmpty(formData.get('marca')),
      preco_custo: nullIfEmpty(formData.get('preco_custo')),
      preco_venda: formData.get('preco_venda'),
      estoque_atual: formData.get('estoque_atual'),
      estoque_minimo: formData.get('estoque_minimo'),
      codigo_barras: nullIfEmpty(formData.get('codigo_barras')),
    })

    if (!validated.success) return { success: false, message: 'Erro validação', errors: validated.error.flatten().fieldErrors }
    const { id, ...data } = validated.data

    let finalBarcode = data.codigo_barras
    if (!finalBarcode) finalBarcode = await generateSmartBarcode(profile.store_id, data.preco_custo)

    const payload = {
        tenant_id: profile.tenant_id,
        store_id: profile.store_id,
        nome: data.descricao,
        marca: data.marca,
        codigo_barras: finalBarcode,
        tipo_produto: 'Outro',
        categoria: data.categoria,
        preco_custo: data.preco_custo,
        preco_venda: data.preco_venda,
        estoque_atual: data.estoque_atual,
        estoque_minimo: data.estoque_minimo,
        gerencia_estoque: true
    }

    if (id) {
        await (supabaseAdmin.from('products') as any).update(payload).eq('id', id)
    } else {
        await (supabaseAdmin.from('products') as any).insert(payload)
    }

    revalidatePath(`/dashboard/loja/${profile.store_id}/cadastros`)
    return { success: true, message: `Produto salvo! Cód: ${finalBarcode}`, generatedCode: finalBarcode || undefined }
  } catch (e: any) { return { success: false, message: e.message } }
}

export async function saveTratamento(prevState: CatalogActionResult, formData: FormData): Promise<CatalogActionResult> {
  try {
    const { profile, supabaseAdmin } = await getContext()
    const nullIfEmpty = (v: any) => (v === '' ? null : v)
    
    const validated = TratamentoSchema.safeParse({
      id: nullIfEmpty(formData.get('id')),
      store_id: profile.store_id,
      nome_tratamento: formData.get('nome_tratamento'),
      descricao: nullIfEmpty(formData.get('descricao')),
      preco_custo_adicional: nullIfEmpty(formData.get('preco_custo_adicional')),
      preco_venda_adicional: formData.get('preco_venda_adicional'),
    })

    if (!validated.success) return { success: false, message: 'Erro validação', errors: validated.error.flatten().fieldErrors }
    const { id, ...data } = validated.data

    const payload = {
        tenant_id: profile.tenant_id,
        store_id: profile.store_id,
        nome: data.nome_tratamento,
        tipo_produto: 'Tratamento',
        categoria: 'Tratamento de Lente',
        preco_custo: data.preco_custo_adicional,
        preco_venda: data.preco_venda_adicional,
        detalhes: { descricao: data.descricao }
    }

    if (id) {
        await (supabaseAdmin.from('products') as any).update(payload).eq('id', id)
    } else {
        await (supabaseAdmin.from('products') as any).insert(payload)
    }

    revalidatePath(`/dashboard/loja/${profile.store_id}/cadastros`)
    return { success: true, message: 'Tratamento salvo!' }
  } catch (e: any) { return { success: false, message: e.message } }
}

export async function saveOftalmo(prevState: CatalogActionResult, formData: FormData): Promise<CatalogActionResult> {
  try {
    const { profile, supabaseAdmin } = await getContext()
    const nullIfEmpty = (v: any) => (v === '' ? null : v)
    const validated = OftalmoSchema.safeParse({
      id: nullIfEmpty(formData.get('id')),
      store_id: profile.store_id,
      nome_completo: formData.get('nome_completo'),
      crm: nullIfEmpty(formData.get('crm')),
      telefone: nullIfEmpty(formData.get('telefone')),
      email: nullIfEmpty(formData.get('email')),
      clinica: nullIfEmpty(formData.get('clinica')),
    })
    if (!validated.success) return { success: false, message: 'Erro validação', errors: validated.error.flatten().fieldErrors }
    const { id, ...data } = validated.data
    
    // Cast as any aqui também por garantia
    if (id) await (supabaseAdmin.from('oftalmologistas') as any).update(data).eq('id', id)
    else await (supabaseAdmin.from('oftalmologistas') as any).insert({ ...data, tenant_id: profile.tenant_id })

    revalidatePath(`/dashboard/loja/${profile.store_id}/cadastros`)
    return { success: true, message: 'Oftalmologista salvo!' }
  } catch (e: any) { return { success: false, message: e.message } }
}

// --- SALVAR FORNECEDOR (NOVO) ---
export async function saveSupplier(prevState: CatalogActionResult, formData: FormData): Promise<CatalogActionResult> {
  try {
    const { profile, supabaseAdmin } = await getContext()
    const nullIfEmpty = (v: any) => (v === '' ? null : v)
    
    const validated = SupplierSchema.safeParse({
      id: nullIfEmpty(formData.get('id')),
      store_id: profile.store_id,
      nome_fantasia: formData.get('nome_fantasia'),
      razao_social: nullIfEmpty(formData.get('razao_social')),
      cnpj: nullIfEmpty(formData.get('cnpj')),
      inscricao_estadual: nullIfEmpty(formData.get('inscricao_estadual')),
      telefone: nullIfEmpty(formData.get('telefone')),
      cidade: nullIfEmpty(formData.get('cidade')),
      uf: nullIfEmpty(formData.get('uf')),
    })

    if (!validated.success) return { success: false, message: 'Erro validação', errors: validated.error.flatten().fieldErrors }
    const { id, ...data } = validated.data
    
    const payload = { ...data, tenant_id: profile.tenant_id }

    // Cast 'as any' para evitar erro de tipo no build do Vercel
    let error;
    if (id) {
       const res = await (supabaseAdmin.from('suppliers') as any).update(payload).eq('id', id)
       error = res.error
    } else {
        const res = await (supabaseAdmin.from('suppliers') as any).insert(payload)
        error = res.error
    }

    if (error) throw new Error(error.message)

    revalidatePath(`/dashboard/loja/${profile.store_id}/cadastros`)
    return { success: true, message: 'Fornecedor salvo!' }
  } catch (e: any) { 
      console.error("Erro ao salvar fornecedor:", e)
      return { success: false, message: `Erro ao salvar: ${e.message}` } 
  }
}

// ============================================================================
// ACTION DE DELETAR
// ============================================================================
export async function deleteCatalogItem(
  id: number, 
  storeId: number, 
  categoryContext: 'lentes' | 'armacoes' | 'tratamentos' | 'oftalmologistas' | 'produtos_gerais' | 'fornecedores'
): Promise<CatalogActionResult> {
  try {
    const supabaseAdmin = createAdminClient()
    
    if (categoryContext === 'oftalmologistas') {
        await (supabaseAdmin.from('oftalmologistas') as any).delete().eq('id', id)
    } else if (categoryContext === 'fornecedores') {
        await (supabaseAdmin.from('suppliers') as any).delete().eq('id', id)
    } else {
        await (supabaseAdmin.from('products') as any).delete().eq('id', id)
    }
    
    revalidatePath(`/dashboard/loja/${storeId}/cadastros`)
    return { success: true, message: 'Item deletado.' }
  } catch (e: any) { return { success: false, message: e.message } }
}

// ============================================================================
// ACTION DE BUSCA
// ============================================================================
export async function fetchCatalogItems(
  storeId: number, 
  category: 'lentes' | 'armacoes' | 'tratamentos' | 'oftalmologistas' | 'produtos_gerais' | 'fornecedores',
  query: string = ''
): Promise<CatalogItemResult[]> {
  
  const supabaseAdmin = createAdminClient()

  if (category === 'oftalmologistas') {
      let q = (supabaseAdmin.from('oftalmologistas') as any).select('*').eq('store_id', storeId).limit(50)
      if (query) q = q.ilike('nome_completo', `%${query}%`)
      const { data } = await q.order('nome_completo')
      return (data || []).map((i: any) => ({
          id: i.id, title: i.nome_completo, subtitle: i.crm ? `CRM: ${i.crm}` : i.clinica, raw: i
      }))
  }

  if (category === 'fornecedores') {
      let q = (supabaseAdmin.from('suppliers') as any).select('*').eq('store_id', storeId).limit(50)
      if (query) q = q.ilike('nome_fantasia', `%${query}%`)
      
      const { data } = await q.order('nome_fantasia')
      return (data || []).map((i: any) => ({
          id: i.id, 
          title: i.nome_fantasia, 
          subtitle: i.cnpj || i.cidade, 
          raw: i 
      }))
  }

  let tipoFiltro = ''
  if (category === 'lentes') tipoFiltro = 'Lente'
  else if (category === 'armacoes') tipoFiltro = 'Armacao'
  else if (category === 'tratamentos') tipoFiltro = 'Tratamento'
  else if (category === 'produtos_gerais') tipoFiltro = 'Outro'

  let q = (supabaseAdmin.from('products') as any)
    .select('*')
    .eq('store_id', storeId)
    // Cast as any aqui garante que o TS não reclame do enum se o arquivo de tipos estiver desatualizado
    .eq('tipo_produto', tipoFiltro as any)
    .limit(50)

  if (query) {
      q = q.or(`nome.ilike.%${query}%,codigo_barras.eq.${query},referencia.ilike.%${query}%`)
  }

  const { data } = await q.order('created_at', { ascending: false })
  if (!data) return []

  return data.map((p: any) => {
      const d = (p.detalhes as any) || {}
      
      let rawData: any = { id: p.id, preco_venda: p.preco_venda, preco_custo: p.preco_custo }
      
      if (category === 'lentes') {
          rawData = { ...rawData, nome_lente: p.nome, marca: p.marca, tipo: d.tipo_desenho, material: d.material, indice_refracao: d.indice }
          return { id: p.id, title: p.nome, subtitle: `${p.marca || ''} ${d.material || ''}`, price: p.preco_venda, raw: rawData }
      }
      
      if (category === 'armacoes') {
          rawData = { 
              ...rawData, marca: p.marca, referencia: p.referencia, codigo_barras: p.codigo_barras, quantidade_estoque: p.estoque_atual,
              modelo: d.modelo, cor: d.cor, tamanho_aro: d.aro, tamanho_ponte: d.ponte, tamanho_haste: d.haste 
          }
          return { id: p.id, title: p.nome, subtitle: p.codigo_barras ? `Cód: ${p.codigo_barras}` : `Ref: ${p.referencia}`, price: p.preco_venda, stock: p.estoque_atual, raw: rawData }
      }

      if (category === 'produtos_gerais') {
          rawData = { ...rawData, descricao: p.nome, categoria: p.categoria, marca: p.marca, estoque_atual: p.estoque_atual, estoque_minimo: p.estoque_minimo, codigo_barras: p.codigo_barras }
          return { id: p.id, title: p.nome, subtitle: `Cat: ${p.categoria}`, price: p.preco_venda, stock: p.estoque_atual, raw: rawData }
      }

      if (category === 'tratamentos') {
          rawData = { ...rawData, nome_tratamento: p.nome, descricao: d.descricao, preco_venda_adicional: p.preco_venda, preco_custo_adicional: p.preco_custo }
          return { id: p.id, title: p.nome, subtitle: d.descricao, price: p.preco_venda, raw: rawData }
      }

      return { id: p.id, title: p.nome, raw: p }
  })
}

// Helper Categorias
export async function fetchCategoriasProdutos(storeId: number) {
    const supabaseAdmin = createAdminClient()
    const { data } = await (supabaseAdmin.from('products') as any)
        .select('categoria')
        .eq('store_id', storeId)
        .eq('tipo_produto', 'Outro')
        .order('categoria')
    
    return Array.from(new Set(data?.map((i: any) => i.categoria).filter(Boolean) as string[]))
}