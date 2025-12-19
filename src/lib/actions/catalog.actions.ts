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

export type LensGridItem = Database['public']['Tables']['product_variants']['Row']

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
      await (supabaseAdmin.from('products') as any).update(payload).eq('id', id)
    } else {
      await (supabaseAdmin.from('products') as any).insert(payload)
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

// ============================================================================
// FEATURE: GRADE DE LENTES (LEITURA E ATUALIZAÇÃO)
// ============================================================================
export async function getLensGrid(productId: number, storeId: number) {
  const supabaseAdmin = createAdminClient()

  const { data } = await (supabaseAdmin.from('product_variants') as any)
    .select('*')
    .eq('product_id', productId)
    .eq('store_id', storeId)
    .order('esferico', { ascending: true })
    .order('cilindrico', { ascending: true })

  return data || []
}

export async function updateLensGridStock(variantId: number, newStock: number, reason: string = 'Ajuste manual na Grade') {
  try {
    const { profile, supabaseAdmin, user } = await getContext()

    // 1. Buscar Estoque Atual
    const { data: variant } = await (supabaseAdmin.from('product_variants') as any)
      .select('estoque_atual, product_id, store_id')
      .eq('id', variantId)
      .single()

    if (!variant) return { success: false, message: 'Variante não encontrada.' }

    const currentStock = variant.estoque_atual || 0
    const diff = newStock - currentStock

    if (diff === 0) return { success: true } // Sem mudança

    // 2. Atualizar Estoque
    const { error: updateError } = await (supabaseAdmin.from('product_variants') as any)
      .update({ estoque_atual: newStock })
      .eq('id', variantId)

    if (updateError) throw updateError

    // 3. Registrar Movimentação (Rastreabilidade)
    await (supabaseAdmin.from('stock_movements') as any).insert({
      tenant_id: profile.tenant_id,
      store_id: variant.store_id,
      product_id: variant.product_id,
      variant_id: variantId,
      tipo: diff > 0 ? 'Entrada' : 'Ajuste',
      quantidade: Math.abs(diff),
      motivo: reason,
      custo_unitario_momento: 0,
      registrado_por_id: user.id,
      created_at: new Date().toISOString()
    })

    return { success: true }
  } catch (e: any) {
    console.error("Erro ao atualizar estoque da grade:", e)
    return { success: false, message: e.message }
  }
}

// ============================================================================
// FEATURE: GRADE DE LENTES (GERAÇÃO)
// ============================================================================
export type GenerateGridParams = {
  productId: number
  storeId: number
  minEsf: number
  maxEsf: number
  minCyl: number
  maxCyl: number
  step?: number // Padrão 0.25
}

export async function generateLensGrid(params: GenerateGridParams): Promise<CatalogActionResult> {
  const { productId, storeId, minEsf, maxEsf, minCyl, maxCyl } = params
  const step = params.step || 0.25

  const supabaseAdmin = createAdminClient()

  try {
    // 1. Validação de Segurança
    const { data: product } = await (supabaseAdmin.from('products') as any)
      .select('id, tem_grade')
      .eq('id', productId)
      .eq('store_id', storeId)
      .single()

    if (!product) return { success: false, message: 'Produto não encontrado.' }

    // Se já tem grade, por segurança, impedimos re-geração automática para não duplicar/zerar estoque
    if (product.tem_grade) {
      return { success: false, message: 'Este produto já possui grade gerada. Exclua as variantes antes de gerar novamente.' }
    }

    // 2. Geração das Combinações
    const variants = []

    // Loop Esférico (do menor para o maior)
    for (let esf = minEsf; esf <= maxEsf; esf += step) {
      // Loop Cilíndrico (do menor para o maior)
      for (let cyl = minCyl; cyl <= maxCyl; cyl += step) {

        // Correção de precisão flutuante (ex: -0.7500000001 -> -0.75)
        const esfFixed = Math.round(esf * 100) / 100
        const cylFixed = Math.round(cyl * 100) / 100

        variants.push({
          product_id: productId,
          store_id: storeId,
          nome_variante: `Esf ${esfFixed.toFixed(2)} Cyl ${cylFixed.toFixed(2)}`,
          esferico: esfFixed,
          cilindrico: cylFixed,
          estoque_atual: 0, // Começa zerado
          is_sobra: false
        })
      }
    }

    if (variants.length === 0) return { success: false, message: 'Nenhuma variante gerada. Verifique os intervalos.' }
    if (variants.length > 5000) return { success: false, message: `Muitas variantes (${variants.length}). Reduza o intervalo.` }

    // 3. Inserção em Lote (Batch Insert)
    // O Supabase aguenta bem, mas se for muito grande pode ser bom quebrar. 
    // Vamos assumir que < 2000 vai direto.
    const { error: insertError } = await (supabaseAdmin.from('product_variants') as any)
      .insert(variants)

    if (insertError) throw insertError

    // 4. Marca o produto como 'tem_grade'
    await (supabaseAdmin.from('products') as any)
      .update({ tem_grade: true })
      .eq('id', productId)

    revalidatePath(`/dashboard/loja/${storeId}/cadastros`)
    return { success: true, message: `Grade gerada com sucesso! (${variants.length} variantes)` }

  } catch (e: any) {
    console.error("Erro ao gerar grade:", e)
    return { success: false, message: `Erro: ${e.message}` }
  }
}