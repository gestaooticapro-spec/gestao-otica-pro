'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    ResumoCaixa,
    abrirCaixa,
    adicionarMovimento,
    atualizarSaldoInicial,
    atualizarMovimento,
    fecharCaixa
} from '@/lib/actions/cashflow.actions'
import {
    Wallet, ArrowUpCircle, ArrowDownCircle, Lock, Unlock,
    Save, Loader2, DollarSign, AlertTriangle, TrendingUp, TrendingDown, Package, Printer, Pencil
} from 'lucide-react'
import RelatorioDateModal from '@/components/modals/RelatorioDateModal'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

// --- DESIGN SYSTEM (ALTO CONTRASTE) ---
const labelStyle = "block text-[10px] font-bold text-emerald-100 uppercase mb-1 tracking-wider"
const inputStyle = "block w-full rounded-lg border-0 bg-white shadow-sm text-slate-900 h-10 text-sm px-3 focus:ring-2 focus:ring-emerald-300 focus:outline-none font-bold placeholder:font-normal placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500 transition-all"

export default function CaixaInterface({ initialData, storeId }: { initialData: ResumoCaixa | null, storeId: number }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [isReportModalOpen, setIsReportModalOpen] = useState(false)
    const [reportType, setReportType] = useState<'pix' | 'cartoes'>('pix')
    const formRef = useRef<HTMLFormElement>(null)
    const [isSaldoModalOpen, setIsSaldoModalOpen] = useState(false)
    const [isMovModalOpen, setIsMovModalOpen] = useState(false)
    const [editingMov, setEditingMov] = useState<any>(null)

    // --- AÇÕES ---
    const handleAbrir = async (formData: FormData) => {
        startTransition(async () => {
            const res = await abrirCaixa(null, formData)
            if (res.success) router.refresh()
            else alert(res.message)
        })
    }

    const handleMovimento = async (formData: FormData) => {
        if (!initialData?.caixa) return
        formData.append('caixa_id', initialData.caixa.id.toString())

        startTransition(async () => {
            const res = await adicionarMovimento(null, formData)
            if (res.success) {
                formRef.current?.reset()
                router.refresh()
            } else {
                alert(res.message)
            }
        })
    }

    const handleFechar = async (formData: FormData) => {
        if (!initialData?.caixa) return
        if (!confirm("Tem certeza que deseja fechar o caixa agora?")) return

        formData.append('caixa_id', initialData.caixa.id.toString())
        formData.append('saldo_esperado', initialData.totais.saldo_esperado_dinheiro.toString())

        startTransition(async () => {
            const res = await fecharCaixa(null, formData)
            if (res.success) router.refresh()
            else alert(res.message)
        })
    }

    const handleAtualizarSaldo = async (formData: FormData) => {
        if (!initialData?.caixa) return
        formData.append('caixa_id', initialData.caixa.id.toString())

        startTransition(async () => {
            const res = await atualizarSaldoInicial(null, formData)
            if (res.success) {
                setIsSaldoModalOpen(false)
                router.refresh()
            } else {
                alert(res.message)
            }
        })
    }

    const handleAtualizarMov = async (formData: FormData) => {
        if (!initialData?.caixa || !editingMov) return
        formData.append('caixa_id', initialData.caixa.id.toString())
        formData.append('movimento_id', String(editingMov.raw_id))

        startTransition(async () => {
            const res = await atualizarMovimento(null, formData)
            if (res.success) {
                setIsMovModalOpen(false)
                setEditingMov(null)
                router.refresh()
            } else {
                alert(res.message)
            }
        })
    }

    // --- RENDERIZAÇÃO CONDICIONAL ---

    // 1. MODO CAIXA FECHADO (Tela de Abertura Estilizada)
    if (!initialData || !initialData.caixa) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-150px)] animate-in zoom-in duration-300">
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-8 rounded-3xl shadow-2xl shadow-emerald-200 w-full max-w-md text-center relative overflow-hidden border border-white/20">
                    {/* Efeito de fundo */}
                    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>

                    <div className="bg-white/20 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm shadow-inner border border-white/10">
                        <Lock className="h-10 w-10 text-white" />
                    </div>

                    <h2 className="text-3xl font-black text-white mb-2">Caixa Fechado</h2>
                    <p className="text-emerald-100 mb-8 font-medium">Informe o fundo de troco para iniciar.</p>

                    <form action={handleAbrir} className="space-y-6">
                        <input type="hidden" name="store_id" value={storeId} />
                        <div>
                            <label className="block text-xs font-bold text-emerald-200 uppercase mb-2">Saldo Inicial (Dinheiro)</label>
                            <div className="relative">
                                <span className="absolute left-4 top-3 text-emerald-700 font-bold">R$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    name="saldo_inicial"
                                    placeholder="0,00"
                                    className="w-full h-12 text-2xl font-black text-center rounded-xl border-0 shadow-lg text-emerald-800 bg-white focus:ring-4 focus:ring-emerald-400/50"
                                    autoFocus
                                    required
                                />
                            </div>
                        </div>
                        <button
                            disabled={isPending}
                            className="w-full bg-emerald-900 hover:bg-emerald-950 text-white h-12 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
                        >
                            {isPending ? <Loader2 className="animate-spin" /> : <Unlock className="h-5 w-5" />}
                            ABRIR OPERAÇÃO
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    // 2. MODO CAIXA ABERTO (Dashboard)
    const { totais, vendas, movimentacoes, movimentacoes_detalhadas, categoriasUsadas } = initialData

    return (
        <div className="flex flex-col h-full space-y-4">

            {/* --- TOPO: INDICADORES (KPIs) REFORMULADOS --- */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 shrink-0">
                {/* Card 1: Saldo Gaveta (Dinheiro Físico) */}
                <div className="bg-emerald-600 text-white p-3 rounded-xl shadow-md flex items-center justify-between border border-white/10">
                    <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider opacity-70">Saldo Gaveta</p>
                        <p className="text-xl font-black">{formatCurrency(totais.saldo_esperado_dinheiro)}</p>
                        <div className="flex items-center gap-2">
                            <p className="text-[9px] opacity-50">Fundo: {formatCurrency(initialData.caixa.saldo_inicial)}</p>
                            <button
                                type="button"
                                onClick={() => setIsSaldoModalOpen(true)}
                                className="text-[9px] bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded font-bold uppercase"
                                title="Editar fundo de caixa"
                            >
                                Editar
                            </button>
                        </div>
                    </div>
                    <div className="p-2 bg-white/20 rounded-lg"><Wallet className="h-5 w-5" /></div>
                </div>

                {/* Card 2: Total Recebido em Caixa (Dinheiro de Vendas + Suprimentos - Sangrias) */}
                <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider">Mov. Caixa (Hoje)</p>
                        <p className="text-xl font-black text-emerald-700">{formatCurrency(vendas.total_dinheiro + totais.entradas_manuais - totais.saidas_manuais)}</p>
                    </div>
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Package className="h-5 w-5" /></div>
                </div>

                {/* Card 3: Total Recebido em Banco (Pix + Cartões) */}
                <div className="bg-white p-3 rounded-xl border border-blue-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[9px] font-bold text-blue-700 uppercase tracking-wider">Mov. Banco (Hoje)</p>
                        <p className="text-xl font-black text-blue-700">{formatCurrency(vendas.total_pix + vendas.total_cartao)}</p>
                        <div className="flex gap-1 mt-0.5">
                            <span className="text-[8px] bg-blue-50 px-1 py-0.5 rounded text-blue-500 font-bold">Pix: {formatCurrency(vendas.total_pix)}</span>
                            <span className="text-[8px] bg-blue-50 px-1 py-0.5 rounded text-blue-500 font-bold">Cartão: {formatCurrency(vendas.total_cartao)}</span>
                        </div>
                    </div>
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><TrendingUp className="h-5 w-5" /></div>
                </div>

                {/* Card 4: Saídas (Sangrias/Retiradas) */}
                <div className="bg-white p-3 rounded-xl border border-red-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[9px] font-bold text-red-600 uppercase tracking-wider">Sangrias</p>
                        <p className="text-xl font-black text-red-600">{formatCurrency(totais.saidas_manuais)}</p>
                        <p className="text-[9px] text-slate-400">{movimentacoes.filter(m => m.tipo === 'Saida').length} lançamentos</p>
                    </div>
                    <div className="p-2 bg-red-50 text-red-600 rounded-lg"><TrendingDown className="h-5 w-5" /></div>
                </div>
            </div>

            {/* --- CORPO: SPLIT VIEW --- */}
            <div className="flex-1 flex gap-6 overflow-hidden">

                {/* ESQUERDA (30%): CONTROLES */}
                <div className="w-1/3 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">

                    {/* CARD 1: NOVO LANÇAMENTO (GRADIENTE) */}
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 rounded-2xl shadow-lg shadow-emerald-100 border border-white/20">
                        <div className="flex items-center gap-2 mb-4 border-b border-white/20 pb-2">
                            <div className="p-1 bg-white/20 rounded text-white"><Save className="h-4 w-4" /></div>
                            <h3 className="text-sm font-bold text-white">Lançamento Manual</h3>
                        </div>

                        <form ref={formRef} action={handleMovimento} className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelStyle}>Tipo</label>
                                    <select name="tipo" className={`${inputStyle} cursor-pointer`}>
                                        <option value="Saida">Saída (Sangria)</option>
                                        <option value="Entrada">Entrada (Suprimento)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelStyle}>Valor (R$)</label>
                                    <input name="valor" type="number" step="0.01" required className={`${inputStyle} text-right`} placeholder="0.00" />
                                </div>
                            </div>

                            <div>
                                <label className={labelStyle}>Categoria</label>
                                <input
                                    name="categoria"
                                    list="categorias-list"
                                    className={inputStyle}
                                    placeholder="Ex: Limpeza, Motoboy..."
                                />
                                <datalist id="categorias-list">
                                    {categoriasUsadas.map(cat => <option key={cat} value={cat} />)}
                                </datalist>
                            </div>

                            <div>
                                <label className={labelStyle}>Descrição / Motivo</label>
                                <input name="descricao" type="text" required className={inputStyle} placeholder="Detalhes do lançamento..." />
                            </div>

                            <button disabled={isPending} className="w-full mt-2 bg-white text-emerald-700 h-10 rounded-xl font-bold text-sm hover:bg-emerald-50 shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2">
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                LANÇAR
                            </button>
                        </form>
                    </div>

                    {/* CARD 2: FECHAMENTO (BRANCO/ALERTA) */}
                    <div className="bg-white border border-red-100 p-5 rounded-2xl shadow-sm mt-auto">
                        <h3 className="text-red-800 font-bold text-sm mb-3 flex items-center gap-2">
                            <Lock className="h-4 w-4" /> Fechar Caixa
                        </h3>
                        <form action={handleFechar} className="space-y-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Contagem Física (Dinheiro)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-slate-400 font-bold">R$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        name="saldo_final"
                                        className="w-full h-10 pl-9 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:ring-red-500 focus:border-red-500 font-bold text-slate-900 transition-all"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="bg-red-50 p-2 rounded border border-red-100 text-[10px] text-red-600 font-medium flex gap-2">
                                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                                Diferenças serão registradas como Quebra de Caixa.
                            </div>

                            <button
                                disabled={isPending}
                                className="w-full bg-red-600 hover:bg-red-700 text-white h-10 rounded-xl font-bold shadow-md flex justify-center items-center gap-2 transition-all active:scale-95"
                            >
                                {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "ENCERRAR O DIA"}
                            </button>
                        </form>
                    </div>
                </div>

                {/* DIREITA (70%): EXTRATO DIVIDIDO */}
                <div className="flex-1 flex flex-col gap-4 overflow-hidden">

                    {/* PAINEL 1: MOVIMENTAÇÃO CAIXA (50%) */}
                    <div className="h-1/2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                        <div className="bg-emerald-50 px-5 py-2 border-b border-emerald-100 flex justify-between items-center">
                            <h3 className="font-bold text-emerald-800 text-xs flex items-center gap-2 uppercase tracking-wide">
                                <Package className="h-4 w-4 text-emerald-600" /> Extrato de Movimentação Caixa
                            </h3>
                            <span className="text-[10px] bg-white px-2 py-0.5 rounded text-emerald-600 font-bold border border-emerald-200">
                                Dinheiro Total
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                            <TabelaMovimentos
                                movimentos={movimentacoes_detalhadas.filter((m: any) => m.origem === 'Caixa')}
                                emptyMessage="Nenhuma movimentação em dinheiro."
                                onEdit={(mov: any) => {
                                    setEditingMov(mov)
                                    setIsMovModalOpen(true)
                                }}
                            />
                        </div>
                    </div>

                    {/* PAINEL 2: MOVIMENTAÇÃO BANCO (50%) */}
                    <div className="h-1/2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                        <div className="bg-blue-50 px-5 py-2 border-b border-blue-100 flex justify-between items-center">
                            <h3 className="font-bold text-blue-800 text-xs flex items-center gap-2 uppercase tracking-wide">
                                <DollarSign className="h-4 w-4 text-blue-600" /> Extrato de Movimentação Banco
                            </h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setReportType('pix')
                                        setIsReportModalOpen(true)
                                    }}
                                    className="text-[10px] bg-white hover:bg-blue-100 px-2 py-0.5 rounded text-blue-700 font-bold border border-blue-200 flex items-center gap-1 transition-colors"
                                    title="Imprimir Relatório PIX"
                                >
                                    <Printer className="h-3 w-3" /> PIX
                                </button>
                                <button
                                    onClick={() => {
                                        setReportType('cartoes')
                                        setIsReportModalOpen(true)
                                    }}
                                    className="text-[10px] bg-white hover:bg-blue-100 px-2 py-0.5 rounded text-blue-700 font-bold border border-blue-200 flex items-center gap-1 transition-colors"
                                    title="Imprimir Relatório Cartões"
                                >
                                    <Printer className="h-3 w-3" /> Cartões
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                            <TabelaMovimentos
                                movimentos={movimentacoes_detalhadas.filter((m: any) => {
                                    const formaNormalizada = m.forma_pagamento?.toLowerCase() || '';
                                    return m.origem === 'Banco' && !formaNormalizada.includes('dinheiro');
                                })}
                                emptyMessage="Nenhum recebimento digital hoje."
                                onEdit={(mov: any) => {
                                    setEditingMov(mov)
                                    setIsMovModalOpen(true)
                                }}
                            />
                        </div>
                    </div>

                </div>

            </div>
            {/* MODAL DE RELATÓRIO */}
            <RelatorioDateModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                type={reportType}
                onConfirm={(mes, ano) => {
                    setIsReportModalOpen(false)
                    window.open(`/print/relatorios/${reportType}/${storeId}?mes=${mes}&ano=${ano}&t=${Date.now()}`, '_blank')
                }}
            />

            {isSaldoModalOpen && initialData?.caixa && (
                <SimpleModal
                    title="Editar Fundo de Caixa"
                    onClose={() => setIsSaldoModalOpen(false)}
                >
                    <form action={handleAtualizarSaldo} className="space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Novo Saldo Inicial (R$)</label>
                            <input
                                name="saldo_inicial"
                                type="number"
                                step="0.01"
                                defaultValue={initialData.caixa.saldo_inicial}
                                className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold"
                                required
                            />
                        </div>
                        <button
                            disabled={isPending}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-10 rounded-lg font-bold"
                        >
                            {isPending ? <Loader2 className="animate-spin h-4 w-4 inline mr-2" /> : null}
                            Salvar
                        </button>
                    </form>
                </SimpleModal>
            )}

            {isMovModalOpen && editingMov && (
                <SimpleModal
                    title="Editar Lançamento"
                    onClose={() => {
                        setIsMovModalOpen(false)
                        setEditingMov(null)
                    }}
                >
                    <form action={handleAtualizarMov} className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Tipo</label>
                                <select name="tipo" defaultValue={editingMov.tipo} className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold">
                                    <option value="Saida">Saída</option>
                                    <option value="Entrada">Entrada</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Valor (R$)</label>
                                <input
                                    name="valor"
                                    type="number"
                                    step="0.01"
                                    defaultValue={editingMov.valor}
                                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-right"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Categoria</label>
                            <input
                                name="categoria"
                                defaultValue={editingMov.categoria || ''}
                                className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Descrição</label>
                            <input
                                name="descricao"
                                defaultValue={editingMov.descricao}
                                className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold"
                                required
                            />
                        </div>
                        <button
                            disabled={isPending}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-10 rounded-lg font-bold"
                        >
                            {isPending ? <Loader2 className="animate-spin h-4 w-4 inline mr-2" /> : null}
                            Salvar
                        </button>
                    </form>
                </SimpleModal>
            )}
        </div>
    )
}

