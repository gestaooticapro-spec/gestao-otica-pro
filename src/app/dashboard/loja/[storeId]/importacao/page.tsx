'use client'

import { useState, useTransition, useRef, useMemo, useCallback, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { UploadCloud, FileText, CheckCircle, AlertTriangle, Loader2, Save, ArrowLeft, Search, Link as LinkIcon, Unlink, AlertCircle, X, Check, Inbox, RefreshCw, Copy, CloudDownload } from 'lucide-react'
import { parseNfeAndPreview, saveImportedData, type XmlPreviewData } from '@/lib/actions/xml.actions'
import { ProductSearchCombobox } from '@/components/importacao/ProductSearchCombobox'
import {
    getNfeQueueXml,
    listNfeImportQueue,
    searchNfeByAccessKey,
    syncNfeFromSefaz,
    type NfeQueueItem,
} from '@/lib/actions/nfe-import-queue.actions'

type ManualMatchProduct = {
    id: number
    nome: string
    codigo_barras: string
    estoque_atual: number
    referencia?: string
}

// Helper para formatar moeda
const money = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)
const DEFAULT_MARKUP = 2
const roundCurrency = (value: number) => Math.round(value * 100) / 100
const getSalePriceFromMarkup = (cost: number, markup: number) => roundCurrency(cost * markup)

