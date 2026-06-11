'use server'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { XMLParser } from 'fast-xml-parser'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getNuvemFiscalToken } from '@/lib/nuvemfiscal'

type QueueStatus = 'pending' | 'imported' | 'ignored' | 'error' | 'duplicated'

export type NfeQueueItem = {
    id: string
    chave_acesso: string
    nuvemfiscal_document_id: string | null
    nsu: number | null
    resumo: boolean
    xml_completo_disponivel: boolean
    status: QueueStatus
    numero: string | null
    serie: string | null
    emitente_nome: string | null
    emitente_cnpj: string | null
    data_emissao: string | null
    valor_total: number | null
    error_message: string | null
    created_at: string
}

type DistribuicaoDocumento = {
    id: string
    nsu?: number | null
    schema?: string | null
    tipo_documento?: string | null
    chave_acesso?: string | null
    resumo?: boolean | null
    valor_nfe?: number | null
    emitente_cpf_cnpj?: string | null
    emitente_nome_razao_social?: string | null
    data_emissao?: string | null
    data_evento?: string | null
}

const NFE_IMPORT_LOOKBACK_DAYS = 60
const NFE_ENVIRONMENT = 'production' as const
const NFE_AMBIENTE = 'producao'
const SEFAZ_WAIT_WINDOW_MS = 60 * 60 * 1000
const DISTRIBUTION_POLL_INTERVAL_MS = 750
const DISTRIBUTION_POLL_MAX_ATTEMPTS = 12

function onlyDigits(value?: string | null) {
    return String(value || '').replace(/\D/g, '')
}

function nfeBaseUrl() {
    return process.env.NUVEMFISCAL_PROD_URL || 'https://api.nuvemfiscal.com.br'
}

function parseJsonSafe(text: string) {
    try {
        return text ? JSON.parse(text) : null
    } catch {
        return text || null
    }
}

function isAcceptedDistributionDocType(tipoDocumento?: string | null) {
    if (!tipoDocumento) return true
    return String(tipoDocumento).trim().toLowerCase() === 'nota'
}

function queueItemBelongsToStore(
    item: { metadata?: Record<string, any> | null },
    storeId: number,
    cpfCnpj: string,
) {
    const metadataStoreId = Number(item.metadata?.store_id)
    const metadataCpfCnpj = onlyDigits(item.metadata?.cpf_cnpj)
    if (Number.isInteger(metadataStoreId) && metadataStoreId > 0) {
        return metadataStoreId === storeId
    }
    return Boolean(metadataCpfCnpj) && metadataCpfCnpj === cpfCnpj
}

function buildQueueMetadata(doc: DistribuicaoDocumento, storeId: number, cpfCnpj: string) {
    return {
        ...doc,
        store_id: storeId,
        cpf_cnpj: cpfCnpj,
    }
}

function toFiniteNumber(value: unknown) {
    const numericValue = Number(value)
    return Number.isFinite(numericValue) ? numericValue : null
}

function isRateLimitStatus(status: unknown) {
    return toFiniteNumber(status) === 656
}

function getNextAllowedSyncAt(lastSyncAt?: string | null) {
    if (!lastSyncAt) return null
    const lastSyncTime = new Date(lastSyncAt).getTime()
    if (!Number.isFinite(lastSyncTime)) return null
    return new Date(lastSyncTime + SEFAZ_WAIT_WINDOW_MS).toISOString()
}