// --- SUB-COMPONENTE DE TABELA (REUTILIZÁVEL) ---
function TabelaMovimentos({ movimentos, emptyMessage, onEdit }: { movimentos: any[], emptyMessage: string, onEdit?: (mov: any) => void }) {
    if (movimentos.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
                <DollarSign className="h-8 w-8 mb-2 opacity-20" />
                <p className="text-[10px] font-bold uppercase">{emptyMessage}</p>
            </div>
        )
    }

    return (
        <table className="w-full text-sm text-left">
            <thead className="bg-white sticky top-0 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 z-10">
                <tr>
                    <th className="px-4 py-2 bg-white">Hora</th>
                    <th className="px-4 py-2 bg-white">Tipo</th>
                    <th className="px-4 py-2 bg-white">Descrição</th>
                    <th className="px-4 py-2 text-right bg-white">Valor</th>
                    <th className="px-2 py-2 text-right bg-white">Ações</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
                {movimentos.map((mov) => {
                    const isEntrada = mov.tipo === 'Entrada' || mov.tipo === 'Venda' || mov.tipo === 'Recebimento' || mov.tipo === 'Suprimento';
                    const isManual = typeof mov.id === 'string' && mov.id.startsWith('mov-')
                    const rawId = isManual ? Number(mov.id.replace('mov-', '')) : null
                    return (
                        <tr key={mov.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-2 text-slate-400 w-20 font-mono text-[10px]">{formatTime(mov.horario)}</td>
                            <td className="px-4 py-2 w-32">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase ${mov.tipo === 'Venda' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                                    mov.tipo === 'Recebimento' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                        mov.tipo === 'Saida' ? 'bg-red-50 text-red-600 border-red-100' :
                                            'bg-emerald-50 text-emerald-600 border-emerald-100'
                                    }`}>
                                    {mov.forma_pagamento ? mov.forma_pagamento : mov.categoria || mov.tipo}
                                </span>
                            </td>
                            <td className="px-4 py-2 font-bold text-slate-700 text-xs truncate max-w-[150px]" title={mov.descricao}>
                                {mov.descricao}
                            </td>
                            <td className={`px-4 py-2 font-black text-right w-36 text-xs ${isEntrada ? 'text-emerald-600' : 'text-red-600'}`}>
                                {isEntrada ? '+' : '-'} {formatCurrency(mov.valor)}
                            </td>
                            <td className="px-2 py-2 text-right w-16">
                                {isManual && onEdit && rawId ? (
                                    <button
                                        type="button"
                                        onClick={() => onEdit({ ...mov, raw_id: rawId })}
                                        className="text-[10px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded font-bold"
                                        title="Editar lançamento"
                                    >
                                        <Pencil className="h-3 w-3 inline" />
                                    </button>
                                ) : (
                                    <span className="text-[9px] text-slate-300">-</span>
                                )}
                            </td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    )
}

function SimpleModal({ title, onClose, children }: { title: string, onClose: () => void, children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">X</button>
                </div>
                <div className="p-4">
                    {children}
                </div>
            </div>
        </div>
    )
}
