'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
    Search, Save, Loader2, PackageX, ArrowRightLeft,
    ArrowDownUp, PackageOpen, Receipt
} from 'lucide-react'
import { buscarProdutoExpress, ProdutoExpressResult } from '@/lib/actions/vendas.actions'
import { registrarMovimentacao, getProductVariants } from '@/lib/actions/stock.actions'
import { DegreeInput } from '@/components/ui/DegreeInput'
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase/client'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import { Database } from '@/lib/database.types'
import LensDivergenceDrawer from './LensDivergenceDrawer'

interface Props {
    storeId: number
    initialSearchTerm?: string
}

type LensEye = 'OD' | 'OE' | 'AMBOS'
type AuthedEmployee = Pick<Database['public']['Tables']['employees']['Row'], 'id' | 'full_name' | 'role'>

const labelStyle = "block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider"
const inputStyle = "block w-full rounded-xl border border-white/10 bg-black/20 shadow-sm text-slate-200 h-9 text-xs px-3 focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50 font-bold placeholder:font-normal placeholder:text-slate-600 disabled:opacity-50 transition-all outline-none"
const cardStyle = "bg-white/5 p-5 rounded-2xl shadow-lg border border-white/10 backdrop-blur-md mb-3"

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const typeLabels: Record<string, string> = {
    'Entrada': 'Entrada (Compra/Retorno)',
    'Saida': 'Saída (Venda/Baixa)',
    'Perda': 'Perda / Quebra',
    'Brinde': 'Brinde / Cortesia',
    'Ajuste': 'Ajuste de Inventário'
}

