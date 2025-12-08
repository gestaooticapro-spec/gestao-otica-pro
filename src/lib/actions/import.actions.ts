// ARQUIVO: src/lib/actions/import.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { XMLParser } from 'fast-xml-parser'
import { revalidatePath } from 'next/cache'

// Tipos para o Preview
export type XmlPreviewItem = {
    codigo_fornecedor: string
    codigo_barras: string // cEAN
    descricao: string
    ncm: string
    cest: string
    cfop: string
    unidade: string
    quantidade: number
    valor_unitario: number // Custo Calculado (Com impostos)
    valor_total: number
    // Status para a UI
    status_sistema: 'Novo' | 'Encontrado' | 'Vinculado'
    id_sistema?: number // Se já existir
    estoque_atual?: number
}

export type XmlPreviewData = {
    access_key: string // Chave de Acesso (44 dígitos)
    nfe_numero: string
    nfe_serie: string
    data_emissao: string
    fornecedor: {
        cnpj: string
        nome: string // xNome
        fantasia: string // xFant
        ie: string // IE
        cidade: string
        uf: string
        status_sistema: 'Novo' | 'Cadastrado'
        id_sistema?: number
    }
    itens: XmlPreviewItem[]
}

// Helper para limpar string de chave (remove 'NFe' se tiver)
const cleanKey = (key: string) => key?.replace('NFe', '') || ''

// Helper seguro para float
const parseFloatSafe = (val: any) => {
    if (!val) return 0
    return parseFloat(val)
}

