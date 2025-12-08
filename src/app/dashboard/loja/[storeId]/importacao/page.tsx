'use client'

import { useState, useTransition, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { UploadCloud, FileText, CheckCircle, AlertTriangle, Loader2, Save, ArrowLeft, Package } from 'lucide-react'
import { parseNfeAndPreview, saveImportedData, type XmlPreviewData } from '@/lib/actions/xml.actions'

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
    
    // Estado para animação de arrastar
    const [isDragging, setIsDragging] = useState(false)
    
    const fileInputRef = useRef<HTMLInputElement>(null)

    // 1. Lidar com Seleção via Clique
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            validateAndSetFile(e.target.files[0])
        }
    }

    // 2. Lidar com Arrastar e Soltar (Drag & Drop)
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault() // Impede o navegador de abrir o arquivo
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault() // Impede o navegador de abrir o arquivo
        e.stopPropagation()
        setIsDragging(false)

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndSetFile(e.dataTransfer.files[0])
        }
    }

    const validateAndSetFile = (file: File) => {
        // Validação simples de tipo (XML)
        if (file.type === "text/xml" || file.name.toLowerCase().endsWith(".xml")) {
            setFile(file)
            setErrorMessage(null)
            setSuccessMessage(null)
            setPreviewData(null)
        } else {
            setErrorMessage("Arquivo inválido. Por favor, envie um arquivo XML.")
        }
    }

    // 3. Enviar para Leitura (Preview)
    const handleProcessar = () => {
        if (!file) return
        
        const formData = new FormData()
        formData.append('xml_file', file)

        startTransition(async () => {
            const result = await parseNfeAndPreview(formData)
            if (result.success && result.data) {
                setPreviewData(result.data)
            } else {
                setErrorMessage(result.message || "Erro desconhecido ao ler XML.")
            }
        })
    }

    // 4. Confirmar e Gravar no Banco
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

    // --- RENDERIZAÇÃO ---

    return (
        <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-64px)] flex flex-col overflow-hidden">
            
            {/* Cabeçalho */}
            <div className="mb-6 flex justify-between items-center flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <FileText className="h-6 w-6 text-blue-600" /> 
                        Importação de Nota Fiscal (XML)
                    </h1>
                    <p className="text-sm text-gray-500">Cadastre produtos e estoque automaticamente.</p>
                </div>
                <button 
                    onClick={() => router.back()}
                    className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 px-3 py-2 rounded border hover:bg-gray-50 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" /> Voltar
                </button>
            </div>

            {/* Mensagens de Sucesso/Erro */}
            {errorMessage && (
                <div className="mb-4 p-4 bg-red-100 border border-red-200 text-red-700 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                    <AlertTriangle className="h-5 w-5" /> {errorMessage}
                </div>
            )}
            
            {successMessage && (
                <div className="mb-4 p-6 bg-green-50 border border-green-200 text-green-800 rounded-xl flex flex-col items-center justify-center text-center animate-in zoom-in duration-300">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-3">
                        <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="text-xl font-bold mb-1">Sucesso!</h3>
                    <p className="mb-4">{successMessage}</p>
                    <button onClick={handleReset} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 shadow-sm">
                        Importar Outra Nota
                    </button>
                </div>
            )}

            {/* ÁREA 1: UPLOAD (Se não houver preview e não for sucesso) */}
            {!previewData && !successMessage && (
                <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl transition-all duration-200 p-10 group 
                        ${isDragging ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-300 bg-gray-50 hover:bg-blue-50'}`}
                >
                    <div className={`p-4 rounded-full shadow-sm mb-4 transition-transform ${isDragging ? 'bg-blue-200 scale-110' : 'bg-white group-hover:scale-110'}`}>
                        <UploadCloud className={`h-10 w-10 ${isDragging ? 'text-blue-700' : 'text-blue-500'}`} />
                    </div>
                    <label className="block text-center cursor-pointer">
                        <span className="text-lg font-semibold text-gray-700">
                            {isDragging ? "Pode soltar o XML agora!" : "Clique para selecionar o arquivo XML"}
                        </span>
                        <span className="block text-sm text-gray-400 mt-1">
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
                        <div className="mt-6 flex items-center gap-3 bg-white px-4 py-2 rounded-lg shadow-sm border border-blue-200 animate-in fade-in slide-in-from-bottom-2">
                            <FileText className="h-5 w-5 text-blue-600" />
                            <span className="font-medium text-gray-800">{file.name}</span>
                            <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                    )}

                    {file && (
                        <button 
                            onClick={handleProcessar}
                            disabled={isProcessing}
                            className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold shadow-md flex items-center gap-2 disabled:opacity-50"
                        >
                            {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : "PROCESSAR ARQUIVO"}
                        </button>
                    )}
                </div>
            )}

            {/* ÁREA 2: PREVIEW (Tabela de Conferência) */}
            {previewData && !successMessage && (
                <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-xl shadow border border-gray-200 animate-in fade-in slide-in-from-bottom-4">
                    
                    {/* Resumo da Nota */}
                    <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center flex-shrink-0">
                        <div className="flex gap-6">
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-bold">Fornecedor</p>
                                <p className="font-bold text-gray-800">{previewData.fornecedor.fantasia}</p>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${previewData.fornecedor.status_sistema === 'Novo' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                                    {previewData.fornecedor.status_sistema}
                                </span>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-bold">Nota Fiscal</p>
                                <p className="text-sm text-gray-700">Nº {previewData.nfe_numero} - Série {previewData.nfe_serie}</p>
                            </div>
                        </div>

                        <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase font-bold">Total dos Produtos</p>
                            <p className="text-xl font-black text-blue-700">
                                {money(previewData.itens.reduce((acc, i) => acc + i.valor_total, 0))}
                            </p>
                        </div>
                    </div>

                    {/* Tabela de Itens */}
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white sticky top-0 z-10 shadow-sm text-xs font-bold text-gray-500 uppercase">
                                <tr>
                                    <th className="px-4 py-3 border-b">Status</th>
                                    <th className="px-4 py-3 border-b">Cód. Forn.</th>
                                    <th className="px-4 py-3 border-b">Descrição</th>
                                    <th className="px-4 py-3 border-b">NCM</th>
                                    <th className="px-4 py-3 border-b text-center">Qtd</th>
                                    <th className="px-4 py-3 border-b text-right">Custo Unit.</th>
                                    <th className="px-4 py-3 border-b text-right text-emerald-600">Venda Sugerida</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {previewData.itens.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-blue-50 transition-colors">
                                        <td className="px-4 py-3">
                                            {item.status_sistema === 'Novo' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700 text-xs font-bold border border-green-200">
                                                    <Package className="h-3 w-3" /> Novo
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200">
                                                    <CheckCircle className="h-3 w-3" /> Somar ({item.estoque_atual})
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.codigo_fornecedor}</td>
                                        <td className="px-4 py-3 font-medium text-gray-800">{item.descricao}</td>
                                        <td className="px-4 py-3 text-gray-500">{item.ncm}</td>
                                        <td className="px-4 py-3 text-center font-bold bg-gray-50">{item.quantidade}</td>
                                        <td className="px-4 py-3 text-right">{money(item.valor_unitario)}</td>
                                        <td className="px-4 py-3 text-right font-bold text-emerald-600 bg-emerald-50/30">
                                            {money(item.valor_unitario * 2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer de Ação */}
                    <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 flex-shrink-0">
                        <button 
                            onClick={handleReset}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-white font-bold text-sm"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleConfirmarImportacao}
                            disabled={isSaving}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md flex items-center gap-2 disabled:opacity-70"
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