export default function StockMovementForm({ storeId, initialSearchTerm }: Props) {
    const router = useRouter()
    const searchInputRef = useRef<HTMLInputElement>(null)
    const supabase = createSupabaseBrowserClient()

    // Search States
    const [query, setQuery] = useState(initialSearchTerm || '')
    const [results, setResults] = useState<ProdutoExpressResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [selectedProduct, setSelectedProduct] = useState<ProdutoExpressResult | null>(null)

    // Form States
    const [quantidade, setQuantidade] = useState(1)
    const [tipo, setTipo] = useState<'Entrada' | 'Saida' | 'Perda' | 'Brinde' | 'Ajuste'>('Ajuste')
    const [motivo, setMotivo] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isAuthOpen, setIsAuthOpen] = useState(false)

    // Optional Fields
    const [relatedVendaId, setRelatedVendaId] = useState('')

    // Lens Leftover Fields
    const [sobraOlho, setSobraOlho] = useState<LensEye>('AMBOS')
    const [sobraEsferico, setSobraEsferico] = useState('')
    const [sobraCilindrico, setSobraCilindrico] = useState('')
    const [sobraAdicao, setSobraAdicao] = useState('')
    const [sobraEixo, setSobraEixo] = useState('')
    const [sobraDiametro, setSobraDiametro] = useState('')

    // Variant Selection
    const [variants, setVariants] = useState<any[]>([])
    const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null)
    const [isLoadingVariants, setIsLoadingVariants] = useState(false)

    // Drawer State
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)

    // Initial search if term provided
    useEffect(() => {
        if (initialSearchTerm && initialSearchTerm.length >= 2) {
            performSearch(initialSearchTerm)
        }
    }, [initialSearchTerm])

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
        if (val.length >= 2) {
            performSearch(val)
        } else {
            setResults([])
        }
    }

    const handleSelectProduct = async (prod: ProdutoExpressResult) => {
        setSelectedProduct(prod)
        setResults([])
        setQuery('')

        if (prod.tem_grade) {
            setIsLoadingVariants(true)
            getProductVariants(prod.id)
                .then(vt => setVariants(vt || []))
                .finally(() => setIsLoadingVariants(false))
        } else {
            setVariants([])
            setSelectedVariantId(null)
        }
    }

    const handleClearProduct = () => {
        setSelectedProduct(null)
        setVariants([])
        setSelectedVariantId(null)
        setQuery('')
        setTimeout(() => searchInputRef.current?.focus(), 100)
    }

    const handleAuthSuccess = async (authedEmployee: AuthedEmployee) => {
        if (!selectedProduct) return
        setIsAuthOpen(false)
        setIsSaving(true)

        const formData = new FormData()
        formData.append('store_id', storeId.toString())
        formData.append('employee_id', authedEmployee.id.toString())
        formData.append('product_id', selectedProduct!.id.toString())
        formData.append('product_name', selectedProduct!.descricao)
        if (selectedVariantId) formData.append('variant_id', selectedVariantId!.toString())
        formData.append('quantidade', quantidade.toString())
        formData.append('tipo', tipo)
        formData.append('motivo', motivo || (tipo === 'Entrada' ? 'Entrada Avulsa' : typeLabels[tipo]))

        if (relatedVendaId) formData.append('related_venda_id', relatedVendaId)

        const { data: { session } } = await supabase.auth.getSession()
        const accessToken = session?.access_token
        if (accessToken) {
            formData.append('access_token', accessToken as string)
        }

        const parseDeg = (val: string) => val ? parseFloat(val.replace(',', '.').replace('+', '')) : null
        const parseAxis = (val: string) => {
            const normalized = val.replace(/\D/g, '')
            return normalized ? Number(normalized) : null
        }

        if (sobraDiametro) {
            const sobraObj = {
                olho: sobraOlho,
                esferico: parseDeg(sobraEsferico),
                cilindrico: parseDeg(sobraCilindrico),
                adicao: parseDeg(sobraAdicao),
                eixo: parseAxis(sobraEixo),
                diametro: sobraDiametro ? Number(sobraDiametro) : null
            }
            formData.append('sobra_detalhes', JSON.stringify(sobraObj))
        }

        const res = await registrarMovimentacao({ success: false, message: '' }, formData)

        if (res.success) {
            setSelectedProduct(null)
            setVariants([])
            setSelectedVariantId(null)
            setQuantidade(1)
            setMotivo('')
            setRelatedVendaId('')
            setSobraOlho('AMBOS')
            setSobraDiametro('')
            setSobraEsferico('')
            setSobraCilindrico('')
            setSobraAdicao('')
            setSobraEixo('')
            router.refresh()
        } else {
            alert('Erro: ' + res.message)
        }
        setIsSaving(false)
    }

    const handleSave = async () => {
        if (!selectedProduct) return

        if (selectedProduct.tem_grade && !selectedVariantId) {
            alert('Selecione a variação (grau/cor) do produto.')
            return
        }

        setIsAuthOpen(true)
        return

        const formData = new FormData()
        formData.append('store_id', storeId.toString())
        formData.append('product_id', selectedProduct!.id.toString())
        formData.append('product_name', selectedProduct!.descricao)
        if (selectedVariantId) formData.append('variant_id', selectedVariantId!.toString())
        formData.append('quantidade', quantidade.toString())
        formData.append('tipo', tipo)
        formData.append('motivo', motivo || (tipo === 'Entrada' ? 'Entrada Avulsa' : typeLabels[tipo]))

        if (relatedVendaId) formData.append('related_venda_id', relatedVendaId)

        const { data: { session } } = await supabase.auth.getSession()
        const accessToken = session?.access_token
        if (accessToken) {
            formData.append('access_token', accessToken as string)
        }

        // Lente de aproveitamento (send if filled regardless of type)
        const parseDeg = (val: string) => val ? parseFloat(val.replace(',', '.').replace('+', '')) : null
        const parseAxis = (val: string) => {
            const normalized = val.replace(/\D/g, '')
            return normalized ? Number(normalized) : null
        }

        if (sobraDiametro) {
            const sobraObj = {
                olho: sobraOlho,
                esferico: parseDeg(sobraEsferico),
                cilindrico: parseDeg(sobraCilindrico),
                adicao: parseDeg(sobraAdicao),
                eixo: parseAxis(sobraEixo),
                diametro: sobraDiametro ? Number(sobraDiametro) : null
            }
            formData.append('sobra_detalhes', JSON.stringify(sobraObj))
        }

        const res = await registrarMovimentacao({ success: false, message: '' }, formData)

        if (res.success) {
            // Reset form
            setSelectedProduct(null)
            setVariants([])
            setSelectedVariantId(null)
            setQuantidade(1)
            setMotivo('')
            setRelatedVendaId('')
            setSobraOlho('AMBOS')
            setSobraDiametro('')
            setSobraEsferico('')
            setSobraCilindrico('')
            setSobraAdicao('')
            setSobraEixo('')
            router.refresh()
        } else {
            alert('Erro: ' + res.message)
        }
        setIsSaving(false)
    }

    const isLensProduct = selectedProduct && (
        selectedProduct.tem_grade ||
        selectedProduct.descricao?.toLowerCase().includes('lente')
    )

    const shouldWarnAboutAxis = Boolean(sobraAdicao && !sobraEixo.trim())

    return (
        <div className="flex flex-col h-full">

            {/* Scrollable Form Area */}
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                <div className="max-w-3xl mx-auto space-y-4">

                    <div className="flex justify-end mb-2">
                        <button 
                            type="button"
                            onClick={() => setIsDrawerOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs font-bold text-sky-400 hover:bg-sky-500/10 hover:border-sky-500/30 transition-all shadow-sm"
                        >
                            <PackageOpen className="w-4 h-4" /> Auditar Gaveta de Lentes
                        </button>
                    </div>

                    {/* CARD 1: Busca de Produto */}
                    <div className={cardStyle}>
                        <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Search className="h-4 w-4" /> 1. Selecionar Produto
                        </h3>

                        {!selectedProduct ? (
                            <div className="space-y-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        value={query}
                                        onChange={handleSearchInput}
                                        placeholder="Buscar por nome, código de barras ou referência..."
                                        className={`${inputStyle} pl-9 h-10`}
                                        autoFocus
                                    />
                                    {isSearching && (
                                        <div className="absolute right-3 top-2.5">
                                            <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                                        </div>
                                    )}
                                </div>

                                {results.length === 0 && query.length > 1 && !isSearching && (
                                    <div className="text-center py-6 text-slate-500">
                                        <PackageX className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p className="text-xs">Nenhum produto encontrado.</p>
                                    </div>
                                )}

                                <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                                    {results.map(prod => (
                                        <button
                                            key={prod.id}
                                            onClick={() => handleSelectProduct(prod)}
                                            className="w-full text-left p-3 rounded-xl border border-white/5 bg-slate-900/50 hover:bg-amber-500/10 hover:border-amber-500/30 transition-all group"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h4 className="font-bold text-slate-200 group-hover:text-amber-400 transition-colors text-sm">{prod.descricao}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                                            {prod.tipo_origem === 'armacoes' ? 'ARMAÇÃO' : 'PRODUTO'}
                                                        </span>
                                                        {prod.codigo_barras && (
                                                            <span className="text-[10px] text-slate-500">EAN: {prod.codigo_barras}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${prod.estoque > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                                    {prod.estoque} un
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex justify-between items-center">
                                <div>
                                    <p className="text-[10px] text-amber-400/70 uppercase font-bold">Produto Selecionado</p>
                                    <h4 className="font-bold text-white text-sm">{selectedProduct.descricao}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        {selectedProduct.codigo_barras && (
                                            <span className="text-[10px] text-slate-500">EAN: {selectedProduct.codigo_barras}</span>
                                        )}
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${selectedProduct.estoque > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                            Estoque: {selectedProduct.estoque} un
                                        </span>
                                    </div>
                                </div>
                                <button onClick={handleClearProduct} className="text-xs text-amber-500 hover:text-amber-400 font-bold hover:underline">
                                    Trocar
                                </button>
                            </div>
                        )}
                    </div>

                    {/* CARD 2: Variante (Grade) — só se o produto tiver grade */}
                    {selectedProduct?.tem_grade && (
                        <div className={cardStyle}>
                            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <PackageOpen className="h-4 w-4" /> Selecione a Variação *
                            </h3>
                            {isLoadingVariants ? (
                                <div className="py-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>
                            ) : (
                                <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                                    {variants.map(v => (
                                        <button
                                            key={v.id}
                                            type="button"
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
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${v.estoque_atual > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {v.estoque_atual} un
                                            </span>
                                        </button>
                                    ))}
                                    {variants.length === 0 && <p className="text-xs text-slate-500 italic">Nenhuma variação encontrada.</p>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* CARD 3: Dados da Movimentação */}
                    {selectedProduct && (
                        <div className={cardStyle}>
                            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <ArrowRightLeft className="h-4 w-4" /> 2. Dados da Movimentação
                            </h3>

                            <div className="grid grid-cols-12 gap-3 gap-y-4">
                                <div className="col-span-6">
                                    <label className={labelStyle}>Tipo de Movimento *</label>
                                    <div className="relative">
                                        <select
                                            value={tipo}
                                            onChange={(e) => setTipo(e.target.value as any)}
                                            className={`${inputStyle} cursor-pointer appearance-none`}
                                        >
                                            {Object.entries(typeLabels).map(([key, label]) => (
                                                <option key={key} value={key} className="bg-slate-900 text-slate-200">{label}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-2.5 pointer-events-none text-slate-500">
                                            <ArrowDownUp className="h-4 w-4" />
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-3">
                                    <label className={labelStyle}>Quantidade *</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={quantidade}
                                        onChange={(e) => setQuantidade(Number(e.target.value))}
                                        className={`${inputStyle} text-center`}
                                    />
                                </div>

                                <div className="col-span-3">
                                    <label className={labelStyle}>Venda Vinculada</label>
                                    <div className="relative">
                                        <Receipt className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                                        <input
                                            type="number"
                                            value={relatedVendaId}
                                            onChange={e => setRelatedVendaId(e.target.value)}
                                            placeholder="ID"
                                            className={`${inputStyle} pl-8`}
                                        />
                                    </div>
                                </div>

                                <div className="col-span-12">
                                    <label className={labelStyle}>Motivo / Observação</label>
                                    <textarea
                                        value={motivo}
                                        onChange={(e) => setMotivo(e.target.value)}
                                        placeholder={tipo === 'Entrada' ? 'Entrada Avulsa' : 'Descreva o motivo...'}
                                        className={`${inputStyle} h-auto min-h-[70px] resize-none py-2`}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* CARD 4: Sobra de Lente — Sempre visível when product selected (campos opcionais) */}
                    {selectedProduct && (
                        <div className={`${cardStyle} border-sky-500/20 bg-sky-500/5`}>
                            <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <PackageOpen className="h-4 w-4" /> Lente de Aproveitamento
                            </h3>
                            <p className="text-[10px] text-slate-500 mb-3">
                                Preencha os dados da lente reaproveitada para que a OS consiga sugeri-la depois. Opcional.
                            </p>

                            <div className="grid grid-cols-6 gap-3">
                                <div>
                                    <label className={labelStyle}>Olho</label>
                                    <select value={sobraOlho} onChange={e => setSobraOlho(e.target.value as LensEye)} className={`${inputStyle} cursor-pointer`}>
                                        <option value="AMBOS" className="bg-slate-900">Ambos os olhos</option>
                                        <option value="OD" className="bg-slate-900">OD (Direito)</option>
                                        <option value="OE" className="bg-slate-900">OE (Esquerdo)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelStyle}>Diâmetro</label>
                                    <input type="text" value={sobraDiametro} onChange={e => setSobraDiametro(e.target.value)} placeholder="Ex: 70" className={inputStyle} />
                                </div>
                                <div className="flex flex-col">
                                    <label className={labelStyle}>Esférico</label>
                                    <DegreeInput value={sobraEsferico} onChange={setSobraEsferico} className={`${inputStyle} text-center`} />
                                </div>
                                <div className="flex flex-col">
                                    <label className={labelStyle}>Cilíndrico</label>
                                    <DegreeInput value={sobraCilindrico} onChange={setSobraCilindrico} className={`${inputStyle} text-center`} />
                                </div>
                                <div>
                                    <label className={labelStyle}>Eixo</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="180"
                                        value={sobraEixo}
                                        onChange={e => setSobraEixo(e.target.value)}
                                        placeholder="Ex: 90"
                                        className={`${inputStyle} text-center`}
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className={labelStyle}>Adição</label>
                                    <DegreeInput value={sobraAdicao} onChange={setSobraAdicao} className={`${inputStyle} text-center`} />
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-3">
                                Se o eixo estiver preenchido, a OS so vai sugerir esta lente quando o eixo da receita for igual.
                            </p>
                            {shouldWarnAboutAxis && (
                                <p className="text-[10px] text-amber-300 mt-1">
                                    Esta lente tem adicao, mas esta sem eixo. Ela continuara aparecendo como opcao generica na busca.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer Fixo */}
            {selectedProduct && (
                <div className="bg-slate-900/60 backdrop-blur-xl border-t border-white/5 p-3 shadow-[0_-5px_20px_rgba(0,0,0,0.2)] flex justify-end gap-2 z-20 shrink-0">
                    <button
                        type="button"
                        onClick={handleClearProduct}
                        className="px-4 py-2 text-xs font-bold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || (selectedProduct.tem_grade && !selectedVariantId)}
                        className="px-6 py-2 text-xs font-bold text-emerald-100 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 rounded-lg shadow-md backdrop-blur-md transition-transform active:scale-95 flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />}
                        CONFIRMAR MOVIMENTAÇÃO
                    </button>
                </div>
            )}
            <EmployeeAuthModal
                storeId={storeId}
                isOpen={isAuthOpen}
                onClose={() => setIsAuthOpen(false)}
                onSuccess={handleAuthSuccess}
                title="Autorizar Movimentacao"
                description="Insira seu PIN para confirmar o lancamento no estoque."
            />
            
            <LensDivergenceDrawer 
                storeId={storeId}
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
            />
        </div>
    )
}