// ============================================================================
// 1. LER XML E GERAR PREVIEW
// ============================================================================
export async function parseNfeAndPreview(formData: FormData): Promise<{ success: boolean, data?: XmlPreviewData, message?: string }> {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    if (!user) return { success: false, message: 'Login necessário.' }
    
    // Cast as any para garantir acesso às props do perfil
    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil não encontrado.' }

    const file = formData.get('xml_file') as File
    if (!file) return { success: false, message: 'Arquivo não enviado.' }

    try {
        const text = await file.text()
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" })
        const xmlObj = parser.parse(text)

        // Navegar na estrutura NFe
        const nfeProc = xmlObj.nfeProc || xmlObj.NFe
        if (!nfeProc || !nfeProc.NFe) throw new Error("XML inválido ou não é uma NFe.")
        
        const infNFe = nfeProc.NFe.infNFe
        
        // 1. TRAVA DE SEGURANÇA: Verificar Chave de Acesso
        const rawKey = infNFe["@_Id"] 
        if (!rawKey) throw new Error("Chave de acesso não encontrada no XML.")
        
        const accessKey = cleanKey(rawKey)
        
        // CORREÇÃO: Cast 'as any' para tabela imported_invoices
        const { data: invoiceExists } = await (supabaseAdmin.from('imported_invoices') as any)
            .select('id, imported_at')
            .eq('store_id', profile.store_id)
            .eq('access_key', accessKey)
            .maybeSingle()

        if (invoiceExists) {
            const dataImp = new Date(invoiceExists.imported_at).toLocaleDateString('pt-BR')
            return { success: false, message: `ATENÇÃO: Esta nota fiscal já foi importada no dia ${dataImp}.` }
        }

        // 2. Dados Gerais
        const emit = infNFe.emit
        const detList = Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det] 

        // 3. Processar Fornecedor
        const cnpjFornecedor = emit.CNPJ
        const fornecedorPreview = {
            cnpj: cnpjFornecedor,
            nome: emit.xNome,
            fantasia: emit.xFant || emit.xNome,
            ie: emit.IE,
            cidade: emit.enderEmit?.xMun || '',
            uf: emit.enderEmit?.UF || '',
            status_sistema: 'Novo' as 'Novo' | 'Cadastrado',
            id_sistema: undefined as number | undefined
        }

        // Verifica se fornecedor existe no banco
        // CORREÇÃO: Cast 'as any' para tabela suppliers
        const { data: existingSupplier } = await (supabaseAdmin.from('suppliers') as any)
            .select('id')
            .eq('store_id', profile.store_id)
            .eq('cnpj', cnpjFornecedor)
            .maybeSingle()

        if (existingSupplier) {
            fornecedorPreview.status_sistema = 'Cadastrado'
            fornecedorPreview.id_sistema = existingSupplier.id
        }

        // 4. Processar Produtos
        const itensPreview: XmlPreviewItem[] = []
        const eansDoXml = detList.map((d: any) => d.prod.cEAN).filter((c: string) => c && c !== 'SEM GTIN')
        
        // CORREÇÃO: Cast 'as any' para tabela products
        const { data: produtosExistentes } = await (supabaseAdmin.from('products') as any)
            .select('id, codigo_barras, estoque_atual, nome')
            .eq('store_id', profile.store_id)
            .in('codigo_barras', eansDoXml)

        for (const det of detList) {
            const prod = det.prod
            const impostos = det.imposto || {}
            
            // CÁLCULO DO CUSTO EFETIVO (LANDED COST)
            const vProd = parseFloatSafe(prod.vProd)
            const qCom = parseFloatSafe(prod.qCom)
            const vDesc = parseFloatSafe(prod.vDesc)
            const vFrete = parseFloatSafe(prod.vFrete)
            const vSeg = parseFloatSafe(prod.vSeg)
            const vOutro = parseFloatSafe(prod.vOutro)
            
            const vIPI = parseFloatSafe(impostos.IPI?.IPITrib?.vIPI)
            const vST = parseFloatSafe(impostos.ICMS?.ICMS10?.vICMSST) || parseFloatSafe(impostos.ICMS?.ICMS30?.vICMSST) || parseFloatSafe(impostos.ICMS?.ICMS70?.vICMSST) || parseFloatSafe(impostos.ICMS?.ICMS90?.vICMSST) || 0
            
            const custoTotalItem = vProd + vIPI + vST + vFrete + vSeg + vOutro - vDesc
            const custoUnitarioReal = custoTotalItem / qCom

            const match = produtosExistentes?.find((p: any) => p.codigo_barras === prod.cEAN)

            itensPreview.push({
                codigo_fornecedor: prod.cProd,
                codigo_barras: prod.cEAN !== 'SEM GTIN' ? prod.cEAN : '',
                descricao: prod.xProd,
                ncm: String(prod.NCM || ''),
                cest: String(prod.CEST || ''),
                cfop: prod.CFOP,
                unidade: prod.uCom,
                quantidade: qCom,
                valor_unitario: parseFloat(custoUnitarioReal.toFixed(2)),
                valor_total: vProd,
                status_sistema: match ? 'Encontrado' : 'Novo',
                id_sistema: match?.id,
                estoque_atual: match?.estoque_atual
            })
        }

        return {
            success: true,
            data: {
                access_key: accessKey,
                nfe_numero: infNFe.ide.nNF,
                nfe_serie: infNFe.ide.serie,
                data_emissao: infNFe.ide.dhEmi,
                fornecedor: fornecedorPreview,
                itens: itensPreview
            }
        }

    } catch (e: any) {
        console.error("Erro ao ler XML:", e)
        return { success: false, message: "Erro ao processar XML: " + e.message }
    }
}

