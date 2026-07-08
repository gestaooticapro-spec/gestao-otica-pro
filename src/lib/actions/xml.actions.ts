'use server'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { XMLParser } from 'fast-xml-parser'
import { revalidatePath } from 'next/cache'
import { generateSmartBarcode } from '@/lib/actions/catalog.actions'
import { markNfeQueueImported } from '@/lib/actions/nfe-import-queue.actions'

export type XmlPreviewItem = {
    codigo_fornecedor: string
    codigo_barras: string
    descricao: string
    ncm: string
    cest: string
    cfop: string
    unidade: string
    quantidade: number
    valor_unitario: number
    valor_total: number
    status_sistema: 'Novo' | 'Encontrado' | 'Vinculado'
    id_sistema?: number
    estoque_atual?: number
    manual_match_id?: number | null
    use_xml_name?: boolean
    original_system_name?: string
    skip_import?: boolean
    preco_venda?: number
    preco_venda_editado?: boolean
}

export type XmlPreviewData = {
    source_queue_id?: string | null
    access_key: string
    nfe_numero: string
    nfe_serie: string
    data_emissao: string
    fornecedor: {
        cnpj: string
        nome: string
        fantasia: string
        ie: string
        cidade: string
        uf: string
        status_sistema: 'Novo' | 'Cadastrado'
        id_sistema?: number
    }
    itens: XmlPreviewItem[]
}

const cleanKey = (key: string) => key?.replace('NFe', '') || ''

const parseFloatSafe = (val: any) => {
    if (!val) return 0
    return parseFloat(val)
}

function isSupplierPrimaryKeyConflict(error: any) {
    return error?.code === '23505'
        && String(error?.message || error?.details || '').includes('suppliers_pkey')
}

async function insertSupplierWithPkeyRetry(supabaseAdmin: any, payload: Record<string, unknown>) {
    const { data: inserted, error } = await supabaseAdmin
        .from('suppliers')
        .insert(payload)
        .select()
        .single()

    if (!isSupplierPrimaryKeyConflict(error)) {
        return { data: inserted, error }
    }

    console.warn('[XML Import] Sequence de suppliers desalinhada. Tentando inserir com proximo ID disponivel.')

    const { data: maxRow, error: maxError } = await supabaseAdmin
        .from('suppliers')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (maxError) return { data: null, error: maxError }

    return supabaseAdmin
        .from('suppliers')
        .insert({ ...payload, id: (maxRow?.id || 0) + 1 })
        .select()
        .single()
}

export async function parseNfeAndPreview(formData: FormData): Promise<{ success: boolean, data?: XmlPreviewData, message?: string }> {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    if (!user) return { success: false, message: 'Login necessario.' }

    const profile = await getProfileByAdmin(user.id)
    if (!profile) return { success: false, message: 'Perfil nao encontrado.' }

    const file = formData.get('xml_file') as File
    if (!file) return { success: false, message: 'Arquivo nao enviado.' }

    try {
        const text = await file.text()
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
        const xmlObj = parser.parse(text)

        const nfeProc = xmlObj.nfeProc || xmlObj.NFe
        if (!nfeProc || !nfeProc.NFe) throw new Error('XML invalido ou nao e uma NFe.')

        const infNFe = nfeProc.NFe.infNFe
        const rawKey = infNFe['@_Id']
        if (!rawKey) throw new Error('Chave de acesso nao encontrada no XML.')

        const accessKey = cleanKey(rawKey)

        const { data: invoiceExists } = await (supabaseAdmin.from('imported_invoices') as any)
            .select('id, imported_at')
            .eq('store_id', (profile as any).store_id)
            .eq('access_key', accessKey)
            .maybeSingle()

        if (invoiceExists) {
            const dataImp = new Date(invoiceExists.imported_at).toLocaleDateString('pt-BR')
            return { success: false, message: `ATENCAO: Esta nota fiscal ja foi importada no dia ${dataImp}.` }
        }

        const emit = infNFe.emit
        const detList = Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det]

        const cnpjFornecedor = emit.CNPJ
        const fornecedorPreview: XmlPreviewData['fornecedor'] = {
            cnpj: cnpjFornecedor,
            nome: emit.xNome,
            fantasia: emit.xFant || emit.xNome,
            ie: emit.IE,
            cidade: emit.enderEmit?.xMun || '',
            uf: emit.enderEmit?.UF || '',
            status_sistema: 'Novo',
            id_sistema: undefined as number | undefined,
        }

        const { data: existingSupplier } = await (supabaseAdmin.from('suppliers') as any)
            .select('id')
            .eq('store_id', (profile as any).store_id)
            .eq('cnpj', cnpjFornecedor)
            .maybeSingle()

        if (existingSupplier) {
            fornecedorPreview.status_sistema = 'Cadastrado'
            fornecedorPreview.id_sistema = existingSupplier.id
        }

        const itensPreview: XmlPreviewItem[] = []
        const eansDoXml = detList.map((d: any) => d.prod.cEAN).filter((c: string) => c && c !== 'SEM GTIN')

        const { data: produtosExistentes } = await (supabaseAdmin.from('products') as any)
            .select('id, codigo_barras, estoque_atual, nome')
            .eq('store_id', (profile as any).store_id)
            .in('codigo_barras', eansDoXml)

        for (const det of detList) {
            const prod = det.prod
            const impostos = det.imposto || {}

            const vProd = parseFloatSafe(prod.vProd)
            const qCom = parseFloatSafe(prod.qCom)
            const vDesc = parseFloatSafe(prod.vDesc)
            const vFrete = parseFloatSafe(prod.vFrete)
            const vSeg = parseFloatSafe(prod.vSeg)
            const vOutro = parseFloatSafe(prod.vOutro)
            const vIPI = parseFloatSafe(impostos.IPI?.IPITrib?.vIPI)
            const vST = parseFloatSafe(impostos.ICMS?.ICMS10?.vICMSST)
                || parseFloatSafe(impostos.ICMS?.ICMS30?.vICMSST)
                || parseFloatSafe(impostos.ICMS?.ICMS70?.vICMSST)
                || parseFloatSafe(impostos.ICMS?.ICMS90?.vICMSST)
                || 0

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
                estoque_atual: match?.estoque_atual,
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
                itens: itensPreview,
            },
        }
    } catch (e: any) {
        console.error('Erro ao ler XML:', e)
        return { success: false, message: `Erro ao processar XML: ${e.message}` }
    }
}

