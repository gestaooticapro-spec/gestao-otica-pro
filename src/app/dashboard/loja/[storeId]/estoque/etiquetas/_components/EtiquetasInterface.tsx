'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    Printer, Trash2, Plus, Minus, Package, Tag,
    AlertTriangle, ArrowRight, Sparkles, X, Settings2,
    FileDown, RotateCcw, ChevronDown, ChevronUp, ArrowLeft
} from 'lucide-react'
import { LabelQueueItem, addToLabelQueue, removeFromLabelQueue, updateLabelQuantity, clearLabelQueue } from '@/lib/actions/labels.actions'
import { LABEL_TEMPLATES } from '@/lib/label-generator'

type Suggestion = {
    product_id: number
    variant_id: number | null
    product_name: string
    product_barcode: string | null
    quantity: number
    movement_date: string
}

interface EtiquetasInterfaceProps {
    storeId: number
    initialQueue: LabelQueueItem[]
    suggestions: Suggestion[]
}

export default function EtiquetasInterface({ storeId, initialQueue, suggestions }: EtiquetasInterfaceProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const queue = initialQueue
    const [templateCode, setTemplateCode] = useState(LABEL_TEMPLATES[0].code)
    const [startPosition, setStartPosition] = useState(1)
    const [codeType, setCodeType] = useState<'barcode' | 'qrcode'>('qrcode')
    const [generating, setGenerating] = useState(false)
    const [showSuggestions, setShowSuggestions] = useState(true)
    const [showSettings, setShowSettings] = useState(false)

    const selectedTemplate = LABEL_TEMPLATES.find(t => t.code === templateCode)!
    const labelsPerPage = selectedTemplate.columns * selectedTemplate.rows
    const totalLabels = queue.reduce((sum, item) => sum + item.quantity, 0)

    const handleAddSuggestion = async (sug: Suggestion) => {
        startTransition(async () => {
            const result = await addToLabelQueue(storeId, sug.product_id, sug.variant_id, sug.quantity)
            if (result.success) router.refresh()
        })
    }

    const handleAddAll = async () => {
        startTransition(async () => {
            for (const sug of suggestions) {
                await addToLabelQueue(storeId, sug.product_id, sug.variant_id, sug.quantity)
            }
            router.refresh()
        })
    }

    const handleRemove = async (itemId: number) => {
        startTransition(async () => {
            await removeFromLabelQueue(itemId, storeId)
            router.refresh()
        })
    }

    const handleUpdateQty = async (itemId: number, newQty: number) => {
        startTransition(async () => {
            await updateLabelQuantity(itemId, newQty, storeId)
            router.refresh()
        })
    }

    const handleClear = async () => {
        if (!confirm('Limpar toda a fila de etiquetas?')) return
        startTransition(async () => {
            await clearLabelQueue(storeId)
            router.refresh()
        })
    }

    const handleGenerate = async () => {
        if (queue.length === 0) return
        setGenerating(true)

        try {
            const items = queue.map(item => ({
                productName: item.product_name,
                barcode: item.product_barcode,
                price: item.product_price,
                ref: item.product_ref,
                quantity: item.quantity
            }))

            const response = await fetch('/api/labels/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items, templateCode, startPosition, codeType })
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Erro ao gerar PDF')
            }

            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            window.open(url, '_blank')
        } catch (err: any) {
            alert(err.message)
        } finally {
            setGenerating(false)
        }
    }

    return (
        <div className="flex h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">

            {/* LEFT PANEL: Queue */}
            <div className="w-2/5 flex flex-col border-r border-white/5 bg-slate-900/30 backdrop-blur-md z-10">

                {/* Header */}
                <div className="bg-gradient-to-br from-teal-500/10 to-cyan-600/10 p-4 border-b border-white/5 flex-shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="font-black text-sm flex items-center gap-2 uppercase tracking-wide text-teal-400">
                            <Link
                                href={`/dashboard/loja/${storeId}?menu=loja-vazia`}
                                className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-400 hover:text-white transition-all active:scale-95"
                                title="Voltar para o Painel"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                            <Tag className="h-4 w-4" /> Fila de Etiquetas
                        </h2>
                        <div className="flex gap-1.5">
                            <span className="bg-teal-500/20 text-teal-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-teal-500/30">
                                {queue.length} {queue.length === 1 ? 'item' : 'itens'}
                            </span>
                            <span className="bg-cyan-500/20 text-cyan-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-cyan-500/30">
                                {totalLabels} {totalLabels === 1 ? 'etiqueta' : 'etiquetas'}
                            </span>
                        </div>
                    </div>

                    {/* KPI: Pages needed */}
                    {totalLabels > 0 && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <FileDown className="h-3 w-3" />
                            <span>
                                ~{Math.ceil((totalLabels + startPosition - 1) / labelsPerPage)} página(s) A4 necessária(s)
                                {startPosition > 1 && ` (iniciando na posição ${startPosition})`}
                            </span>
                        </div>
                    )}
                </div>

                {/* Queue List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {queue.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 p-6">
                            <Package className="h-10 w-10 mb-3 opacity-20" />
                            <p className="text-xs font-bold">Nenhum item na fila</p>
                            <p className="text-[10px] text-slate-600 mt-1 text-center">
                                Adicione produtos pelas sugestões ou pela tela de Movimentações.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {queue.map(item => (
                                <div key={item.id} className="p-3 hover:bg-white/[0.02] transition-colors group">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-slate-300 text-xs truncate">
                                                {item.product_name}
                                            </p>
                                            {item.variant_name && (
                                                <p className="text-[10px] text-slate-500 truncate">{item.variant_name}</p>
                                            )}
                                            <div className="flex items-center gap-2 mt-1">
                                                {item.product_barcode ? (
                                                    <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono">
                                                        {item.product_barcode}
                                                    </span>
                                                ) : (
                                                    <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                        <AlertTriangle className="h-2.5 w-2.5" /> Sem código
                                                    </span>
                                                )}
                                                {item.product_ref && (
                                                    <span className="text-[9px] text-slate-600">Ref: {item.product_ref}</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Quantity Controls */}
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => handleUpdateQty(item.id, item.quantity - 1)}
                                                disabled={isPending}
                                                className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                            >
                                                <Minus className="h-3 w-3" />
                                            </button>
                                            <span className="text-sm font-black text-white w-8 text-center">{item.quantity}</span>
                                            <button
                                                onClick={() => handleUpdateQty(item.id, item.quantity + 1)}
                                                disabled={isPending}
                                                className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                            >
                                                <Plus className="h-3 w-3" />
                                            </button>
                                            <button
                                                onClick={() => handleRemove(item.id)}
                                                disabled={isPending}
                                                className="p-1 rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-colors ml-1"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                {queue.length > 0 && (
                    <div className="p-3 border-t border-white/5 bg-black/20 flex gap-2">
                        <button
                            onClick={handleClear}
                            disabled={isPending}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/20 border border-red-500/20 transition-colors"
                        >
                            <RotateCcw className="h-3 w-3" /> Limpar Fila
                        </button>
                    </div>
                )}
            </div>

            {/* RIGHT PANEL: Settings + Suggestions */}
            <div className="flex-1 flex flex-col bg-transparent relative overflow-hidden">

                {/* Print Settings */}
                <div className="p-5 border-b border-white/5 bg-gradient-to-r from-teal-500/5 to-transparent">
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white transition-colors w-full"
                    >
                        <Settings2 className="h-4 w-4 text-teal-400" />
                        Configurações de Impressão
                        {showSettings ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                    </button>

                    {showSettings && (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Template Selector */}
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                                    Modelo da Etiqueta
                                </label>
                                <select
                                    value={templateCode}
                                    onChange={e => setTemplateCode(e.target.value)}
                                    className="w-full bg-slate-800/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20"
                                >
                                    {LABEL_TEMPLATES.map(t => (
                                        <option key={t.code} value={t.code}>{t.name}</option>
                                    ))}
                                </select>
                                <p className="text-[9px] text-slate-600 mt-1">
                                    {selectedTemplate.columns} colunas × {selectedTemplate.rows} linhas = {labelsPerPage} etiquetas/folha
                                </p>
                            </div>

                            {/* Label Type */}
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                                    Formato do Código
                                </label>
                                <div className="flex bg-slate-800/80 border border-white/10 rounded-lg p-1">
                                    <button
                                        onClick={() => setCodeType('barcode')}
                                        className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${codeType === 'barcode' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Barras (1D)
                                    </button>
                                    <button
                                        onClick={() => setCodeType('qrcode')}
                                        className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${codeType === 'qrcode' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        QR Code
                                    </button>
                                </div>
                                <p className="text-[9px] text-slate-600 mt-1">
                                    QR Code melhora encaixe em etiquetas pquenas.
                                </p>
                            </div>

                            {/* Start Position */}
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                                    Posição Inicial na Folha
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min={1}
                                        max={labelsPerPage}
                                        value={startPosition}
                                        onChange={e => setStartPosition(Math.max(1, Math.min(labelsPerPage, parseInt(e.target.value) || 1)))}
                                        className="w-20 bg-slate-800/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20"
                                    />
                                    <span className="text-[10px] text-slate-500">de {labelsPerPage}</span>
                                </div>
                                <p className="text-[9px] text-slate-600 mt-1">
                                    {startPosition > 1
                                        ? `As primeiras ${startPosition - 1} posições ficarão em branco.`
                                        : 'A impressão começará do início da folha.'
                                    }
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* GENERATE BUTTON */}
                <div className="p-5 border-b border-white/5">
                    <button
                        onClick={handleGenerate}
                        disabled={queue.length === 0 || generating}
                        className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl text-sm font-black uppercase tracking-wider transition-all duration-300 ${
                            queue.length === 0
                                ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed border border-white/5'
                                : generating
                                    ? 'bg-teal-600/30 text-teal-300 border border-teal-500/30 animate-pulse'
                                    : 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-[0_0_30px_rgba(20,184,166,0.3)] hover:shadow-[0_0_50px_rgba(20,184,166,0.5)] hover:scale-[1.02] border border-teal-400/30'
                        }`}
                    >
                        <Printer className="h-5 w-5" />
                        {generating ? 'Gerando PDF...' : `Gerar PDF com ${totalLabels} Etiqueta${totalLabels !== 1 ? 's' : ''}`}
                    </button>
                </div>

                {/* Suggestions */}
                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                    <div className="flex items-center justify-between mb-4">
                        <button
                            onClick={() => setShowSuggestions(!showSuggestions)}
                            className="flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white transition-colors"
                        >
                            <Sparkles className="h-4 w-4 text-amber-400" />
                            Sugestões (Entradas recentes)
                            {showSuggestions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                        {showSuggestions && suggestions.length > 0 && (
                            <button
                                onClick={handleAddAll}
                                disabled={isPending}
                                className="text-[10px] font-bold text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors"
                            >
                                <Plus className="h-3 w-3" /> Adicionar Tudo
                            </button>
                        )}
                    </div>

                    {showSuggestions && (
                        suggestions.length === 0 ? (
                            <div className="text-center text-slate-600 py-8">
                                <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                <p className="text-xs">Nenhuma entrada nos últimos 7 dias.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {suggestions.map((sug, i) => {
                                    const alreadyInQueue = queue.some(
                                        q => q.product_id === sug.product_id && q.variant_id === sug.variant_id
                                    )
                                    return (
                                        <div
                                            key={`${sug.product_id}-${sug.variant_id}-${i}`}
                                            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                                                alreadyInQueue
                                                    ? 'bg-teal-500/5 border-teal-500/20 opacity-60'
                                                    : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
                                            }`}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-bold text-slate-300 truncate">{sug.product_name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[9px] text-slate-600">
                                                        {sug.quantity} unid. entrada
                                                    </span>
                                                    {sug.product_barcode && (
                                                        <span className="text-[9px] font-mono text-slate-600">{sug.product_barcode}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleAddSuggestion(sug)}
                                                disabled={isPending || alreadyInQueue}
                                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                                    alreadyInQueue
                                                        ? 'bg-teal-500/10 text-teal-400 cursor-default'
                                                        : 'bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 border border-teal-500/30'
                                                }`}
                                            >
                                                {alreadyInQueue ? (
                                                    <>✓ Na fila</>
                                                ) : (
                                                    <><ArrowRight className="h-3 w-3" /> Adicionar</>
                                                )}
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    )
}