// ============================================================================
// 2. GRAVAR DADOS (COMMIT)
// ============================================================================
export async function saveImportedData(data: XmlPreviewData, storeId: number) {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    if (!user) return { success: false, message: 'Login necessário.' }
    
    // Cast 'as any' para garantir acesso
    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil inválido.' }

    try {
        // 1. Salvar/Atualizar Fornecedor
        let supplierId = data.fornecedor.id_sistema

        if (!supplierId) {
            // CORREÇÃO: Cast 'as any' para insert em suppliers
            const { data: newSup, error } = await (supabaseAdmin.from('suppliers') as any).insert({
                tenant_id: profile.tenant_id,
                store_id: storeId,
                nome_fantasia: data.fornecedor.fantasia,
                razao_social: data.fornecedor.nome,
                cnpj: data.fornecedor.cnpj,
                inscricao_estadual: data.fornecedor.ie,
                cidade: data.fornecedor.cidade,
                uf: data.fornecedor.uf
            }).select().single()
            
            if (error) throw new Error("Erro ao criar fornecedor: " + error.message)
            supplierId = newSup.id
        }

        // 2. Processar Produtos
        for (const item of data.itens) {
            
            const nome = item.descricao.toUpperCase()
            const ncmString = String(item.ncm || '') 
            const ncm = ncmString.replace(/\./g, '')
            
            let tipoDetectado = 'Outro'
            let categoriaDetectada = 'Importado XML'

            // Lógica de Detecção
            if (ncm.startsWith('9003') || ncm.startsWith('9004')) {
                tipoDetectado = 'Armacao'
                categoriaDetectada = 'Armação'
            } else if (ncm.startsWith('9001')) {
                tipoDetectado = 'Lente'
                categoriaDetectada = 'Lente Oftálmica'
            } else {
                if (nome.includes('ARMA') || nome.includes('OCULOS') || nome.includes('SOLAR')) {
                    tipoDetectado = 'Armacao'
                    categoriaDetectada = 'Armação'
                } else if (nome.includes('LENTE')) {
                    tipoDetectado = 'Lente'
                    categoriaDetectada = 'Lente Oftálmica'
                }
            }

            const precoVendaSugerido = item.valor_unitario * 2 

            let productId = item.id_sistema

            if (productId) {
                // PRODUTO JÁ EXISTE: Atualiza estoque via RPC
                // CORREÇÃO: Cast 'as any' para RPC
                const { error: updateError } = await (supabaseAdmin as any).rpc('increment_stock', { 
                    p_product_id: productId, 
                    p_quantity: item.quantidade,
                    p_new_cost: item.valor_unitario
                })
                
                // Fallback se RPC falhar ou não existir
                if (updateError) { 
                    const { data: prodAtual } = await (supabaseAdmin.from('products') as any)
                        .select('estoque_atual')
                        .eq('id', productId)
                        .single()
                        
                    await (supabaseAdmin.from('products') as any).update({
                        estoque_atual: (prodAtual?.estoque_atual || 0) + item.quantidade,
                        preco_custo: item.valor_unitario,
                    }).eq('id', productId)
                }
            } else {
                // PRODUTO NOVO: Cria o registro
                // CORREÇÃO: Cast 'as any' para insert em products
                const { data: newProd, error: insertError } = await (supabaseAdmin.from('products') as any).insert({
                    tenant_id: profile.tenant_id,
                    store_id: storeId,
                    nome: item.descricao,
                    codigo_barras: item.codigo_barras || null,
                    referencia: item.codigo_fornecedor,
                    tipo_produto: tipoDetectado, 
                    categoria: categoriaDetectada,
                    marca: null, 
                    preco_custo: item.valor_unitario,
                    preco_venda: precoVendaSugerido,
                    estoque_atual: item.quantidade,
                    estoque_minimo: 1,
                    gerencia_estoque: true,
                    ncm: ncm,
                    cest: item.cest,
                    cfop: item.cfop,
                    unidade_medida: item.unidade,
                    origem_mercadoria: 0,
                    supplier_id: supplierId,
                    detalhes: {} 
                }).select().single()

                if (insertError) throw new Error(`Erro ao criar produto ${item.descricao}: ${insertError.message}`)
                productId = newProd.id
            }

            // 3. Registrar Movimentação (Log)
            // CORREÇÃO: Cast 'as any' para insert em stock_movements
            await (supabaseAdmin.from('stock_movements') as any).insert({
                tenant_id: profile.tenant_id,
                store_id: storeId,
                product_id: productId,
                tipo: 'Entrada',
                quantidade: item.quantidade,
                motivo: `Importação NFe ${data.nfe_numero}`,
                custo_unitario_momento: item.valor_unitario,
                registrado_por_id: user.id
            })
        }

        // 4. Registrar a Nota
        // CORREÇÃO: Cast 'as any' para insert em imported_invoices
        await (supabaseAdmin.from('imported_invoices') as any).insert({
            tenant_id: profile.tenant_id,
            store_id: storeId,
            access_key: data.access_key,
            nfe_number: data.nfe_numero,
            series: data.nfe_serie,
            supplier_id: supplierId,
            imported_at: new Date().toISOString()
        })

        revalidatePath(`/dashboard/loja/${storeId}/cadastros`)
        return { success: true, message: "Importação concluída com sucesso!" }

    } catch (e: any) {
        if (e.message?.includes('unique_invoice_key_per_store')) {
            return { success: false, message: "Erro: Esta nota fiscal já foi registrada no sistema." }
        }
        console.error("Erro ao salvar importação:", e)
        return { success: false, message: e.message }
    }
}