export default function ImportacaoPage() {
    const params = useParams()
    const storeId = parseInt(params.storeId as string, 10)

    // Estados
    const [file, setFile] = useState<File | null>(null)
    const [previewData, setPreviewData] = useState<XmlPreviewData | null>(null)
    const [isProcessing, startTransition] = useTransition()
    const [isSaving, startSaveTransition] = useTransition()
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [sourceMode, setSourceMode] = useState<'local' | 'sefaz'>('local')
    const [queueItems, setQueueItems] = useState<NfeQueueItem[]>([])
    const [queueLoading, setQueueLoading] = useState(false)
    const [syncingSefaz, setSyncingSefaz] = useState(false)
    const [searchingKey, setSearchingKey] = useState(false)
    const [accessKeyInput, setAccessKeyInput] = useState('')
    const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null)
    const [lastSyncInfo, setLastSyncInfo] = useState<{ type: 'success' | 'error', message: string, details?: string } | null>(null)
    const [sefazDiagnostic, setSefazDiagnostic] = useState<Record<string, unknown> | null>(null)
    const [markupMultiplier, setMarkupMultiplier] = useState(DEFAULT_MARKUP)
    const [markupInput, setMarkupInput] = useState(String(DEFAULT_MARKUP).replace('.', ','))

    // Tabs & Filters
    const [activeTab, setActiveTab] = useState<'found' | 'new'>('new')

    // Estado para animação de arrastar
    const [isDragging, setIsDragging] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)

    const loadQueue = useCallback(async () => {
        setQueueLoading(true)
        try {
            const result = await listNfeImportQueue(storeId)
            if (!result.success) throw new Error(result.error)
            setQueueItems(result.data || [])
        } catch (error: unknown) {
            setErrorMessage("Erro ao carregar fila da SEFAZ: " + getErrorMessage(error))
        } finally {
            setQueueLoading(false)
        }
    }, [storeId])

    useEffect(() => {
        if (sourceMode === 'sefaz') {
            void loadQueue()
        }
    }, [sourceMode, loadQueue])

    const buildPreviewWithMarkup = useCallback((data: XmlPreviewData, markup: number): XmlPreviewData => ({
        ...data,
        itens: data.itens.map((item) => ({
            ...item,
            preco_venda: item.preco_venda ?? getSalePriceFromMarkup(item.valor_unitario, markup),
            preco_venda_editado: item.preco_venda_editado ?? false,
        })),
    }), [])

    // Estatísticas (Memoized)
    const stats = useMemo(() => {
        if (!previewData) return { found: 0, new: 0 }
        // Found tab only shows AUTOMATIC matches ('Encontrado')
        const found = previewData.itens.filter(i => i.status_sistema === 'Encontrado').length
        const total = previewData.itens.length
        return { found, new: total - found }
    }, [previewData])

    // Efeito para mudar aba automaticamente se não houver novos
    // useEffect(() => {
    //     if (stats.new === 0 && stats.found > 0) setActiveTab('found')
    // }, [stats.new, stats.found])

    // --- Actions ---

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) validateAndSetFile(e.target.files[0])
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setIsDragging(false)
        if (e.dataTransfer.files && e.dataTransfer.files[0]) validateAndSetFile(e.dataTransfer.files[0])
    }

    const validateAndSetFile = (file: File) => {
        if (file.type === "text/xml" || file.name.toLowerCase().endsWith(".xml")) {
            setFile(file)
            setErrorMessage(null)
            setSuccessMessage(null)
            setPreviewData(null)
            setMarkupMultiplier(DEFAULT_MARKUP)
            setMarkupInput(String(DEFAULT_MARKUP).replace('.', ','))
            setActiveTab('new') // Reset tab
        } else {
            setErrorMessage("Arquivo inválido. Por favor, envie um arquivo XML.")
        }
    }

    const handleProcessar = () => {
        if (!file) return
        const formData = new FormData()
        formData.append('xml_file', file)

        startTransition(async () => {
            const result = await parseNfeAndPreview(formData)
            if (result.success && result.data) {
                setMarkupMultiplier(DEFAULT_MARKUP)
                setMarkupInput(String(DEFAULT_MARKUP).replace('.', ','))
                setPreviewData(buildPreviewWithMarkup(result.data, DEFAULT_MARKUP))
                // Se detectar que maioria é 'Encontrado', pode mudar a tab se quiser, mas deixamos manual por enquanto
            } else {
                setErrorMessage(result.message || "Erro desconhecido ao ler XML.")
            }
        })
    }

    const parseXmlFromSefaz = (xmlText: string, queueId: string) => {
        const formData = new FormData()
        formData.append('xml_file', new File([xmlText], `sefaz-${queueId}.xml`, { type: 'text/xml' }))

        startTransition(async () => {
            const result = await parseNfeAndPreview(formData)
            if (result.success && result.data) {
                setMarkupMultiplier(DEFAULT_MARKUP)
                setMarkupInput(String(DEFAULT_MARKUP).replace('.', ','))
                setPreviewData(buildPreviewWithMarkup({ ...result.data, source_queue_id: queueId }, DEFAULT_MARKUP))
                setErrorMessage(null)
                setSuccessMessage(null)
                setActiveTab('new')
            } else {
                setErrorMessage(result.message || "Erro desconhecido ao ler XML da SEFAZ.")
            }
        })
    }

    const handleSyncSefaz = async () => {
        setSyncingSefaz(true)
        setErrorMessage(null)
        setSefazDiagnostic(null)
        try {
            const result = await syncNfeFromSefaz(storeId)
            if ('diagnostico' in result && result.diagnostico) {
                setSefazDiagnostic(result.diagnostico as Record<string, unknown>)
            }
            if (!result.success) throw new Error(result.error)
            await loadQueue()
            const loteInfo = result.initialSync && !result.initialSyncCompleted
                ? ' Primeira carga ainda em andamento; clique novamente para continuar o proximo lote.'
                : ''
            setLastSyncInfo({
                type: 'success',
                message: (result.inserted || 0) > 0
                    ? `${result.inserted} emissao(oes) nova(s) adicionada(s) na fila.`
                    : 'Verificacao concluida sem novas emissoes para importar.',
                details: `CNPJ: ${result.cpfCnpj || '-'} | Recebidas: ${result.received || 0} | Ja importadas: ${result.skippedDuplicated || 0} | Fora dos 60 dias iniciais: ${result.skippedOld || 0} | ultNSU: ${result.ultimoNsu || 0} | maxNSU: ${result.maxNsu || 0}.${loteInfo}`,
            })
        } catch (error: unknown) {
            setLastSyncInfo({ type: 'error', message: 'A verificacao de emissoes falhou.', details: getErrorMessage(error) })
        } finally {
            setSyncingSefaz(false)
        }
    }

    const handleSearchByKey = async () => {
        setSearchingKey(true)
        setErrorMessage(null)
        try {
            const result = await searchNfeByAccessKey(accessKeyInput, storeId)
            if (!result.success) throw new Error(result.error)

            if (result.alreadyImported) {
                setLastSyncInfo({ type: 'success', message: 'NF-e localizada, mas ja estava importada.', details: `CNPJ: ${result.cpfCnpj || '-'}` })
            } else if (result.found) {
                setLastSyncInfo({
                    type: 'success',
                    message: result.resumo ? 'NF-e localizada como resumo e adicionada na fila.' : 'NF-e localizada e adicionada na fila.',
                    details: `CNPJ: ${result.cpfCnpj || '-'} | Status: ${result.codigoStatus || '-'} ${result.motivoStatus || ''}`,
                })
            } else {
                setLastSyncInfo({ type: 'success', message: 'Nenhuma NF-e foi localizada para essa chave.', details: `CNPJ: ${result.cpfCnpj || '-'}` })
            }

            await loadQueue()
        } catch (error: unknown) {
            setLastSyncInfo({ type: 'error', message: 'A busca por chave falhou.', details: getErrorMessage(error) })
        } finally {
            setSearchingKey(false)
        }
    }

    const handleOpenQueueItem = async (queueItem: NfeQueueItem) => {
        setSelectedQueueId(queueItem.id)
        setErrorMessage(null)
        try {
            let result = await getNfeQueueXml(queueItem.id, storeId)
            if ((!result.success || !result.xmlContent) && queueItem.resumo && queueItem.chave_acesso) {
                const refreshed = await searchNfeByAccessKey(queueItem.chave_acesso, storeId)
                if (refreshed.success && refreshed.found && refreshed.queueId) {
                    result = await getNfeQueueXml(refreshed.queueId, storeId)
                }
            }
            if (!result.success || !result.xmlContent) throw new Error(result.error || 'XML nao encontrado.')
            parseXmlFromSefaz(result.xmlContent, queueItem.id)
        } catch (error: unknown) {
            setErrorMessage("Erro ao abrir XML da SEFAZ: " + getErrorMessage(error))
            await loadQueue()
        } finally {
            setSelectedQueueId(null)
        }
    }

    const handleCopyAccessKey = async (chaveAcesso: string) => {
        try {
            await navigator.clipboard.writeText(chaveAcesso)
            setLastSyncInfo({ type: 'success', message: 'Chave de acesso copiada.' })
        } catch {
            setLastSyncInfo({ type: 'error', message: `Nao foi possivel copiar automaticamente. Chave: ${chaveAcesso}` })
        }
    }

    const handleConfirmarImportacao = () => {
        if (!previewData) return
        if (!confirm("Tem certeza? Isso irá cadastrar/atualizar o estoque dos produtos listados.")) return

        startSaveTransition(async () => {
            const result = await saveImportedData(previewData, storeId)
            if (result.success) {
                setSuccessMessage(result.message!)
                setPreviewData(null)
                setFile(null)
                setMarkupMultiplier(DEFAULT_MARKUP)
                setMarkupInput(String(DEFAULT_MARKUP).replace('.', ','))
            } else {
                setErrorMessage(result.message || "Erro ao salvar dados.")
            }
        })
    }

    const handleReset = () => {
        setFile(null)
        setPreviewData(null)
        setSuccessMessage(null)
        setErrorMessage(null)
        setMarkupMultiplier(DEFAULT_MARKUP)
        setMarkupInput(String(DEFAULT_MARKUP).replace('.', ','))
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // --- Advanced Features Actions ---

    const handleManualLink = (index: number, product: ManualMatchProduct) => {
        if (!previewData) return
        const newItens = [...previewData.itens]
        newItens[index] = {
            ...newItens[index],
            status_sistema: 'Vinculado',
            manual_match_id: product.id,
            id_sistema: product.id, // Set id_sistema for manual matches too
            estoque_atual: product.estoque_atual, // Visual only
            original_system_name: product.nome,
            use_xml_name: false // Default to Keeping System Name when linking
        }
        setPreviewData({ ...previewData, itens: newItens })
    }

    const handleUnlink = (index: number) => {
        if (!previewData) return
        const newItens = [...previewData.itens]

        newItens[index] = {
            ...newItens[index],
            status_sistema: 'Novo',
            manual_match_id: null,
            original_system_name: undefined,
            id_sistema: undefined
        }
        setPreviewData({ ...previewData, itens: newItens })
    }

    const toggleNameOverride = (index: number) => {
        if (!previewData) return
        const newItens = [...previewData.itens]
        newItens[index] = {
            ...newItens[index],
            use_xml_name: !newItens[index].use_xml_name
        }
        setPreviewData({ ...previewData, itens: newItens })
    }

    const toggleIgnoreItem = (index: number) => {
        if (!previewData) return
        const newItens = [...previewData.itens]
        const currentItem = newItens[index]
        newItens[index] = {
            ...currentItem,
            skip_import: !currentItem.skip_import
        }
        setPreviewData({ ...previewData, itens: newItens })
    }

    const handleMarkupChange = (value: string) => {
        setMarkupInput(value)

        const normalizedValue = value.replace(',', '.')
        const nextMarkup = Number(normalizedValue)
        if (!Number.isFinite(nextMarkup) || nextMarkup <= 0) return

        setMarkupMultiplier(nextMarkup)
        if (!previewData) return

        setPreviewData({
            ...previewData,
            itens: previewData.itens.map((item) => (
                item.preco_venda_editado
                    ? item
                    : {
                        ...item,
                        preco_venda: getSalePriceFromMarkup(item.valor_unitario, nextMarkup),
                    }
            )),
        })
    }

    const handleSalePriceChange = (index: number, value: string) => {
        if (!previewData) return

        const normalizedValue = value.replace(',', '.')
        const parsedValue = Number(normalizedValue)
        const nextValue = Number.isFinite(parsedValue) ? roundCurrency(Math.max(parsedValue, 0)) : 0
        const newItens = [...previewData.itens]
        newItens[index] = {
            ...newItens[index],
            preco_venda: nextValue,
            preco_venda_editado: true,
        }
        setPreviewData({ ...previewData, itens: newItens })
    }

    // --- Render Lists ---

    const filteredItems = previewData?.itens.map((item, originalIndex) => ({ ...item, originalIndex })).filter(item => {
        if (activeTab === 'found') return item.status_sistema === 'Encontrado'
        // 'new' tab shows 'Novo' AND 'Vinculado' (manual matches)
        return item.status_sistema === 'Novo' || item.status_sistema === 'Vinculado'
    }) || []

    return (
        <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-64px)] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="mb-6 flex items-center gap-4 flex-shrink-0">
                <Link
                    href={`/dashboard/loja/${storeId}?menu=loja-vazia`}
                    className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                    title="Voltar para o Painel"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                        <FileText className="h-6 w-6 text-indigo-400" />
                        Importação de Nota Fiscal (XML)
                    </h1>
                    <p className="text-sm text-slate-400">Cadastre produtos e estoque automaticamente.</p>
                </div>
            </div>

            {/* Messages */}
            {errorMessage && (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 text-red-300 rounded-lg backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                    <AlertTriangle className="h-5 w-5" /> {errorMessage}
                </div>
            )}

            {successMessage && (
                <div className="mb-4 p-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 rounded-xl backdrop-blur-md flex flex-col items-center justify-center text-center animate-in zoom-in duration-300">
                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-3">
                        <CheckCircle className="h-8 w-8 text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold text-emerald-100 mb-1">Sucesso!</h3>
                    <p className="mb-4 text-emerald-300">{successMessage}</p>
                    <button onClick={handleReset} className="bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-100 px-6 py-2 rounded-lg font-bold border border-emerald-500/30 backdrop-blur-md transition-colors">
                        Importar Outra Nota
                    </button>
                </div>
            )}

            {/* Upload Area */}
            {!previewData && !successMessage && (
                <>
                <div className="mb-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 flex-shrink-0">
                    <div className="flex gap-2 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
                        <button
                            type="button"
                            onClick={() => setSourceMode('local')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${sourceMode === 'local' ? 'bg-indigo-600/30 text-indigo-100 border border-indigo-500/30' : 'text-slate-400 hover:text-slate-100'}`}
                        >
                            Arquivo local
                        </button>
                        <button
                            type="button"
                            onClick={() => setSourceMode('sefaz')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${sourceMode === 'sefaz' ? 'bg-emerald-600/25 text-emerald-100 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-100'}`}
                        >
                            Consulta SEFAZ
                        </button>
                    </div>
                </div>

                {sourceMode === 'local' && (
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl transition-all duration-200 p-10 group backdrop-blur-md
                        ${isDragging ? 'border-indigo-400 bg-indigo-500/10 scale-[1.01]' : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'}`}
                    >
                    <div className={`p-4 rounded-full mb-4 transition-transform ${isDragging ? 'bg-indigo-500/20 scale-110' : 'bg-white/10 group-hover:scale-110'}`}>
                        <UploadCloud className={`h-10 w-10 ${isDragging ? 'text-indigo-300' : 'text-slate-400'}`} />
                    </div>
                    <label className="block text-center cursor-pointer">
                        <span className="text-lg font-semibold text-slate-200">
                            {isDragging ? "Pode soltar o XML agora!" : "Clique para selecionar o arquivo XML"}
                        </span>
                        <span className="block text-sm text-slate-500 mt-1">
                            {isDragging ? "Solte para processar" : "ou arraste e solte aqui"}
                        </span>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xml"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </label>

                    {file && (
                        <div className="mt-6 flex items-center gap-3 bg-white/5 px-4 py-2 rounded-lg border border-indigo-500/20 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
                            <FileText className="h-5 w-5 text-indigo-400" />
                            <span className="font-medium text-slate-200">{file.name}</span>
                            <span className="text-xs text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                    )}

                    {file && (
                        <button
                            onClick={handleProcessar}
                            disabled={isProcessing}
                            className="mt-6 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-100 px-8 py-3 rounded-lg font-bold border border-indigo-500/30 backdrop-blur-md flex items-center gap-2 disabled:opacity-50 transition-colors"
                        >
                            {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : "PROCESSAR ARQUIVO"}
                        </button>
                    )}
                    </div>
                )}

                {sourceMode === 'sefaz' && (
                    <div className="flex-1 overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-md">
                        <div className="p-4 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/30">
                            <div>
                                <h2 className="font-bold text-slate-100 flex items-center gap-2"><Inbox className="h-5 w-5 text-emerald-400" /> Emissoes contra o CNPJ</h2>
                                <p className="text-xs text-slate-400 mt-1">Consulta NF-e emitida contra o CNPJ fiscal da loja logada e adiciona o XML na importacao.</p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <div className="flex rounded-lg border border-white/10 bg-slate-950/30 overflow-hidden">
                                    <input
                                        value={accessKeyInput}
                                        onChange={(e) => setAccessKeyInput(e.target.value)}
                                        placeholder="Chave de acesso"
                                        className="bg-transparent px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none w-72 max-w-full"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSearchByKey}
                                        disabled={searchingKey || accessKeyInput.replace(/\D/g, '').length !== 44}
                                        className="px-3 py-2 text-sm font-bold text-indigo-100 bg-indigo-600/20 border-l border-white/10 disabled:opacity-40"
                                    >
                                        {searchingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                    </button>
                                </div>
                                <button
                                    onClick={handleSyncSefaz}
                                    disabled={syncingSefaz || queueLoading}
                                    className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-100 rounded-lg font-bold border border-emerald-500/40 flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {syncingSefaz ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                    Verificar novas
                                </button>
                            </div>
                        </div>

                        {lastSyncInfo && (
                            <div className={`m-4 p-3 rounded-lg border text-sm ${lastSyncInfo.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-300' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'}`}>
                                <p className="font-bold">{lastSyncInfo.message}</p>
                                {lastSyncInfo.details && <p className="text-xs opacity-80 mt-1">{lastSyncInfo.details}</p>}
                            </div>
                        )}

                        {sefazDiagnostic && (
                            <details className="mx-4 mb-4 rounded-lg border border-sky-500/20 bg-sky-500/5 text-sky-100">
                                <summary className="cursor-pointer px-4 py-3 text-sm font-bold">
                                    Diagnostico da consulta Nuvem Fiscal / SEFAZ
                                </summary>
                                <div className="border-t border-sky-500/20 p-4">
                                    <p className="mb-3 text-xs text-sky-200/70">
                                        Nao inclui token, senha ou certificado. O campo request mostra exatamente o payload enviado para a Nuvem Fiscal.
                                    </p>
                                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950/70 p-3 text-xs text-slate-200">
                                        {JSON.stringify(sefazDiagnostic, null, 2)}
                                    </pre>
                                </div>
                            </details>
                        )}

                        <div className="overflow-auto h-[calc(100%-88px)]">
                            {queueLoading ? (
                                <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
                                    <Loader2 className="animate-spin text-emerald-400" />
                                    <p className="text-sm">Carregando fila...</p>
                                </div>
                            ) : queueItems.length === 0 ? (
                                <div className="py-16 flex flex-col items-center gap-3 text-slate-500">
                                    <Inbox className="h-10 w-10 text-slate-600" />
                                    <p className="text-sm">Clique em Verificar novas para consultar a SEFAZ.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-white/5">
                                    {queueItems.map((note) => (
                                        <div key={note.id} className="p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 hover:bg-white/5">
                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-100 truncate">{note.emitente_nome || 'Fornecedor nao identificado'}</p>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    NF {note.numero || '-'} {note.data_emissao ? `- ${new Date(note.data_emissao).toLocaleDateString('pt-BR')}` : ''} - Chave {note.chave_acesso}
                                                </p>
                                                {note.resumo && <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1 mt-2 inline-flex">XML ainda veio como resumo; ao baixar, o sistema envia ciencia da operacao.</p>}
                                                {note.xml_completo_disponivel && <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1 mt-2 inline-flex">XML completo disponivel.</p>}
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
                                                <span className="font-bold text-slate-100 text-right">{money(Number(note.valor_total || 0))}</span>
                                                <button type="button" onClick={() => handleCopyAccessKey(note.chave_acesso)} className="px-3 py-2 rounded-lg text-xs font-bold border border-white/10 text-slate-300 hover:bg-white/10 flex items-center justify-center gap-2">
                                                    <Copy className="h-4 w-4" /> Copiar
                                                </button>
                                                <button type="button" onClick={() => handleOpenQueueItem(note)} disabled={isProcessing || selectedQueueId === note.id} className="px-3 py-2 rounded-lg text-xs font-bold border border-emerald-500/40 bg-emerald-600/20 text-emerald-100 hover:bg-emerald-600/30 flex items-center justify-center gap-2 disabled:opacity-50">
                                                    {selectedQueueId === note.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
                                                    Baixar/importar XML
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                </>
            )}

            {/* Preview Area */}
            {previewData && !successMessage && (
                <div className="flex-1 flex flex-col overflow-hidden bg-white/5 rounded-xl border border-white/10 backdrop-blur-md animate-in fade-in slide-in-from-bottom-4">

                    {/* Invoice Summary */}
                    <div className="p-4 border-b border-white/10 bg-slate-900/40 flex justify-between items-center flex-shrink-0 gap-4">
                        <div className="flex gap-6">
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Fornecedor</p>
                                <p className="font-bold text-slate-100">{previewData.fornecedor.fantasia}</p>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${previewData.fornecedor.status_sistema === 'Novo' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'}`}>
                                    {previewData.fornecedor.status_sistema}
                                </span>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Nota Fiscal</p>
                                <p className="text-sm text-slate-300">Nº {previewData.nfe_numero} - Série {previewData.nfe_serie}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="min-w-[180px]">
                                <label className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-2">
                                    Markup PadrÃ£o
                                </label>
                                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                                    <span className="text-sm font-bold text-slate-300">x</span>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={markupInput.replace(',', '.')}
                                        onChange={(e) => handleMarkupChange(e.target.value)}
                                        className="w-full bg-transparent text-sm font-bold text-emerald-300 outline-none"
                                    />
                                </div>
                                <p className="mt-1 text-[10px] text-slate-500">
                                    Atualiza os itens que ainda nÃ£o tiveram venda editada manualmente.
                                </p>
                            </div>
                            <div className="text-right">
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total dos Produtos</p>
                                <p className="text-xl font-black text-slate-300">
                                    {money(previewData.itens.filter((i) => !i.skip_import).reduce((acc, i) => acc + i.valor_total, 0))}
                                </p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                {previewData.itens.filter((i) => !i.skip_import).length} item(ns) ativos
                                {previewData.itens.some((i) => i.skip_import) ? ` • ${previewData.itens.filter((i) => i.skip_import).length} ignorado(s)` : ''}
                            </p>
                            </div>
                        </div>
                    </div>

                    {/* Stats & Tabs */}
                    <div className="flex items-center gap-4 px-4 py-3 bg-slate-900/20 border-b border-white/5">
                        <button
                            onClick={() => setActiveTab('new')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border
                                ${activeTab === 'new'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 shadow-lg shadow-amber-900/20'
                                    : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10 hover:text-slate-200'}`}
                        >
                            <AlertCircle className="h-4 w-4" />
                            Novos ({stats.new})
                        </button>
                        <button
                            onClick={() => setActiveTab('found')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border
                                ${activeTab === 'found'
                                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 shadow-lg shadow-indigo-900/20'
                                    : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10 hover:text-slate-200'}`}
                        >
                            <LinkIcon className="h-4 w-4" />
                            Encontrados ({stats.found})
                        </button>
                    </div>

                    {/* Items List */}
                    <div className="flex-1 overflow-auto custom-scrollbar p-0 relative">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[#0f172a] shadow-md sticky top-0 z-20 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-3 border-b border-white/5 w-[45%]">Produto</th>
                                    <th className="px-4 py-3 border-b border-white/5 text-right w-[10%]">Qtd</th>
                                    <th className="px-4 py-3 border-b border-white/5 text-right w-[15%]">Custo</th>
                                    <th className="px-4 py-3 border-b border-white/5 text-right text-emerald-400 w-[15%]">Venda</th>
                                    <th className="px-4 py-3 border-b border-white/5 text-right w-[15%]">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredItems.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-10 text-center text-slate-500 italic">
                                            Nenhum item nesta lista.
                                        </td>
                                    </tr>
                                )}
                                {filteredItems.map((item) => (
                                    <tr key={item.originalIndex} className={`transition-colors group ${item.skip_import ? 'bg-rose-500/5' : 'hover:bg-white/5'}`}>

                                        {/* Coluna 1: Informações do Produto e Vínculo */}
                                        <td className="px-6 py-4 align-top">
                                            <div className="flex flex-col gap-1">
                                                {/* Nome na Nota */}
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-slate-500 border border-slate-700 rounded px-1">XML</span>
                                                    <span className={`font-medium ${item.skip_import ? 'text-slate-500 line-through' : item.use_xml_name ? 'text-emerald-400' : 'text-slate-300'}`}>
                                                        {item.descricao}
                                                    </span>
                                                    {item.status_sistema === 'Novo' && (
                                                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 rounded border border-amber-500/30">Novo</span>
                                                    )}
                                                    {item.skip_import && (
                                                        <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 rounded border border-rose-500/30">Ignorado</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-slate-500 font-mono pl-10">
                                                    Código: {item.codigo_fornecedor} | EAN: {item.codigo_barras || 'S/ GTIN'} | NCM: {item.ncm}
                                                </div>

                                                {/* Nome no Sistema (se Encontrado Automaticamente) */}
                                                {activeTab === 'found' && (
                                                    <div className="mt-2 pl-10 pt-2 border-t border-white/5 relative">
                                                        <div className="absolute left-2 top-3 border-l-2 border-b-2 border-slate-700 w-4 h-4 rounded-bl" />
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-bold text-indigo-400 border border-indigo-900/50 bg-indigo-900/20 rounded px-1">SISTEMA</span>
                                                            <span className={`font-medium ${!item.use_xml_name ? 'text-indigo-300' : 'text-slate-500 line-through'}`}>
                                                                {item.original_system_name || item.descricao}
                                                            </span>
                                                        </div>
                                                        {/* Toggle de Nome */}
                                                        <label className="flex items-center gap-2 mt-2 cursor-pointer w-fit group/label">
                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${item.use_xml_name ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500 group-hover/label:border-slate-400'}`}>
                                                                {item.use_xml_name && <Check className="h-3 w-3 text-white" />}
                                                            </div>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!item.use_xml_name}
                                                                onChange={() => toggleNameOverride(item.originalIndex)}
                                                                className="hidden"
                                                            />
                                                            <span className={`text-xs ${item.use_xml_name ? 'text-emerald-400' : 'text-slate-400 group-hover/label:text-slate-300'} transition-colors`}>
                                                                Usar nome da nota no cadastro
                                                            </span>
                                                        </label>
                                                    </div>
                                                )}

                                                {/* Search Box + Controls (se Novo/Vinculado) */}
                                                {activeTab === 'new' && (
                                                    <div className="mt-2 pl-10">
                                                        {item.status_sistema === 'Vinculado' ? (
                                                            <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 p-2 rounded-lg animate-in fade-in slide-in-from-left-2">
                                                                <LinkIcon className="h-4 w-4 text-indigo-400" />
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] font-bold text-indigo-400 border border-indigo-900/50 bg-indigo-900/20 rounded px-1">VINCULADO A</span>
                                                                        <p className="text-sm font-bold text-indigo-300 truncate">
                                                                            {item.original_system_name}
                                                                        </p>
                                                                    </div>
                                                                    <div className="flex gap-3 mt-1 pl-1">
                                                                        <label className="flex items-center gap-1.5 cursor-pointer hover:bg-white/5 p-1 rounded transition-colors group/label" title="Usar nome do XML no cadastro">
                                                                            <div className={`w-3 h-3 rounded-[3px] border flex items-center justify-center transition-colors ${item.use_xml_name ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500 group-hover/label:border-slate-400'}`}>
                                                                                {item.use_xml_name && <Check className="h-2 w-2 text-white" />}
                                                                            </div>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={!!item.use_xml_name}
                                                                                onChange={() => toggleNameOverride(item.originalIndex)}
                                                                                className="hidden"
                                                                            />
                                                                            <span className={`text-[10px] ${item.use_xml_name ? 'text-emerald-400' : 'text-slate-500 group-hover/label:text-slate-300'}`}>
                                                                                Usar nome da nota
                                                                            </span>
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => handleUnlink(item.originalIndex)}
                                                                    className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-500/30"
                                                                    title="Desfazer vínculo (Voltar para Novo)"
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <ProductSearchCombobox
                                                                storeId={storeId}
                                                                onSelect={(prod) => handleManualLink(item.originalIndex, prod)}
                                                                onCancel={() => { }}
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {/* Qtd */}
                                        <td className="px-4 py-4 text-right align-top">
                                            <span className="font-bold text-slate-200 bg-white/5 px-2 py-1 rounded">
                                                {item.quantidade}
                                            </span>
                                        </td>

                                        {/* Custo */}
                                        <td className="px-4 py-4 text-right align-top text-slate-300">
                                            {money(item.valor_unitario)}
                                        </td>

                                        {/* Venda */}
                                        <td className="px-4 py-4 text-right align-top">
                                            <div className="flex flex-col items-end gap-1">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={(item.preco_venda ?? getSalePriceFromMarkup(item.valor_unitario, markupMultiplier)).toFixed(2)}
                                                    onChange={(e) => handleSalePriceChange(item.originalIndex, e.target.value)}
                                                    className="w-28 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-right font-bold text-emerald-300 outline-none"
                                                />
                                                {item.preco_venda_editado ? (
                                                    <span className="text-[10px] uppercase tracking-wider text-amber-300">
                                                        Editado
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                                                        Markup x{markupMultiplier.toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Ações (Only for auto-matches in Found tab) */}
                                        <td className="px-4 py-4 text-right align-top">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    onClick={() => toggleIgnoreItem(item.originalIndex)}
                                                    className={`p-2 rounded transition-colors ${item.skip_import ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30' : 'hover:bg-rose-500/20 text-slate-400 hover:text-rose-400'}`}
                                                    title={item.skip_import ? 'Voltar a importar este produto' : 'Ignorar este produto na importação'}
                                                >
                                                    {item.skip_import ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                                                </button>
                                                {activeTab === 'found' && (
                                                    <button
                                                        onClick={() => handleUnlink(item.originalIndex)}
                                                        className="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded transition-colors"
                                                        title="Desvincular produto"
                                                    >
                                                        <Unlink className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 bg-slate-900/60 backdrop-blur-xl border-t border-white/5 flex justify-end gap-3 flex-shrink-0">
                        <button
                            onClick={handleReset}
                            className="px-4 py-2 border border-white/10 rounded-lg text-slate-300 hover:bg-white/5 font-bold text-sm transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmarImportacao}
                            disabled={isSaving}
                            className="px-6 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-100 rounded-lg font-bold border border-emerald-500/50 backdrop-blur-md flex items-center gap-2 disabled:opacity-70 transition-colors"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            CONFIRMAR IMPORTAÇÃO
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
