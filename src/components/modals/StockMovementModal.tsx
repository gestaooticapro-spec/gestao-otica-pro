'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Search, Check, AlertTriangle, ArrowRightLeft, ArrowDownCircle, ArrowDownUp, Save, Loader2, PackageX, Receipt, PackageOpen } from 'lucide-react'
import { buscarProdutoExpress, ProdutoExpressResult } from '@/lib/actions/vendas.actions'
import { registrarMovimentacao, getProductVariants } from '@/lib/actions/stock.actions'
import { DegreeInput } from '@/components/ui/DegreeInput'

interface Props {
    isOpen: boolean
    onClose: () => void
    storeId: number
    initialSearchTerm?: string
}

type LensEye = 'OD' | 'OE' | 'AMBOS'

// --- ESTILOS DO DESIGN SYSTEM (Dark Glassmorphism) ---
const modalOverlayStyle = "fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300"
const modalContentStyle = "bg-slate-950 border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
const inputStyle = "w-full pl-11 pr-4 py-3 rounded-xl border border-white/10 bg-black/20 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm font-medium transition-all"
const labelStyle = "block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider pl-1"

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function StockMovementModal({ isOpen, onClose, storeId, initialSearchTerm }: Props) {
    const [step, setStep] = useState<'search' | 'form'>('search')
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<ProdutoExpressResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [selectedProduct, setSelectedProduct] = useState<ProdutoExpressResult | null>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Form States
    const [quantidade, setQuantidade] = useState(1)
    const [tipo, setTipo] = useState<'Entrada' | 'Saida' | 'Perda' | 'Brinde' | 'Ajuste'>('Entrada')
    const [motivo, setMotivo] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    // Novos Campos
    const [relatedVendaId, setRelatedVendaId] = useState('')

    // Sobras de Lentes
    const [gerouSobra, setGerouSobra] = useState(false)
    const [sobraOlho, setSobraOlho] = useState<LensEye>('AMBOS')
    const [sobraEsferico, setSobraEsferico] = useState('')
    const [sobraCilindrico, setSobraCilindrico] = useState('')
    const [sobraAdicao, setSobraAdicao] = useState('')
    const [sobraDiametro, setSobraDiametro] = useState('')

    // Variações (Grade)
    const [variants, setVariants] = useState<any[]>([])
    const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null)
    const [isLoadingVariants, setIsLoadingVariants] = useState(false)

    // Reset ao abrir
    useEffect(() => {
        if (isOpen) {
            setStep('search')
            setQuery(initialSearchTerm || '')
            setResults([])
            setSelectedProduct(null)
            setQuantidade(1)
            setMotivo('')

            // Reset novos campos
            setRelatedVendaId('')
            setGerouSobra(false)
            setSobraDiametro('')
            setSobraOlho('AMBOS')
            setSobraEsferico('')
            setSobraCilindrico('')
            setSobraAdicao('')

            setVariants([])
            setSelectedVariantId(null)

            // Se tiver termo inicial, já dispara a busca
            if (initialSearchTerm && initialSearchTerm.length >= 3) {
                performSearch(initialSearchTerm)
            } else {
                setTimeout(() => searchInputRef.current?.focus(), 100)
            }
        }
    }, [isOpen, initialSearchTerm])

    // Lógica de Busca
    const performSearch = (searchTerm: string) => {
        if (searchTerm.length < 2) return
        setIsSearching(true)
        buscarProdutoExpress(searchTerm, storeId)
            .then(data => {
                setResults(data)
                setIsSearching(false)
            })
            .catch(() => setIsSearching(false))
    }

    const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setQuery(val)
        if (val.length >= 3) {
            performSearch(val)
        } else {
            setResults([])
        }
    }

    // Selecionar Produto
    const handleSelectProduct = async (prod: ProdutoExpressResult) => {
        setSelectedProduct(prod)

        if (prod.tem_grade) {
            setIsLoadingVariants(true)
            getProductVariants(prod.id)
                .then(vt => {
                    setVariants(vt || [])
                    setStep('form')
                })
                .finally(() => setIsLoadingVariants(false))
        } else {
            setStep('form')
        }

    }

    const handleSave = async () => {
        if (!selectedProduct) return
        setIsSaving(true)

        // Se tem grade e não selecionou variante, erro
        if (selectedProduct.tem_grade && !selectedVariantId) {
            alert('Selecione a variação (grau/cor) do produto.')
            setIsSaving(false)
            return
        }

        const formData = new FormData()
        formData.append('store_id', storeId.toString())
        formData.append('product_id', selectedProduct.id.toString())
        formData.append('product_name', selectedProduct.descricao)
        if (selectedVariantId) formData.append('variant_id', selectedVariantId.toString())
        formData.append('quantidade', quantidade.toString())
        formData.append('tipo', tipo)
        formData.append('motivo', motivo || (tipo === 'Entrada' ? 'Entrada Avulsa' : typeLabels[tipo]))

        // Novos campos opcionais
        if (relatedVendaId) formData.append('related_venda_id', relatedVendaId)

        const parseDeg = (val: string) => val ? parseFloat(val.replace(',', '.').replace('+', '')) : null

        if (gerouSobra) {
            const sobraObj = {
                olho: sobraOlho,
                esferico: parseDeg(sobraEsferico),
                cilindrico: parseDeg(sobraCilindrico),
                adicao: parseDeg(sobraAdicao),
                diametro: sobraDiametro ? Number(sobraDiametro) : null
            }
            formData.append('sobra_detalhes', JSON.stringify(sobraObj))
        }

        // Mock prevState for server action call from client
        const res = await registrarMovimentacao({ success: false, message: '' }, formData)

        if (res.success) {
            onClose()
        } else {
            alert('Erro: ' + res.message)
        }
        setIsSaving(false)
    }

    const typeLabels: Record<string, string> = {
        'Entrada': 'Entrada (Compra/Retorno)',
        'Saida': 'Saída (Venda/Baixa)',
        'Perda': 'Perda / Quebra',
        'Brinde': 'Brinde / Cortesia',
        'Ajuste': 'Ajuste de Inventário'
    }

    const isPG = selectedProduct?.descricao?.toLowerCase().includes('pg') ||
        selectedProduct?.descricao?.toLowerCase().includes('progress') ||
        selectedProduct?.descricao?.toLowerCase().includes('multi')

    if (!isOpen) return null

    return (
        <div className={modalOverlayStyle}>
            <div className={modalContentStyle}>

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/[0.02]">
                    <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                        {step === 'search' ? (
                            <>
                                <ArrowDownCircle className="h-5 w-5 text-amber-500" />
                                Buscar Produto
                            </>
                        ) : (
                            <>
                                <ArrowRightLeft className="h-5 w-5 text-amber-500" />
                                Registrar Movimentação
                            </>
                        )}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 min-h-[300px]">

                    {step === 'search' && (
                        <div className="space-y-6">
                            <div className="relative">
                                <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-500" />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={query}
                                    onChange={handleSearchInput}
                                    placeholder="Nome, código de barras ou referência..."
                                    className={inputStyle}
                                    autoFocus
                                />
                                {isSearching && (
                                    <div className="absolute right-4 top-3.5">
                                        <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                {results.length === 0 && query.length > 2 && !isSearching && (
                                    <div className="text-center py-10 text-slate-500">
                                        <PackageX className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                        <p>Nenhum produto encontrado.</p>
                                    </div>
                                )}

                                {results.map(prod => (
                                    <button
                                        key={prod.id}
                                        onClick={() => handleSelectProduct(prod)}
                                        className="w-full text-left p-4 rounded-xl border border-white/5 bg-slate-900/50 hover:bg-amber-500/10 hover:border-amber-500/30 transition-all group"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="font-bold text-slate-200 group-hover:text-amber-400 transition-colors">{prod.descricao}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                                        {prod.tipo_origem === 'armacoes' ? 'ARMAÇÃO' : 'PRODUTO GERAL'}
                                                    </span>
                                                    {prod.codigo_barras && (
                                                        <span className="text-xs text-slate-500 flex items-center gap-1">
                                                            <div className="w-px h-3 bg-slate-700 mx-1"></div>
                                                            EAN: {prod.codigo_barras}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs text-slate-500 mb-1">Estoque Atual</div>
                                                <span className={`text-sm font-bold px-2 py-1 rounded-lg ${prod.estoque > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                                    {prod.estoque} un
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 'form' && selectedProduct && (
                        <div className="space-y-5 animate-in slide-in-from-right-5 duration-200">

                            {/* Produto Selecionado Card */}
                            <div className="p-4 rounded-xl bg-slate-900/50 border border-white/5 flex justify-between items-center">
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Produto Selecionado</p>
                                    <h3 className="font-bold text-slate-200">{selectedProduct.descricao}</h3>
                                </div>
                                <button onClick={() => { setStep('search'); setSelectedProduct(null) }} className="text-xs text-amber-500 hover:text-amber-400 font-bold hover:underline">
                                    Trocar
                                </button>
                            </div>

                            {/* Seletor de Variante (Grade) */}
                            {selectedProduct.tem_grade && (
                                <div className="space-y-2 p-4 rounded-xl bg-blue-950/20 border border-blue-500/20">
                                    <h4 className="text-sm font-bold text-blue-400 mb-2 flex items-center gap-2">
                                        <PackageOpen className="h-4 w-4" /> Selecione a Variação *
                                    </h4>

                                    {isLoadingVariants ? (
                                        <div className="py-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-2 max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
                                            {variants.map(v => (
                                                <button
                                                    key={v.id}
                                                    onClick={() => setSelectedVariantId(v.id)}
                                                    className={`p-3 rounded-lg border text-left transition-all text-xs flex justify-between items-center ${selectedVariantId === v.id
                                                        ? 'bg-blue-500/20 border-blue-500 text-blue-100 ring-1 ring-blue-500'
                                                        : 'bg-slate-900/50 border-white/5 text-slate-400 hover:bg-slate-800'
                                                        }`}
                                                >
                                                    <span className="font-medium">
                                                        {v.olho ? `Olho: ${v.olho} | ` : ''}
                                                        Esf: {v.esferico} | Cil: {v.cilindrico} | Eixo: {v.eixo}°
                                                        {v.adicao ? ` | Ad: ${v.adicao}` : ''}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${v.estoque > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                        {v.estoque} un
                                                    </span>
                                                </button>
                                            ))}
                                            {variants.length === 0 && <p className="text-xs text-slate-500 italic">Nenhuma variação encontrada.</p>}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelStyle}>Tipo de Movimento</label>
                                    <div className="relative">
                                        <select
                                            value={tipo}
                                            onChange={(e) => setTipo(e.target.value as any)}
                                            className={`${inputStyle} pl-4 appearance-none cursor-pointer`}
                                        >
                                            {Object.entries(typeLabels).map(([key, label]) => (
                                                <option key={key} value={key} className="bg-slate-900 text-slate-200">{label}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-3.5 pointer-events-none text-slate-500">
                                            <ArrowDownUp className="h-4 w-4" />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className={labelStyle}>
                                        Quantidade
                                        {/* Linha fantasma para alinhamento com "Tipo de Movimento" */}
                                        <span className="block invisible h-[15px]" aria-hidden="true">_</span>
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={quantidade}
                                        onChange={(e) => setQuantidade(Number(e.target.value))}
                                        className={inputStyle}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className={labelStyle}>Motivo / Observação</label>
                                <textarea
                                    value={motivo}
                                    onChange={(e) => setMotivo(e.target.value)}
                                    placeholder={tipo === 'Entrada' ? "Entrada Avulsa" : "Descreva o motivo..."}
                                    className={`${inputStyle} min-h-[80px] resize-none`}
                                />
                            </div>

                            {/* CAMPOS AVANÇADOS (OPCIONAIS) */}
                            <div className="pt-2 border-t border-white/5">
                                <details className="group">
                                    <summary className="text-[10px] uppercase font-bold text-slate-500 cursor-pointer hover:text-amber-500 flex items-center gap-1 select-none">
                                        Opções Avançadas <ArrowDownCircle className="h-3 w-3 group-open:rotate-180 transition-transform" />
                                    </summary>

                                    <div className="mt-3 space-y-4 p-3 bg-black/20 rounded-xl border border-white/5">
                                        {/* Vínculo com Venda */}
                                        <div>
                                            <label className={labelStyle}>Vincular à Venda ID (Opcional)</label>
                                            <div className="relative">
                                                <Receipt className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                                <input
                                                    type="number"
                                                    value={relatedVendaId}
                                                    onChange={e => setRelatedVendaId(e.target.value)}
                                                    placeholder="Ex: 1024"
                                                    className={`${inputStyle} pl-9`}
                                                />
                                            </div>
                                            <p className="text-[10px] text-slate-600 mt-1">Útil para baixas ou retornos vinculados a uma venda específica.</p>
                                        </div>

                                        {/* Registro de Sobra (Apenas para Lentes e se for Entrada/Perda/Ajuste) */}
                                        {((selectedProduct.tipo_origem === 'produtos_gerais' && selectedProduct.descricao.toLowerCase().includes('lente')) || tipo !== 'Saida') && (
                                            <div className="pt-2 border-t border-white/5 mt-2">
                                                <label className="flex items-center gap-2 cursor-pointer mb-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={gerouSobra}
                                                        onChange={e => setGerouSobra(e.target.checked)}
                                                        className="rounded border-slate-600 bg-slate-800 text-amber-600 focus:ring-amber-500/50"
                                                    />
                                                    <span className="text-xs font-bold text-slate-300">Registrar Sobra de Lente (Bloco)</span>
                                                </label>

                                                {gerouSobra && (
                                                    <div className={`grid ${isPG ? 'grid-cols-3' : 'grid-cols-2'} gap-2 animate-in slide-in-from-top-2`}>
                                                        <div>
                                                            <label className={labelStyle}>Olho</label>
                                                            <select value={sobraOlho} onChange={e => setSobraOlho(e.target.value as LensEye)} className={inputStyle}>
                                                                <option value="AMBOS">Ambos os olhos</option>
                                                                <option value="OD">OD (Direito)</option>
                                                                <option value="OE">OE (Esquerdo)</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className={labelStyle}>Diametro</label>
                                                            <input type="text" value={sobraDiametro} onChange={e => setSobraDiametro(e.target.value)} placeholder="Ex: 70mm" className={inputStyle} />
                                                        </div>
                                                        <div>
                                                            <label className={labelStyle}>Esferico</label>
                                                            <DegreeInput value={sobraEsferico} onChange={setSobraEsferico} className={inputStyle} />
                                                        </div>
                                                        <div>
                                                            <label className={labelStyle}>Cilindrico</label>
                                                            <DegreeInput value={sobraCilindrico} onChange={setSobraCilindrico} className={inputStyle} />
                                                        </div>
                                                        {isPG && (
                                                            <div>
                                                                <label className={labelStyle}>Adicao</label>
                                                                <DegreeInput value={sobraAdicao} onChange={setSobraAdicao} className={inputStyle} />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </details>
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={isSaving || (selectedProduct.tem_grade && !selectedVariantId)}
                                className="w-full h-12 rounded-xl font-bold transition-all active:scale-[0.98]
                                    bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-100 border border-emerald-500/50 
                                    shadow-lg shadow-emerald-900/10 backdrop-blur-md flex items-center justify-center gap-4 group relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                {isSaving ? <Loader2 className="h-5 w-5 animate-spin relative z-10" /> : <Save className="h-5 w-5 group-hover:scale-110 transition-transform relative z-10" />}
                                <span className="relative z-10">CONFIRMAR MOVIMENTAÇÃO</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