// ============================================================================
// 3. IMPORTAÇÃO DE LENTES (CSV)
// ============================================================================

export type LenteImportada = {
    nome_completo: string
    marca: string
    linha: string
    material: string
    tipo_lente: string
    preco_venda: number
    preco_custo: number
    detalhes: any
}

export type ImportResult = {
    success: boolean
    message: string
    processed: number
    updated: number
    created: number
    errors: string[]
}

export async function processarImportacaoLentes(
    storeId: number, 
    lentes: LenteImportada[]
): Promise<ImportResult> {
    const supabaseAdmin = createAdminClient()
    
    const { data: { user } } = await createClient().auth.getUser()
    if (!user) return { success: false, message: 'Usuário não logado.', processed: 0, updated: 0, created: 0, errors: [] }
    
    // Cast 'as any' no profile
    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil inválido.', processed: 0, updated: 0, created: 0, errors: [] }

    let createdCount = 0
    let updatedCount = 0
    const errors: string[] = []

    try {
        // 1. Buscar produtos existentes (lentes)
        // CORREÇÃO: Cast 'as any' para select em products
        const { data: produtosExistentes } = await (supabaseAdmin.from('products') as any)
            .select('id, nome, preco_venda, preco_custo')
            .eq('store_id', storeId)
            .eq('tipo_produto', 'Lente')

        const mapaProdutos = new Map(produtosExistentes?.map((p: any) => [p.nome.toUpperCase().trim(), p]))

        // 2. Processar lote
        for (const lente of lentes) {
            const nomeChave = lente.nome_completo.toUpperCase().trim()
            
            // CORREÇÃO: Cast 'as any' aqui para resolver o erro "Property id does not exist on type {}"
            const produtoExistente = mapaProdutos.get(nomeChave) as any

            const payload = {
                tenant_id: profile.tenant_id,
                store_id: storeId,
                nome: lente.nome_completo,
                marca: lente.marca,
                tipo_produto: 'Lente',
                categoria: 'Lente Oftálmica',
                preco_venda: lente.preco_venda,
                preco_custo: lente.preco_custo,
                detalhes: {
                    ...lente.detalhes,
                    linha: lente.linha,
                    material: lente.material,
                    tipo_desenho: lente.tipo_lente,
                    importado_em: new Date().toISOString()
                },
                gerencia_estoque: false,
                estoque_atual: 0,
                estoque_minimo: 0,
                tem_grade: true
            }

            if (produtoExistente) {
                // ATUALIZAR
                // CORREÇÃO: Cast 'as any'
                const { error } = await (supabaseAdmin.from('products') as any)
                    .update({
                        preco_venda: payload.preco_venda,
                        preco_custo: payload.preco_custo,
                        detalhes: payload.detalhes
                    })
                    .eq('id', produtoExistente.id)
                
                if (error) errors.push(`Erro ao atualizar ${lente.nome_completo}: ${error.message}`)
                else updatedCount++
            } else {
                // CRIAR NOVO
                // CORREÇÃO: Cast 'as any'
                const { error } = await (supabaseAdmin.from('products') as any)
                    .insert(payload)
                
                if (error) errors.push(`Erro ao criar ${lente.nome_completo}: ${error.message}`)
                else createdCount++
            }
        }

        revalidatePath(`/dashboard/loja/${storeId}/cadastros`)
        
        return {
            success: true,
            message: 'Processamento concluído.',
            processed: lentes.length,
            created: createdCount,
            updated: updatedCount,
            errors
        }

    } catch (e: any) {
        console.error("Erro crítico na importação:", e)
        return { success: false, message: e.message, processed: 0, created: 0, updated: 0, errors: [e.message] }
    }
}