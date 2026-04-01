'use client'

import { useState, useTransition, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { UploadCloud, FileText, CheckCircle, AlertTriangle, Loader2, Save, ArrowLeft, Package, Search, Link as LinkIcon, Unlink, AlertCircle, X, Check } from 'lucide-react'
import { parseNfeAndPreview, saveImportedData, type XmlPreviewData } from '@/lib/actions/xml.actions'
import { ProductSearchCombobox } from '@/components/importacao/ProductSearchCombobox'

// Helper para formatar moeda
const money = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ImportacaoPage() {
    const params = useParams()
    const router = useRouter()
    const storeId = parseInt(params.storeId as string, 10)

    // Estados
    const [file, setFile] = useState<File | null>(null)
    const [previewData, setPreviewData] = useState<XmlPreviewData | null>(null)
    const [isProcessing, startTransition] = useTransition()
    const [isSaving, startSaveTransition] = useTransition()
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    // Tabs & Filters
    const [activeTab, setActiveTab] = useState<'found' | 'new'>('new')

    // Estado para animação de arrastar
    const [isDragging, setIsDragging] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)

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
                setPreviewData(result.data)
                // Se detectar que maioria é 'Encontrado', pode mudar a tab se quiser, mas deixamos manual por enquanto
            } else {
                setErrorMessage(result.message || "Erro desconhecido ao ler XML.")
            }
        })
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
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // --- Advanced Features Actions ---

    const handleManualLink = (index: number, product: any) => {
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

    // --- Render Lists ---

    const filteredItems = previewData?.itens.map((item, originalIndex) => ({ ...item, originalIndex })).filter(item => {
        if (activeTab === 'found') return item.status_sistema === 'Encontrado'
        // 'new' tab shows 'Novo' AND 'Vinculado' (manual matches)
        return item.status_sistema === 'Novo' || item.status_sistema === 'Vinculado'
    }) || []

    return (
        <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-64px)] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="mb-6 flex justify-between items-center flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                        <FileText className="h-6 w-6 text-indigo-400" />
                        Importação de Nota Fiscal (XML)
                    </h1>
                    <p className="text-sm text-slate-400">Cadastre produtos e estoque automaticamente.</p>
                </div>
                <button
                    onClick={() => router.back()}
                    className="text-sm text-slate-300 hover:text-white flex items-center gap-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-md transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" /> Voltar
                </button>
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

            {/* Preview Area */}
            {previewData && !successMessage && (
                <div className="flex-1 flex flex-col overflow-hidden bg-white/5 rounded-xl border border-white/10 backdrop-blur-md animate-in fade-in slide-in-from-bottom-4">

                    {/* Invoice Summary */}
                    <div className="p-4 border-b border-white/10 bg-slate-900/40 flex justify-between items-center flex-shrink-0">
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

                        <div className="text-right">
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total dos Produtos</p>
                            <p className="text-xl font-black text-emerald-400">
                                {money(previewData.itens.reduce((acc, i) => acc + i.valor_total, 0))}
                            </p>
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
                                    <tr key={item.originalIndex} className="hover:bg-white/5 transition-colors group">

                                        {/* Coluna 1: Informações do Produto e Vínculo */}
                                        <td className="px-6 py-4 align-top">
                                            <div className="flex flex-col gap-1">
                                                {/* Nome na Nota */}
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-slate-500 border border-slate-700 rounded px-1">XML</span>
                                                    <span className={`font-medium ${item.use_xml_name ? 'text-emerald-400' : 'text-slate-300'}`}>
                                                        {item.descricao}
                                                    </span>
                                                    {item.status_sistema === 'Novo' && (
                                                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 rounded border border-amber-500/30">Novo</span>
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
                                        <td className="px-4 py-4 text-right align-top font-bold text-emerald-400">
                                            {money(item.valor_unitario * 2)}
                                        </td>

                                        {/* Ações (Only for auto-matches in Found tab) */}
                                        <td className="px-4 py-4 text-right align-top">
                                            {activeTab === 'found' && (
                                                <button
                                                    onClick={() => handleUnlink(item.originalIndex)}
                                                    className="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded transition-colors"
                                                    title="Desvincular produto"
                                                >
                                                    <Unlink className="h-4 w-4" />
                                                </button>
                                            )}
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
