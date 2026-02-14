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
    Save, Loader2, DollarSign, AlertTriangle, TrendingUp, TrendingDown, Package, Printer, Pencil, HelpCircle, History
} from 'lucide-react'
import RelatorioDateModal from '@/components/modals/RelatorioDateModal'
import HistoricoCaixaModal from './HistoricoCaixaModal'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

// --- DESIGN SYSTEM (DARK GLASSMORPHISM) ---
const labelStyle = "block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider"
const inputStyle = "block w-full rounded-lg border border-white/10 bg-black/20 shadow-inner text-slate-200 h-10 text-sm px-3 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 font-bold placeholder:font-normal placeholder:text-slate-500 disabled:bg-black/10 disabled:text-slate-500 transition-all outline-none backdrop-blur-sm"

export default function CaixaInterface({ initialData, storeId, ultimoFechamento }: { initialData: ResumoCaixa | null, storeId: number, ultimoFechamento?: { saldo_final: number, data_fechamento: string } | null }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [isReportModalOpen, setIsReportModalOpen] = useState(false)
    const [isHistoricoModalOpen, setIsHistoricoModalOpen] = useState(false)
    const [reportType, setReportType] = useState<'pix' | 'cartoes'>('pix')
    const formRef = useRef<HTMLFormElement>(null)
    const [isSaldoModalOpen, setIsSaldoModalOpen] = useState(false)
    const [isMovModalOpen, setIsMovModalOpen] = useState(false)
    const [editingMov, setEditingMov] = useState<any>(null)
    const [saldoInicialInput, setSaldoInicialInput] = useState('')

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

    // 1. MODO CAIXA FECHADO
    if (!initialData) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="bg-white/5 backdrop-blur-xl p-8 rounded-2xl shadow-2xl shadow-black/30 max-w-md w-full border border-white/10">
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center p-4 bg-emerald-500/20 rounded-full mb-4 border border-emerald-500/20">
                            <Lock className="h-8 w-8 text-emerald-400" />
                        </div>
                        <h2 className="text-2xl font-black uppercase tracking-tight text-white">Caixa Fechado</h2>
                        <p className="text-slate-400 text-sm mt-1 font-medium">Inicie o dia informando o fundo de troco.</p>
                    </div>

                    <form action={handleAbrir} className="space-y-4">
                        <input type="hidden" name="store_id" value={storeId} />
                        <div>
                            <label className={labelStyle}>Saldo Inicial (Fundo de Caixa)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold z-10">R$</span>
                                <input
                                    type="number"
                                    name="saldo_inicial"
                                    step="0.01"
                                    required
                                    className={`${inputStyle} pl-10 text-lg`}
                                    placeholder="0,00"
                                    value={saldoInicialInput}
                                    onChange={(e) => setSaldoInicialInput(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* SUGESTÃO DE SALDO ANTERIOR */}
                        {ultimoFechamento && (
                            <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20 flex flex-col gap-2">
                                <div className="flex items-center gap-2 text-[10px] text-emerald-400 uppercase font-bold tracking-wider">
                                    <Wallet className="h-3 w-3" />
                                    Último Fechamento ({new Date(ultimoFechamento.data_fechamento).toLocaleDateString()}):
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-lg font-black text-white">{formatCurrency(ultimoFechamento.saldo_final)}</span>
                                    <button
                                        type="button"
                                        onClick={() => setSaldoInicialInput(String(ultimoFechamento.saldo_final))}
                                        className="text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded font-bold uppercase transition-colors border border-emerald-500/20"
                                    >
                                        Usar Saldo
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            disabled={isPending}
                            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase rounded-lg transition-colors shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50 border border-white/10"
                        >
                            {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Unlock className="h-5 w-5" />}
                            Abrir Caixa
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

            {/* --- TOOLBAR --- */}
            <div className="flex justify-end shrink-0">
                <button
                    onClick={() => setIsHistoricoModalOpen(true)}
                    className="bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold shadow-sm transition-all backdrop-blur-sm"
                    title="Ver histórico de fechamentos e quebras"
                >
                    <History className="h-4 w-4 text-emerald-400" />
                    Histórico de Fechamentos
                </button>
            </div>

            {/* --- TOPO: INDICADORES (KPIs) --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 shrink-0">

                {/* Card 0: FATURAMENTO MENSAL */}
                <div className="bg-indigo-500/15 backdrop-blur-md text-white p-3 rounded-xl shadow-lg border border-indigo-500/20 group relative">
                    <div className="absolute inset-0 overflow-hidden rounded-xl">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                            <TrendingUp className="h-12 w-12" />
                        </div>
                    </div>
                    <div className="relative z-10 w-full">
                        <div className="flex items-center gap-1 mb-1">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-300">Vendas (Mês)</p>
                            <HelpTooltip text="Total acumulado de vendas neste mês (1º dia até hoje) comparado com o mesmo período do mês anterior." />
                        </div>
                        <p className="text-xl font-black">
                            {formatCurrency(initialData.comparativo?.faturamento_mensal_atual || 0)}
                        </p>

                        {initialData.comparativo && (
                            <div className="flex items-center gap-1 mt-1">
                                {(() => {
                                    const atual = initialData.comparativo.faturamento_mensal_atual || 0
                                    const anterior = initialData.comparativo.faturamento_mensal_anterior || 0
                                    const diff = atual - anterior
                                    const pct = anterior > 0 ? (diff / anterior) * 100 : 0
                                    const isPositive = diff >= 0

                                    return (
                                        <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 ${isPositive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                                            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                            {Math.abs(pct).toFixed(1)}% vs. Mês Anterior
                                        </div>
                                    )
                                })()}
                            </div>
                        )}
                    </div>
                </div>

                {/* Card 1: Saldo Gaveta */}
                <div className="bg-emerald-500/15 backdrop-blur-md text-white p-3 rounded-xl shadow-lg border border-emerald-500/20 relative">
                    <div className="absolute inset-0 overflow-hidden rounded-xl">
                        <div className="p-2 bg-emerald-500/20 rounded-lg absolute right-3 top-3"><Wallet className="h-5 w-5 text-emerald-300" /></div>
                    </div>
                    <div className="relative z-10 w-full">
                        <div className="flex items-center gap-1 mb-1">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-300">Saldo Gaveta</p>
                            <HelpTooltip text="Dinheiro físico que deve estar na gaveta AGORA. (Saldo Inicial + Entradas Dinheiro - Saídas Dinheiro)" />
                        </div>
                        <p className="text-xl font-black">{formatCurrency(totais.saldo_esperado_dinheiro)}</p>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-[9px] text-slate-400">Fundo: {formatCurrency(initialData.caixa?.saldo_inicial || 0)}</p>
                            <button
                                type="button"
                                onClick={() => setIsSaldoModalOpen(true)}
                                className="text-[9px] bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded font-bold uppercase transition-colors text-slate-300"
                                title="Editar fundo de caixa"
                            >
                                Editar
                            </button>
                        </div>
                    </div>
                </div>

                {/* Card 2: Mov. Caixa (Hoje) */}
                <div className="bg-white/5 backdrop-blur-md p-3 rounded-xl border border-emerald-500/20 shadow-lg relative">
                    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                        <div className="absolute right-3 top-3 p-2 bg-emerald-500/10 text-emerald-400 rounded-lg"><Package className="h-5 w-5" /></div>
                    </div>
                    <div className="relative z-10 w-full pr-12">
                        <div className="flex items-center gap-1 mb-1">
                            <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Mov. Caixa (Hoje)</p>
                            <HelpTooltip text="Total de dinheiro que entrou hoje (Vendas em Dinheiro + Suprimentos - Sangrias/Retiradas)." />
                        </div>
                        <p className="text-xl font-black text-emerald-400">{formatCurrency(vendas.total_dinheiro + totais.entradas_manuais - totais.saidas_manuais)}</p>
                    </div>
                </div>

                {/* Card 3: Mov. Banco (Hoje) */}
                <div className="bg-white/5 backdrop-blur-md p-3 rounded-xl border border-sky-500/20 shadow-lg relative">
                    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                        <div className="absolute right-3 top-3 p-2 bg-sky-500/10 text-sky-400 rounded-lg"><TrendingUp className="h-5 w-5" /></div>
                    </div>
                    <div className="relative z-10 w-full pr-12">
                        <div className="flex items-center gap-1 mb-1">
                            <p className="text-[9px] font-bold text-sky-400 uppercase tracking-wider">Mov. Banco (Hoje)</p>
                            <HelpTooltip text="Total de recebimentos digitais HOJE (Pix + Cartões). Não entra na gaveta." />
                        </div>
                        <p className="text-xl font-black text-sky-400">{formatCurrency(vendas.total_pix + vendas.total_cartao)}</p>
                        <div className="flex gap-1 mt-1">
                            <span className="text-[8px] bg-sky-500/10 px-1 py-0.5 rounded text-sky-300 font-bold border border-sky-500/10">Pix: {formatCurrency(vendas.total_pix)}</span>
                            <span className="text-[8px] bg-sky-500/10 px-1 py-0.5 rounded text-sky-300 font-bold border border-sky-500/10">Cartão: {formatCurrency(vendas.total_cartao)}</span>
                        </div>
                    </div>
                </div>

                {/* Card 4: Sangrias */}
                <div className="bg-white/5 backdrop-blur-md p-3 rounded-xl border border-red-500/20 shadow-lg relative">
                    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                        <div className="absolute right-3 top-3 p-2 bg-red-500/10 text-red-400 rounded-lg"><TrendingDown className="h-5 w-5" /></div>
                    </div>
                    <div className="relative z-10 w-full pr-12">
                        <div className="flex items-center gap-1 mb-1">
                            <p className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Sangrias</p>
                            <HelpTooltip text="Total de retiradas de dinheiro da gaveta hoje (pagamentos, vales, depósitos)." />
                        </div>
                        <p className="text-xl font-black text-red-400">{formatCurrency(totais.saidas_manuais)}</p>
                        <p className="text-[9px] text-slate-500">{movimentacoes.filter(m => m.tipo === 'Saida').length} lançamentos</p>
                    </div>
                </div>
            </div>

            {/* --- CORPO: SPLIT VIEW --- */}
            <div className="flex-1 flex gap-6 overflow-hidden">

                {/* ESQUERDA (30%): CONTROLES */}
                <div className="w-1/3 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">

                    {/* CARD 1: NOVO LANÇAMENTO */}
                    <div className="bg-emerald-500/10 backdrop-blur-xl p-5 rounded-2xl shadow-lg border border-emerald-500/20">
                        <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                            <div className="p-1 bg-emerald-500/20 rounded text-emerald-400"><Save className="h-4 w-4" /></div>
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

                            <button disabled={isPending} className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white h-10 rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/10">
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                LANÇAR
                            </button>
                        </form>
                    </div>

                    {/* CARD 2: FECHAMENTO */}
                    <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/20 p-5 rounded-2xl shadow-lg mt-auto">
                        <h3 className="text-red-400 font-bold text-sm mb-3 flex items-center gap-2">
                            <Lock className="h-4 w-4" /> Fechar Caixa
                        </h3>
                        <form action={handleFechar} className="space-y-3">
                            <div>
                                <label className={labelStyle}>Contagem Física (Dinheiro)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-slate-500 font-bold">R$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        name="saldo_final"
                                        className={`${inputStyle} pl-9 focus:ring-red-500/50 focus:border-red-500/50`}
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="bg-red-500/10 p-2 rounded border border-red-500/20 text-[10px] text-red-300 font-medium flex gap-2">
                                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                                Diferenças serão registradas como Quebra de Caixa.
                            </div>

                            <button
                                disabled={isPending}
                                className="w-full bg-red-600 hover:bg-red-500 text-white h-10 rounded-xl font-bold shadow-lg shadow-red-500/20 flex justify-center items-center gap-2 transition-all active:scale-95 border border-white/10"
                            >
                                {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "ENCERRAR O DIA"}
                            </button>
                        </form>
                    </div>
                </div>

                {/* DIREITA (70%): EXTRATO DIVIDIDO */}
                <div className="flex-1 flex flex-col gap-4 overflow-hidden">

                    {/* PAINEL 1: MOVIMENTAÇÃO CAIXA (50%) */}
                    <div className="h-1/2 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 flex flex-col overflow-hidden shadow-lg">
                        <div className="bg-emerald-500/10 px-5 py-2 border-b border-white/10 flex justify-between items-center">
                            <h3 className="font-bold text-emerald-300 text-xs flex items-center gap-2 uppercase tracking-wide">
                                <Package className="h-4 w-4 text-emerald-400" /> Extrato de Movimentação Caixa
                            </h3>
                            <span className="text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded text-emerald-300 font-bold border border-emerald-500/20">
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
                    <div className="h-1/2 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 flex flex-col overflow-hidden shadow-lg">
                        <div className="bg-sky-500/10 px-5 py-2 border-b border-white/10 flex justify-between items-center">
                            <h3 className="font-bold text-sky-300 text-xs flex items-center gap-2 uppercase tracking-wide">
                                <DollarSign className="h-4 w-4 text-sky-400" /> Extrato de Movimentação Banco
                            </h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setReportType('pix')
                                        setIsReportModalOpen(true)
                                    }}
                                    className="text-[10px] bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded text-sky-300 font-bold border border-white/10 flex items-center gap-1 transition-colors"
                                    title="Imprimir Relatório PIX"
                                >
                                    <Printer className="h-3 w-3" /> PIX
                                </button>
                                <button
                                    onClick={() => {
                                        setReportType('cartoes')
                                        setIsReportModalOpen(true)
                                    }}
                                    className="text-[10px] bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded text-sky-300 font-bold border border-white/10 flex items-center gap-1 transition-colors"
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

            {isHistoricoModalOpen && (
                <HistoricoCaixaModal
                    storeId={storeId}
                    onClose={() => setIsHistoricoModalOpen(false)}
                />
            )}

            {isSaldoModalOpen && initialData?.caixa && (
                <SimpleModal
                    title="Editar Fundo de Caixa"
                    onClose={() => setIsSaldoModalOpen(false)}
                >
                    <form action={handleAtualizarSaldo} className="space-y-3">
                        <div>
                            <label className={labelStyle}>Novo Saldo Inicial (R$)</label>
                            <input
                                name="saldo_inicial"
                                type="number"
                                step="0.01"
                                defaultValue={initialData.caixa.saldo_inicial}
                                className={inputStyle}
                                required
                            />
                        </div>
                        <button
                            disabled={isPending}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-10 rounded-lg font-bold border border-white/10 transition-colors"
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
                                <label className={labelStyle}>Tipo</label>
                                <select name="tipo" defaultValue={editingMov.tipo} className={`${inputStyle} cursor-pointer`}>
                                    <option value="Saida">Saída</option>
                                    <option value="Entrada">Entrada</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelStyle}>Valor (R$)</label>
                                <input
                                    name="valor"
                                    type="number"
                                    step="0.01"
                                    defaultValue={editingMov.valor}
                                    className={`${inputStyle} text-right`}
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className={labelStyle}>Categoria</label>
                            <input
                                name="categoria"
                                defaultValue={editingMov.categoria || ''}
                                className={inputStyle}
                            />
                        </div>
                        <div>
                            <label className={labelStyle}>Descrição</label>
                            <input
                                name="descricao"
                                defaultValue={editingMov.descricao}
                                className={inputStyle}
                                required
                            />
                        </div>
                        <button
                            disabled={isPending}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-10 rounded-lg font-bold border border-white/10 transition-colors"
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
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <DollarSign className="h-8 w-8 mb-2 opacity-20" />
                <p className="text-[10px] font-bold uppercase">{emptyMessage}</p>
            </div>
        )
    }

    return (
        <table className="w-full text-sm text-left">
            <thead className="bg-white/5 sticky top-0 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/10 z-10">
                <tr>
                    <th className="px-4 py-2">Hora</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Descrição</th>
                    <th className="px-4 py-2 text-right">Valor</th>
                    <th className="px-2 py-2 text-right">Ações</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
                {movimentos.map((mov) => {
                    const isEntrada = mov.tipo === 'Entrada' || mov.tipo === 'Venda' || mov.tipo === 'Recebimento' || mov.tipo === 'Suprimento';
                    const isManual = typeof mov.id === 'string' && mov.id.startsWith('mov-')
                    const rawId = isManual ? Number(mov.id.replace('mov-', '')) : null
                    return (
                        <tr key={mov.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-2 text-slate-500 w-20 font-mono text-[10px]">{formatTime(mov.horario)}</td>
                            <td className="px-4 py-2 w-32">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase ${mov.tipo === 'Venda' ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' :
                                    mov.tipo === 'Recebimento' ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' :
                                        mov.tipo === 'Saida' ? 'bg-red-500/10 text-red-300 border-red-500/20' :
                                            'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                    }`}>
                                    {mov.forma_pagamento ? mov.forma_pagamento : mov.categoria || mov.tipo}
                                </span>
                            </td>
                            <td className="px-4 py-2 font-bold text-slate-300 text-xs truncate max-w-[150px]" title={mov.descricao}>
                                {mov.descricao}
                            </td>
                            <td className={`px-4 py-2 font-black text-right w-36 text-xs ${isEntrada ? 'text-emerald-400' : 'text-red-400'}`}>
                                {isEntrada ? '+' : '-'} {formatCurrency(mov.valor)}
                            </td>
                            <td className="px-2 py-2 text-right w-16">
                                {isManual && onEdit && rawId ? (
                                    <button
                                        type="button"
                                        onClick={() => onEdit({ ...mov, raw_id: rawId })}
                                        className="text-[10px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded font-bold text-slate-400 hover:text-white transition-colors"
                                        title="Editar lançamento"
                                    >
                                        <Pencil className="h-3 w-3 inline" />
                                    </button>
                                ) : (
                                    <span className="text-[9px] text-slate-600">-</span>
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
            <div className="w-full max-w-md bg-slate-900/95 backdrop-blur-xl rounded-xl shadow-2xl shadow-black/50 overflow-hidden border border-white/10" onClick={(e) => e.stopPropagation()}>
                <div className="px-4 py-3 border-b border-white/10 bg-slate-800/60 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">{title}</h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-red-400 transition-colors">✕</button>
                </div>
                <div className="p-4">
                    {children}
                </div>
            </div>
        </div>
    )
}

function HelpTooltip({ text, dark }: { text: string, dark?: boolean }) {
    return (
        <div className="group relative inline-block ml-1 align-middle z-20">
            <HelpCircle className="h-3 w-3 cursor-help opacity-40 hover:opacity-100 transition-opacity text-current" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] leading-tight rounded shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none transform translate-y-2 group-hover:translate-y-0 text-center font-normal border border-white/10">
                {text}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
            </div>
        </div>
    )
}