export async function saveImportedData(data: XmlPreviewData, storeId: number) {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    if (!user) return { success: false, message: 'Login necessario.' }

    const profile = await getProfileByAdmin(user.id)
    if (!profile) return { success: false, message: 'Perfil invalido.' }

    try {
        const itensParaImportar = data.itens.filter((item) => !item.skip_import)
        const itensIgnorados = data.itens.length - itensParaImportar.length

        let supplierId = data.fornecedor.id_sistema

        if (!supplierId) {
            const supplierPayload = {
                tenant_id: (profile as any).tenant_id,
                store_id: storeId,
                nome_fantasia: data.fornecedor.fantasia,
                razao_social: data.fornecedor.nome,
                cnpj: data.fornecedor.cnpj,
                inscricao_estadual: data.fornecedor.ie,
                cidade: data.fornecedor.cidade,
                uf: data.fornecedor.uf,
            }

            const { data: newSup, error } = await insertSupplierWithPkeyRetry(supabaseAdmin as any, supplierPayload)

            if (error) throw new Error(`Erro ao criar fornecedor: ${error.message}`)
            supplierId = newSup.id
        }

        for (const item of itensParaImportar) {
            const nome = item.descricao.toUpperCase()
            const ncmString = String(item.ncm || '')
            const ncm = ncmString.replace(/\./g, '')

            let tipoDetectado = 'Outro'
            let categoriaDetectada = 'Importado XML'

            if (ncm.startsWith('9003') || ncm.startsWith('9004')) {
                tipoDetectado = 'Armacao'
                categoriaDetectada = 'Armacao'
            } else if (ncm.startsWith('9001')) {
                tipoDetectado = 'Lente'
                categoriaDetectada = 'Lente Oftalmica'
            } else if (nome.includes('ARMA') || nome.includes('OCULOS') || nome.includes('SOLAR')) {
                tipoDetectado = 'Armacao'
                categoriaDetectada = 'Armacao'
            } else if (nome.includes('LENTE')) {
                tipoDetectado = 'Lente'
                categoriaDetectada = 'Lente Oftalmica'
            }

            const precoVendaFinal = item.preco_venda ?? (item.valor_unitario * 2)
            let productId = item.manual_match_id || item.id_sistema

            if (productId) {
                const { error: updateError } = await (supabaseAdmin as any).rpc('increment_stock', {
                    p_product_id: productId,
                    p_quantity: item.quantidade,
                    p_new_cost: item.valor_unitario,
                })

                if (updateError) {
                    const { data: prodAtual } = await (supabaseAdmin.from('products') as any)
                        .select('estoque_atual')
                        .eq('id', productId)
                        .single()

                    const { error: fallbackUpdateError } = await (supabaseAdmin.from('products') as any).update({
                        estoque_atual: (prodAtual?.estoque_atual || 0) + item.quantidade,
                        preco_custo: item.valor_unitario,
                        preco_venda: precoVendaFinal,
                        ...(item.use_xml_name ? { nome: item.descricao } : {}),
                    }).eq('id', productId)

                    if (fallbackUpdateError) {
                        throw new Error(`Erro ao atualizar produto ${item.descricao}: ${fallbackUpdateError.message}`)
                    }
                } else {
                    const updates: Record<string, unknown> = {
                        preco_venda: precoVendaFinal,
                    }

                    if (item.use_xml_name) {
                        updates.nome = item.descricao
                    }

                    const { error: postUpdateError } = await (supabaseAdmin.from('products') as any)
                        .update(updates)
                        .eq('id', productId)

                    if (postUpdateError) {
                        throw new Error(`Erro ao atualizar produto ${item.descricao}: ${postUpdateError.message}`)
                    }
                }
            } else {
                let finalBarcode = item.codigo_barras || null
                if (!finalBarcode) {
                    finalBarcode = await generateSmartBarcode(storeId, item.valor_unitario)
                }

                const { data: newProd, error: insertError } = await (supabaseAdmin.from('products') as any).insert({
                    tenant_id: (profile as any).tenant_id,
                    store_id: storeId,
                    nome: item.descricao,
                    codigo_barras: finalBarcode,
                    referencia: item.codigo_fornecedor,
                    tipo_produto: tipoDetectado,
                    categoria: categoriaDetectada,
                    marca: null,
                    preco_custo: item.valor_unitario,
                    preco_venda: precoVendaFinal,
                    estoque_atual: item.quantidade,
                    estoque_minimo: 1,
                    gerencia_estoque: true,
                    ncm,
                    cest: item.cest,
                    cfop: item.cfop,
                    unidade_medida: item.unidade,
                    origem_mercadoria: 0,
                    supplier_id: supplierId,
                    detalhes: {},
                }).select().single()

                if (insertError) throw new Error(`Erro ao criar produto ${item.descricao}: ${insertError.message}`)
                productId = newProd.id
            }

            await (supabaseAdmin.from('stock_movements') as any).insert({
                tenant_id: (profile as any).tenant_id,
                store_id: storeId,
                product_id: productId,
                tipo: 'Entrada',
                quantidade: item.quantidade,
                motivo: `Importacao NFe ${data.nfe_numero}`,
                custo_unitario_momento: item.valor_unitario,
                registrado_por_id: user.id,
            })
        }

        await (supabaseAdmin.from('imported_invoices') as any).insert({
            tenant_id: (profile as any).tenant_id,
            store_id: storeId,
            access_key: data.access_key,
            nfe_number: data.nfe_numero,
            series: data.nfe_serie,
            supplier_id: supplierId,
            imported_at: new Date().toISOString(),
        })

        if (data.source_queue_id) {
            await markNfeQueueImported(data.source_queue_id, data.access_key, storeId)
        }

        revalidatePath(`/dashboard/loja/${storeId}/cadastros`)
        return {
            success: true,
            message: itensIgnorados > 0
                ? `Importacao concluida com sucesso! ${itensParaImportar.length} item(ns) importado(s) e ${itensIgnorados} ignorado(s).`
                : 'Importacao concluida com sucesso!',
        }
    } catch (e: any) {
        if (e.message?.includes('unique_invoice_key_per_store')) {
            return { success: false, message: 'Erro: Esta nota fiscal ja foi registrada no sistema.' }
        }

        console.error('Erro ao salvar importacao:', e)
        return { success: false, message: e.message }
    }
}

export async function searchProductsForManualMatch(term: string, storeId: number) {
    const supabaseAdmin = createAdminClient()

    if (!term || term.length < 3) return []

    const { data, error } = await (supabaseAdmin.from('products') as any)
        .select('id, nome, referencia, codigo_barras, estoque_atual, marca')
        .eq('store_id', storeId)
        .or(`nome.ilike.%${term}%,referencia.ilike.%${term}%,codigo_barras.ilike.%${term}%,marca.ilike.%${term}%`)
        .limit(20)

    if (error) {
        console.error('Erro na busca manual:', error)
        return []
    }

    return data as any[]
}