function hasReliableMaxNsu(ultimoNsu: unknown, maxNsu: unknown) {
    const ultimo = toFiniteNumber(ultimoNsu)
    const max = toFiniteNumber(maxNsu)
    return ultimo !== null && max !== null && max > 0 && max >= ultimo
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestNfeDistribution(
    requestPayload: Record<string, unknown>,
    token: string,
) {
    const endpoint = `${nfeBaseUrl()}/distribuicao/nfe`
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        cache: 'no-store',
    })
    const responseText = await response.text()
    const initialResult = parseJsonSafe(responseText) || {}

    if (!response.ok) {
        throw new Error(
            (initialResult as any)?.error?.message
            || (initialResult as any)?.message
            || responseText
            || 'Falha ao consultar distribuicao NF-e.',
        )
    }

    let result = initialResult as Record<string, any>
    let pollAttempts = 0

    while (String(result.status || '').toLowerCase() === 'processando') {
        const distributionId = String(result.id || '').trim()
        if (!distributionId) {
            throw new Error('A Nuvem Fiscal iniciou uma consulta assincrona sem retornar o identificador do pedido.')
        }
        if (pollAttempts >= DISTRIBUTION_POLL_MAX_ATTEMPTS) {
            throw new Error('A consulta ainda esta sendo processada pela Nuvem Fiscal. Tente novamente em alguns instantes.')
        }

        pollAttempts++
        await sleep(DISTRIBUTION_POLL_INTERVAL_MS)

        const pollResponse = await fetch(`${endpoint}/${distributionId}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
        })
        const pollText = await pollResponse.text()
        const pollResult = parseJsonSafe(pollText) || {}

        if (!pollResponse.ok) {
            throw new Error(
                (pollResult as any)?.error?.message
                || (pollResult as any)?.message
                || pollText
                || 'Falha ao acompanhar a consulta de distribuicao NF-e.',
            )
        }

        result = pollResult as Record<string, any>
    }

    if (String(result.status || '').toLowerCase() === 'erro') {
        throw new Error(
            result?.error?.message
            || result?.mensagem
            || result?.motivo_status
            || 'A Nuvem Fiscal nao conseguiu concluir a consulta de distribuicao NF-e.',
        )
    }

    return {
        endpoint,
        httpStatus: response.status,
        initialResult,
        result,
        pollAttempts,
    }
}

async function touchDistributionState(params: {
    organizationId: string
    cpfCnpj: string
    ambiente: string
    ultimoNsu?: unknown
    maxNsu?: unknown
}) {
    const supabaseAdmin = createAdminClient() as any
    const now = new Date().toISOString()

    let { data: state } = await supabaseAdmin
        .from('nfe_distribution_state')
        .select('id, ultimo_nsu, max_nsu, initial_sync_completed')
        .eq('organization_id', params.organizationId)
        .eq('cpf_cnpj', params.cpfCnpj)
        .eq('ambiente', params.ambiente)
        .maybeSingle()

    if (!state) {
        const { data: insertedState, error: insertError } = await supabaseAdmin
            .from('nfe_distribution_state')
            .insert({
                organization_id: params.organizationId,
                cpf_cnpj: params.cpfCnpj,
                ambiente: params.ambiente,
                ultimo_nsu: 0,
                initial_sync_completed: false,
                last_sync_at: now,
                updated_at: now,
            })
            .select('id, ultimo_nsu, max_nsu, initial_sync_completed')
            .single()

        if (insertError) throw insertError
        state = insertedState
    }

    const nextUltimoNsu = toFiniteNumber(params.ultimoNsu) ?? Number(state.ultimo_nsu || 0)
    const nextMaxNsu = toFiniteNumber(params.maxNsu)

    const { error } = await supabaseAdmin
        .from('nfe_distribution_state')
        .update({
            ultimo_nsu: nextUltimoNsu,
            max_nsu: nextMaxNsu ?? state.max_nsu ?? null,
            last_sync_at: now,
            updated_at: now,
        })
        .eq('id', state.id)

    if (error) throw error
}

async function getTenantAndCompany(storeId?: number) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuario nao autenticado.')

    const profile = await getProfileByAdmin(user.id) as unknown as { tenant_id: string | null; store_id: number | null } | null
    if (!profile?.tenant_id) throw new Error('Perfil da loja nao encontrado.')

    const resolvedStoreId = storeId || profile.store_id
    if (!resolvedStoreId) throw new Error('Loja nao encontrada para consulta NF-e.')

    const supabaseAdmin = createAdminClient() as any
    const { data: company } = await supabaseAdmin
        .from('company_settings')
        .select('cnpj, cpf_cnpj')
        .eq('organization_id', profile.tenant_id)
        .maybeSingle()

    const { data: store } = await supabaseAdmin
        .from('stores')
        .select('cnpj')
        .eq('id', resolvedStoreId)
        .eq('tenant_id', profile.tenant_id)
        .maybeSingle()

    const storeCnpj = onlyDigits(store?.cnpj)
    const companyCnpj = onlyDigits(company?.cnpj || company?.cpf_cnpj)
    const cpfCnpj = storeCnpj || companyCnpj
    if (!cpfCnpj) throw new Error('CNPJ da loja nao configurado.')

    return {
        organizationId: profile.tenant_id as string,
        storeId: resolvedStoreId as number,
        cpfCnpj,
        cnpjSource: storeCnpj ? 'stores.cnpj' : 'company_settings',
    }
}

function parseNfeXml(xmlText: string) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        parseTagValue: false,
        parseAttributeValue: false,
    })
    const xml = parser.parse(xmlText)
    const nfeProc = xml.nfeProc || xml.NFe
    const infNFe = nfeProc?.NFe?.infNFe || xml.infNFe
    return { xml, infNFe }
}

function hasCompleteNfeItems(xmlText: string) {
    try {
        const { infNFe } = parseNfeXml(xmlText)
        return Boolean(infNFe?.det)
    } catch {
        return false
    }
}

function extractNfeMetaFromXml(xmlText: string) {
    const { xml, infNFe } = parseNfeXml(xmlText)
    if (!infNFe) return {}

    const ide = infNFe.ide || {}
    const emit = infNFe.emit || {}
    const total = infNFe.total?.ICMSTot || {}
    let chave = String(xml.nfeProc?.protNFe?.infProt?.chNFe || '').trim()
    if (!/^[0-9]{44}$/.test(chave)) {
        chave = String(infNFe['@_Id'] || '').replace(/^NFe/, '').trim()
    }

    return {
        chave_acesso: /^[0-9]{44}$/.test(chave) ? chave : undefined,
        numero: ide.nNF ? String(ide.nNF) : undefined,
        serie: ide.serie ? String(ide.serie) : undefined,
        emitente_nome: emit.xNome ? String(emit.xNome) : undefined,
        emitente_cnpj: emit.CNPJ ? String(emit.CNPJ) : undefined,
        data_emissao: ide.dhEmi ? String(ide.dhEmi) : undefined,
        valor_total: total.vNF ? Number(total.vNF) : undefined,
    }
}

async function ensureDistributionConfig(cpfCnpj: string, token: string) {
    const endpoint = `${nfeBaseUrl()}/empresas/${cpfCnpj}/distnfe`
    const request = {
        ambiente: NFE_AMBIENTE,
        distribuicao_automatica: false,
        ciencia_automatica: false,
    }
    const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    })
    const responseText = await response.text()

    return {
        ok: response.ok,
        endpoint,
        request,
        httpStatus: response.status,
        response: parseJsonSafe(responseText),
    }
}

async function manifestScience(cpfCnpj: string, chaveAcesso: string, token: string) {
    const response = await fetch(`${nfeBaseUrl()}/distribuicao/nfe/manifestacoes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            cpf_cnpj: cpfCnpj,
            ambiente: NFE_AMBIENTE,
            chave_acesso: chaveAcesso,
            tipo_evento: '210210',
        }),
    })

    if (!response.ok && response.status !== 409) {
        const errorText = await response.text()
        throw new Error(`Nao foi possivel manifestar ciencia (${response.status}): ${errorText}`)
    }
}

async function downloadDocumentXml(documentId: string, token: string) {
    const response = await fetch(`${nfeBaseUrl()}/distribuicao/nfe/documentos/${documentId}/xml`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Nao foi possivel baixar o XML (${response.status}): ${errorText}`)
    }

    return response.text()
}

export async function listNfeImportQueue(storeId?: number) {
    try {
        const { organizationId, storeId: resolvedStoreId, cpfCnpj } = await getTenantAndCompany(storeId)
        const supabaseAdmin = createAdminClient() as any

        const { data, error } = await supabaseAdmin
            .from('nfe_import_queue')
            .select('id, chave_acesso, nuvemfiscal_document_id, nsu, resumo, status, numero, serie, emitente_nome, emitente_cnpj, data_emissao, valor_total, error_message, created_at, xml_content, metadata')
            .eq('organization_id', organizationId)
            .in('status', ['pending', 'error'])
            .order('data_emissao', { ascending: false, nullsFirst: false })

        if (error) throw error

        const queueItems = ((data || []) as any[])
            .filter((item) => queueItemBelongsToStore(item, resolvedStoreId, cpfCnpj))
            .map((item) => {
            const queueItem = { ...item }
            const xmlContent = queueItem.xml_content
            delete queueItem.xml_content
            delete queueItem.metadata
            return {
                ...queueItem,
                xml_completo_disponivel: xmlContent ? hasCompleteNfeItems(String(xmlContent)) : false,
            } as NfeQueueItem
            })

        const keys = queueItems.map((item) => item.chave_acesso).filter(Boolean)
        if (keys.length === 0) return { success: true, data: queueItems }

        const { data: imported, error: importedError } = await supabaseAdmin
            .from('imported_invoices')
            .select('access_key')
            .eq('tenant_id', organizationId)
            .eq('store_id', resolvedStoreId)
            .in('access_key', keys)

        if (importedError) throw importedError

        const importedKeys = new Set((imported || []).map((item: any) => item.access_key).filter(Boolean))
        if (importedKeys.size > 0) {
            await supabaseAdmin
                .from('nfe_import_queue')
                .update({
                    status: 'imported',
                    imported_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('organization_id', organizationId)
                .contains('metadata', { store_id: resolvedStoreId })
                .in('chave_acesso', Array.from(importedKeys))
        }

        return { success: true, data: queueItems.filter((item) => !importedKeys.has(item.chave_acesso)) }
    } catch (error: any) {
        return { success: false, error: error.message, data: [] as NfeQueueItem[] }
    }
}

export async function syncNfeFromSefaz(storeId?: number) {
    let diagnostico: Record<string, any> = {
        momento: new Date().toISOString(),
        intermediario: 'Nuvem Fiscal',
        ambiente: NFE_AMBIENTE,
    }

    try {
        const { organizationId, cpfCnpj, cnpjSource, storeId: resolvedStoreId } = await getTenantAndCompany(storeId)
        const supabaseAdmin = createAdminClient() as any

        diagnostico = {
            ...diagnostico,
            identificacao: {
                storeId: resolvedStoreId,
                organizationId,
                cpfCnpj,
                origemCnpj: cnpjSource,
            },
        }

        let { data: state } = await supabaseAdmin
            .from('nfe_distribution_state')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('cpf_cnpj', cpfCnpj)
            .eq('ambiente', NFE_AMBIENTE)
            .maybeSingle()

        if (!state) {
            const { data: insertedState, error: stateError } = await supabaseAdmin
                .from('nfe_distribution_state')
                .insert({
                    organization_id: organizationId,
                    cpf_cnpj: cpfCnpj,
                    ambiente: NFE_AMBIENTE,
                    ultimo_nsu: 0,
                    initial_sync_completed: false,
                })
                .select('*')
                .single()

            if (stateError) throw stateError
            state = insertedState
        }

        const isInitialSync = !state.initial_sync_completed
        diagnostico.estadoAntes = {
            id: state.id,
            ultimoNsu: Number(state.ultimo_nsu || 0),
            maxNsu: state.max_nsu ?? null,
            initialSyncCompleted: Boolean(state.initial_sync_completed),
            lastSyncAt: state.last_sync_at ?? null,
        }

        const token = await getNuvemFiscalToken(NFE_ENVIRONMENT, 'empresa nfe distribuicao-nfe')
        const configResult = await ensureDistributionConfig(cpfCnpj, token)
        diagnostico.configuracaoDistribuicao = configResult

        if (!configResult.ok) {
            const configError = configResult.response as any
            return {
                success: false,
                error: configError?.error?.message || `Falha ao configurar distribuicao NF-e (HTTP ${configResult.httpStatus}).`,
                diagnostico,
            }
        }

        const requestPayload = {
            cpf_cnpj: cpfCnpj,
            ambiente: NFE_AMBIENTE,
            tipo_consulta: 'dist-nsu',
            dist_nsu: Number(state.ultimo_nsu || 0),
            ignorar_tempo_espera: false,
        }
        const distribution = await requestNfeDistribution(requestPayload, token)
        const result = distribution.result
        const resultDocuments = Array.isArray((result as any)?.documentos) ? (result as any).documentos : []

        diagnostico.consulta = {
            endpoint: distribution.endpoint,
            method: 'POST',
            request: requestPayload,
            httpStatus: distribution.httpStatus,
            processamento: {
                statusInicial: (distribution.initialResult as any)?.status ?? null,
                pedidoId: (distribution.initialResult as any)?.id ?? null,
                tentativasAcompanhamento: distribution.pollAttempts,
                statusFinal: (result as any)?.status ?? null,
            },
            response: {
                codigo_status: (result as any)?.codigo_status ?? null,
                motivo_status: (result as any)?.motivo_status ?? null,
                ultimo_nsu: (result as any)?.ultimo_nsu ?? null,
                max_nsu: (result as any)?.max_nsu ?? null,
                documentos_count: resultDocuments.length,
                documentos_preview: resultDocuments.slice(0, 3),
                error: (result as any)?.error ?? null,
            },
        }

        if (isRateLimitStatus((result as any)?.codigo_status)) {
            // Update last_sync_at even if rate limited, so the UI correctly reflects the new blocked window
            await touchDistributionState({
                organizationId,
                cpfCnpj,
                ambiente: NFE_AMBIENTE,
                ultimoNsu: Number(state.ultimo_nsu || 0),
                maxNsu: state.max_nsu ?? null,
            })

            // Recalculate nextAttemptAt based on the updated time (which is now)
            const nextAttemptAt = getNextAllowedSyncAt(new Date().toISOString())
            diagnostico.proximaTentativaSugerida = nextAttemptAt

            return {
                success: true,
                inserted: 0,
                received: 0,
                skippedOld: 0,
                skippedDuplicated: 0,
                skippedNonNote: 0,
                skippedMissingKey: 0,
                ultimoNsu: (result as any)?.ultimo_nsu ?? state.ultimo_nsu ?? null,
                maxNsu: (result as any)?.max_nsu ?? state.max_nsu ?? null,
                codigoStatus: (result as any)?.codigo_status ?? null,
                motivoStatus: (result as any)?.motivo_status ?? null,
                cpfCnpj,
                initialSync: isInitialSync,
                initialSyncCompleted: Boolean(state.initial_sync_completed),
                blockedByRateLimit: true,
                nextAttemptAt,
                diagnostico,
            }
        }

        const minDate = new Date()
        minDate.setDate(minDate.getDate() - NFE_IMPORT_LOOKBACK_DAYS)

        const docs = (result.documentos || []) as DistribuicaoDocumento[]
        let inserted = 0
        let skippedOld = 0
        let skippedDuplicated = 0
        let skippedNonNote = 0
        let skippedMissingKey = 0

        for (const doc of docs) {
            if (!isAcceptedDistributionDocType(doc.tipo_documento)) {
                skippedNonNote++
                continue
            }
            if (!doc.chave_acesso) {
                skippedMissingKey++
                continue
            }

            const { data: existingInvoice } = await supabaseAdmin
                .from('imported_invoices')
                .select('id')
                .eq('tenant_id', organizationId)
                .eq('store_id', resolvedStoreId)
                .eq('access_key', doc.chave_acesso)
                .maybeSingle()

            if (existingInvoice) {
                skippedDuplicated++
                continue
            }

            const emissionDate = doc.data_emissao ? new Date(doc.data_emissao) : null
            if (isInitialSync && emissionDate && emissionDate < minDate) {
                skippedOld++
                continue
            }

            const { error: upsertError } = await supabaseAdmin
                .from('nfe_import_queue')
                .upsert({
                    organization_id: organizationId,
                    chave_acesso: doc.chave_acesso,
                    nuvemfiscal_document_id: doc.id,
                    nsu: doc.nsu || null,
                    schema: doc.schema || null,
                    resumo: Boolean(doc.resumo),
                    status: 'pending',
                    emitente_nome: doc.emitente_nome_razao_social || null,
                    emitente_cnpj: doc.emitente_cpf_cnpj || null,
                    data_emissao: doc.data_emissao || null,
                    valor_total: doc.valor_nfe || null,
                    metadata: buildQueueMetadata(doc, resolvedStoreId, cpfCnpj),
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'organization_id,chave_acesso' })

            if (upsertError) throw upsertError
            inserted++
        }

        const numericUltimoNsu = toFiniteNumber((result as any)?.ultimo_nsu) ?? Number(state.ultimo_nsu || 0)
        const numericMaxNsu = toFiniteNumber((result as any)?.max_nsu)
        const reachedReliableMaxNsu = hasReliableMaxNsu(numericUltimoNsu, numericMaxNsu)
            && numericUltimoNsu >= Number(numericMaxNsu)
        const initialSyncCompleted = isInitialSync ? reachedReliableMaxNsu : true

        await supabaseAdmin
            .from('nfe_distribution_state')
            .update({
                ultimo_nsu: numericUltimoNsu,
                max_nsu: reachedReliableMaxNsu || hasReliableMaxNsu(numericUltimoNsu, numericMaxNsu)
                    ? numericMaxNsu
                    : state.max_nsu ?? null,
                initial_sync_completed: initialSyncCompleted,
                last_sync_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', state.id)

        return {
            success: true,
            inserted,
            received: docs.length,
            skippedOld,
            skippedDuplicated,
            skippedNonNote,
            skippedMissingKey,
            ultimoNsu: result.ultimo_nsu ?? null,
            maxNsu: result.max_nsu ?? null,
            codigoStatus: result.codigo_status ?? null,
            motivoStatus: result.motivo_status ?? null,
            cpfCnpj,
            initialSync: isInitialSync,
            initialSyncCompleted,
            diagnostico,
        }
    } catch (error: any) {
        diagnostico.erroInterno = error.message
        return { success: false, error: error.message, diagnostico }
    }
}

export async function searchNfeByAccessKey(chaveAcesso: string, storeId?: number) {
    try {
        const cleanKey = onlyDigits(chaveAcesso)
        if (!/^[0-9]{44}$/.test(cleanKey)) {
            throw new Error('Chave de acesso invalida. Informe os 44 digitos da NF-e.')
        }

        const { organizationId, cpfCnpj, storeId: resolvedStoreId } = await getTenantAndCompany(storeId)
        const supabaseAdmin = createAdminClient() as any
        const token = await getNuvemFiscalToken(NFE_ENVIRONMENT, 'empresa nfe distribuicao-nfe')
        await ensureDistributionConfig(cpfCnpj, token)

        const distribution = await requestNfeDistribution({
            cpf_cnpj: cpfCnpj,
            ambiente: NFE_AMBIENTE,
            tipo_consulta: 'cons-chave',
            cons_chave: cleanKey,
            ignorar_tempo_espera: false,
        }, token)
        const result = distribution.result

        await touchDistributionState({
            organizationId,
            cpfCnpj,
            ambiente: NFE_AMBIENTE,
            ultimoNsu: result.ultimo_nsu,
            maxNsu: result.max_nsu,
        })

        const docs = ((result.documentos || []) as DistribuicaoDocumento[])
            .filter((doc) => isAcceptedDistributionDocType(doc.tipo_documento) && doc.chave_acesso)

        if (docs.length === 0) {
            return {
                success: true,
                inserted: 0,
                alreadyImported: false,
                found: false,
                codigoStatus: result.codigo_status ?? null,
                motivoStatus: result.motivo_status ?? null,
                cpfCnpj,
            }
        }

        const doc = docs[0]
        const { data: existingInvoice } = await supabaseAdmin
            .from('imported_invoices')
            .select('id, nfe_number, imported_at')
            .eq('tenant_id', organizationId)
            .eq('store_id', resolvedStoreId)
            .eq('access_key', doc.chave_acesso)
            .maybeSingle()

        if (existingInvoice) {
            return {
                success: true,
                inserted: 0,
                alreadyImported: true,
                found: true,
                invoice: existingInvoice,
                codigoStatus: result.codigo_status ?? null,
                motivoStatus: result.motivo_status ?? null,
                cpfCnpj,
            }
        }

        const { data: queueItem, error: upsertError } = await supabaseAdmin
            .from('nfe_import_queue')
            .upsert({
                organization_id: organizationId,
                chave_acesso: doc.chave_acesso,
                nuvemfiscal_document_id: doc.id,
                nsu: doc.nsu || null,
                schema: doc.schema || null,
                resumo: Boolean(doc.resumo),
                status: 'pending',
                emitente_nome: doc.emitente_nome_razao_social || null,
                emitente_cnpj: doc.emitente_cpf_cnpj || null,
                data_emissao: doc.data_emissao || doc.data_evento || null,
                valor_total: doc.valor_nfe || null,
                metadata: buildQueueMetadata(doc, resolvedStoreId, cpfCnpj),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'organization_id,chave_acesso' })
            .select('id')
            .single()

        if (upsertError) throw upsertError

        return {
            success: true,
            inserted: 1,
            alreadyImported: false,
            found: true,
            queueId: queueItem?.id || null,
            resumo: Boolean(doc.resumo),
            codigoStatus: result.codigo_status ?? null,
            motivoStatus: result.motivo_status ?? null,
            cpfCnpj,
        }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function getNfeQueueXml(queueId: string, storeId?: number) {
    try {
        const { organizationId, cpfCnpj, storeId: resolvedStoreId } = await getTenantAndCompany(storeId)
        const supabaseAdmin = createAdminClient() as any
        const { data: queueItem, error } = await supabaseAdmin
            .from('nfe_import_queue')
            .select('*')
            .eq('id', queueId)
            .eq('organization_id', organizationId)
            .single()

        if (error) throw error
        if (!queueItem) throw new Error('Nota nao encontrada na fila.')
        if (!queueItemBelongsToStore(queueItem, resolvedStoreId, cpfCnpj)) {
            throw new Error('Esta nota pertence a outra loja.')
        }

        let xmlContent = queueItem.xml_content as string | null
        const cachedXmlHasItems = xmlContent ? hasCompleteNfeItems(xmlContent) : false

        if (!xmlContent || !cachedXmlHasItems) {
            if (!queueItem.nuvemfiscal_document_id) throw new Error('Documento sem identificador na Nuvem Fiscal.')
            const token = await getNuvemFiscalToken(NFE_ENVIRONMENT, 'empresa nfe distribuicao-nfe')

            if ((queueItem.resumo || !cachedXmlHasItems) && queueItem.chave_acesso) {
                await manifestScience(cpfCnpj, queueItem.chave_acesso, token)
            }

            xmlContent = await downloadDocumentXml(queueItem.nuvemfiscal_document_id, token)
            const meta = extractNfeMetaFromXml(xmlContent)

            await supabaseAdmin
                .from('nfe_import_queue')
                .update({
                    xml_content: xmlContent,
                    resumo: !hasCompleteNfeItems(xmlContent),
                    numero: meta.numero || queueItem.numero,
                    serie: meta.serie || queueItem.serie,
                    emitente_nome: meta.emitente_nome || queueItem.emitente_nome,
                    emitente_cnpj: meta.emitente_cnpj || queueItem.emitente_cnpj,
                    data_emissao: meta.data_emissao || queueItem.data_emissao,
                    valor_total: meta.valor_total || queueItem.valor_total,
                    error_message: null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', queueId)
        }

        if (!hasCompleteNfeItems(xmlContent)) {
            return {
                success: false,
                error: 'Esta nota ainda veio como resumo. A ciencia da operacao foi enviada, mas o XML completo costuma liberar na proxima janela da SEFAZ. Aguarde cerca de 1 hora e tente novamente.',
            }
        }

        return { success: true, xmlContent }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function markNfeQueueImported(queueId?: string | null, chaveAcesso?: string, storeId?: number) {
    try {
        const { organizationId, cpfCnpj, storeId: resolvedStoreId } = await getTenantAndCompany(storeId)
        const supabaseAdmin = createAdminClient() as any

        let lookup = supabaseAdmin
            .from('nfe_import_queue')
            .select('id, metadata')
            .eq('organization_id', organizationId)

        if (queueId) {
            lookup = lookup.eq('id', queueId)
        } else if (chaveAcesso) {
            lookup = lookup.eq('chave_acesso', chaveAcesso)
        } else {
            throw new Error('Informe o item da fila ou a chave de acesso da NF-e.')
        }

        const { data: queueItem, error: lookupError } = await lookup.maybeSingle()
        if (lookupError) throw lookupError
        if (!queueItem || !queueItemBelongsToStore(queueItem, resolvedStoreId, cpfCnpj)) {
            throw new Error('Item da fila nao encontrado para esta loja.')
        }

        let query = supabaseAdmin
            .from('nfe_import_queue')
            .update({
                status: 'imported',
                imported_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('organization_id', organizationId)

        if (queueId) {
            query = query.eq('id', queueId)
        } else if (chaveAcesso) {
            query = query.eq('chave_acesso', chaveAcesso)
        }

        const { error } = await query
        if (error) throw error
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function setNfeQueueStatus(queueId: string, status: QueueStatus, storeId?: number) {
    try {
        const { organizationId, cpfCnpj, storeId: resolvedStoreId } = await getTenantAndCompany(storeId)
        const supabaseAdmin = createAdminClient() as any

        const { data: queueItem, error: lookupError } = await supabaseAdmin
            .from('nfe_import_queue')
            .select('id, metadata')
            .eq('id', queueId)
            .eq('organization_id', organizationId)
            .maybeSingle()

        if (lookupError) throw lookupError
        if (!queueItem || !queueItemBelongsToStore(queueItem, resolvedStoreId, cpfCnpj)) {
            throw new Error('Item da fila nao encontrado para esta loja.')
        }

        const { error } = await supabaseAdmin
            .from('nfe_import_queue')
            .update({
                status: status,
                updated_at: new Date().toISOString(),
            })
            .eq('id', queueId)
            .eq('organization_id', organizationId)

        if (error) throw error
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function listArchivedNfeQueue(storeId?: number) {
    try {
        const { organizationId, storeId: resolvedStoreId, cpfCnpj } = await getTenantAndCompany(storeId)
        const supabaseAdmin = createAdminClient() as any

        const { data, error } = await supabaseAdmin
            .from('nfe_import_queue')
            .select('id, chave_acesso, nuvemfiscal_document_id, nsu, resumo, status, numero, serie, emitente_nome, emitente_cnpj, data_emissao, valor_total, error_message, created_at, xml_content, metadata')
            .eq('organization_id', organizationId)
            .eq('status', 'ignored')
            .order('data_emissao', { ascending: false, nullsFirst: false })

        if (error) throw error

        const queueItems = ((data || []) as any[])
            .filter((item) => queueItemBelongsToStore(item, resolvedStoreId, cpfCnpj))
            .map((item) => {
                const queueItem = { ...item }
                const xmlContent = queueItem.xml_content
                delete queueItem.xml_content
                delete queueItem.metadata
                return {
                    ...queueItem,
                    xml_completo_disponivel: xmlContent ? hasCompleteNfeItems(String(xmlContent)) : false,
                } as NfeQueueItem
            })

        return { success: true, data: queueItems }
    } catch (error: any) {
        return { success: false, error: error.message, data: [] as NfeQueueItem[] }
    }
}
