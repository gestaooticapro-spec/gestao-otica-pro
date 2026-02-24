//============================
//📄 ARQUIVO: src/components/vendas/FinanciamentoBox.tsx
//============================

'use client'

import { useState, useEffect, useRef } from 'react'
import { useFormState } from 'react-dom'

import {
    saveFinanciamentoLoja,
    receberParcela,
    deleteFinanciamentoLoja,
    type CreateFinanciamentoResult,
} from '@/lib/actions/vendas.actions'

import { Database } from '@/lib/database.types'
import { Calendar, ClipboardList, AlertTriangle, CheckCircle2, Wallet, DollarSign, X, RefreshCw, Trash2, Calculator, Loader2, Printer } from 'lucide-react'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import UpdateCpfModal from '@/components/modals/UpdateCpfModal'
import CollapsibleBox from './CollapsibleBox'

type Financiamento = Database['public']['Tables']['financiamento_loja']['Row']
type FinanciamentoParcela = Database['public']['Tables']['financiamento_parcelas']['Row']
type Employee = Database['public']['Tables']['employees']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type ParcelaGridItem = Pick<FinanciamentoParcela, 'numero_parcela' | 'data_vencimento' | 'valor_parcela'>

type FinanciamentoBoxProps = {
    financiamento: (Financiamento & { financiamento_parcelas: FinanciamentoParcela[] }) | null
    vendaId: number
    customerId: number
    customer: Customer | null
    storeId: number
    employeeId: number
    valorRestante: number
    onFinanceAdded: () => Promise<void>
    disabled: boolean
    isQuitado?: boolean
    isModal?: boolean
}

// Helpers
const formatCurrency = (value: number | null | undefined) => (value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const parseLocaleFloat = (str: string) => parseFloat(str.replace(/\./g, '').replace(',', '.') || '0')
const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    // Fix timezone: se a data está no formato YYYY-MM-DD, faz split direto para evitar interpretação UTC
    if (dateStr.length === 10 && dateStr.includes('-')) {
        const [year, month, day] = dateStr.split('-')
        return `${day}/${month}/${year}`
    }
    return new Date(dateStr).toLocaleDateString('pt-BR')
}
const getToday = () => new Date().toISOString().split('T')[0]

// Sugere data: mesmo dia do próximo mês
const getFirstDueMonth = () => {
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(today.getMonth() + 1);

    if (nextMonth.getMonth() !== (today.getMonth() + 1) % 12) {
        nextMonth.setDate(0);
    }

    return nextMonth.toISOString().split('T')[0];
}

const ParcelaInput = ({ valor, index, onChange }: { valor: number, index: number, onChange: (idx: number, val: string) => void }) => {
    const [localStr, setLocalStr] = useState(formatCurrency(valor))
    const [isFocused, setIsFocused] = useState(false)
    useEffect(() => { if (!isFocused) setLocalStr(formatCurrency(valor)) }, [valor, isFocused])
    return (
        <div className="flex items-center gap-1 w-full justify-end">
            <span className="text-slate-500 text-[10px] font-bold">R$</span>
            <input
                type="text" value={localStr} onFocus={() => setIsFocused(true)}
                onBlur={() => { setIsFocused(false); setLocalStr(formatCurrency(parseLocaleFloat(localStr))) }}
                onChange={(e) => { setLocalStr(e.target.value); onChange(index, e.target.value) }}
                className="w-20 text-right font-bold text-slate-200 bg-white/5 border border-white/10 rounded px-1 h-6 text-xs focus:ring-amber-500/50 focus:border-amber-500/50 focus:outline-none placeholder:text-slate-600 transition-all"
            />
        </div>
    )
}

function RecebimentoModal({
    parcela,
    onClose,
    onConfirm,
    storeId
}: {
    parcela: FinanciamentoParcela,
    onClose: () => void,
    onConfirm: (dados: any) => void,
    storeId: number
}) {
    const [valorPagoStr, setValorPagoStr] = useState(formatCurrency(parcela.valor_parcela))
    const [forma, setForma] = useState('Dinheiro')
    const [dataPagto, setDataPagto] = useState(getToday())
    const [estrategia, setEstrategia] = useState<'criar_pendencia' | 'somar_proxima'>('criar_pendencia')
    const [isAuthOpen, setIsAuthOpen] = useState(false)
    const [dadosParaEnviar, setDadosParaEnviar] = useState<any>(null)

    const valorOriginal = parcela.valor_parcela
    const valorPago = parseLocaleFloat(valorPagoStr)
    const diferenca = valorOriginal - valorPago
    const isParcial = diferenca > 0.01

    const handlePreConfirm = (e: React.FormEvent) => {
        e.preventDefault()
        setDadosParaEnviar({
            parcela_id: parcela.id,
            valor_original: valorOriginal,
            valor_pago_total: valorPago,
            forma_pagamento: forma,
            data_pagamento: dataPagto,
            estrategia: isParcial ? estrategia : 'quitacao_total'
        })
        setIsAuthOpen(true)
    }

    const handleAuthSuccess = (employee: Pick<Employee, 'id' | 'full_name'>) => {
        setIsAuthOpen(false)
        onConfirm({ ...dadosParaEnviar, employee_id: employee.id })
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="bg-amber-950/30 px-6 py-4 border-b border-amber-500/20 flex justify-between items-center">
                    <h3 className="font-bold text-amber-500 flex items-center gap-2">
                        <Wallet className="h-5 w-5" /> Receber Parcela {parcela.numero_parcela}
                    </h3>
                    <button onClick={onClose} type="button" className="p-1 rounded hover:bg-white/10 transition-colors"><X className="h-5 w-5 text-amber-500" /></button>
                </div>
                <form onSubmit={handlePreConfirm} className="p-6 space-y-5">
                    <div className="space-y-1 text-center">
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Valor da Parcela</p>
                        <p className="text-3xl font-black text-slate-700">R$ {formatCurrency(valorOriginal)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Valor a Receber</label>
                            <input type="text" value={valorPagoStr} onChange={e => setValorPagoStr(e.target.value)} className="w-full rounded-lg border-gray-300 focus:ring-amber-500 font-bold text-lg text-right" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Forma</label>
                            <select value={forma} onChange={e => setForma(e.target.value)} className="w-full rounded-lg border-gray-300 focus:ring-amber-500 h-[46px]">
                                <option>Dinheiro</option><option>PIX</option><option>Cartão Débito</option><option>Cartão Crédito</option>
                            </select>
                        </div>
                    </div>
                    {isParcial && (
                        <div className="bg-red-50 p-4 rounded-xl border border-red-100 animate-in slide-in-from-top-2">
                            <div className="flex items-center gap-2 text-red-700 font-bold text-sm mb-3">
                                <AlertTriangle className="h-4 w-4" /><span>Diferença: R$ {formatCurrency(diferenca)}</span>
                            </div>
                            <div className="space-y-2">
                                <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-red-100/50 transition-colors">
                                    <input type="radio" name="strat" checked={estrategia === 'criar_pendencia'} onChange={() => setEstrategia('criar_pendencia')} className="mt-1 text-red-600 focus:ring-red-500" />
                                    <div><span className="block text-sm font-bold text-gray-800">Manter como Pendência</span><span className="block text-xs text-gray-500">Cria nova parcela.</span></div>
                                </label>
                                <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-red-100/50 transition-colors">
                                    <input type="radio" name="strat" checked={estrategia === 'somar_proxima'} onChange={() => setEstrategia('somar_proxima')} className="mt-1 text-red-600 focus:ring-red-500" />
                                    <div><span className="block text-sm font-bold text-gray-800">Jogar para Próxima</span><span className="block text-xs text-gray-500">Soma na próxima parcela.</span></div>
                                </label>
                            </div>
                        </div>
                    )}
                    <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl shadow-md transition-transform active:scale-95">CONFIRMAR RECEBIMENTO</button>
                </form>
                {isAuthOpen && (<EmployeeAuthModal storeId={storeId} isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onSuccess={handleAuthSuccess} title="Autorizar Baixa" description="Insira seu PIN." />)}
            </div>
        </div>
    )
}

export default function FinanciamentoBox({
    financiamento,
    vendaId,
    customerId,
    customer,
    storeId,
    employeeId,
    valorRestante,
    onFinanceAdded,
    disabled,
    isQuitado = false,
    isModal = false,
}: FinanciamentoBoxProps) {

    const formRef = useRef<HTMLFormElement>(null)

    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
    const [isCpfModalOpen, setIsCpfModalOpen] = useState(false)
    const [authedEmployee, setAuthedEmployee] = useState<Pick<Employee, 'id' | 'full_name'> | null>(null)
    const [selectedParcela, setSelectedParcela] = useState<FinanciamentoParcela | null>(null)
    const [isResetting, startResetTransition] = useState(false)

    const [isDeletedLocally, setIsDeletedLocally] = useState(false)

    const [valorFinanciadoStr, setValorFinanciadoStr] = useState('')
    const [qtdeParcelas, setQtdeParcelas] = useState(1)
    const [vencimentoPrimeira, setVencimentoPrimeira] = useState(getFirstDueMonth())
    const [parcelasGrid, setParcelasGrid] = useState<ParcelaGridItem[]>([])
    const [obs, setObs] = useState('')

    const initialState: CreateFinanciamentoResult = { success: false, message: '' }
    // NOTA: saveState removido pois usaremos chamada manual
    const [recebimentoState, dispatchRecebimento] = useFormState(receberParcela, { success: false, message: '' })

    const isFinanced = !!financiamento && !isDeletedLocally;
    const existeDivergencia = isFinanced && valorRestante > 0.01;
    const temParcelaPaga = financiamento?.financiamento_parcelas.some(p => p.status === 'Pago')

    useEffect(() => {
        if (isDeletedLocally) return;

        if (!isFinanced) {
            if (valorRestante > 0.01) {
                setValorFinanciadoStr(formatCurrency(valorRestante));
            }
        } else {
            setValorFinanciadoStr(formatCurrency(financiamento?.valor_total_financiado));
        }
    }, [valorRestante, isFinanced, financiamento, isDeletedLocally])

    useEffect(() => {
        if (!financiamento && isDeletedLocally) {
            setIsDeletedLocally(false);
        }
    }, [financiamento, isDeletedLocally])

    useEffect(() => {
        if (recebimentoState.success) { setSelectedParcela(null); onFinanceAdded(); }
        else if (recebimentoState.message) { alert(recebimentoState.message); }
    }, [recebimentoState, onFinanceAdded])

    const handleCalcular = () => {
        const valorTotal = parseLocaleFloat(valorFinanciadoStr);
        if (valorTotal <= 0) return;
        const parteInteira = Math.floor(valorTotal);
        const centavos = valorTotal - parteInteira;
        const valorBaseInteiro = Math.floor(parteInteira / qtdeParcelas);
        const restoInteiro = parteInteira % qtdeParcelas;
        const novas: ParcelaGridItem[] = [];
        const [y, m, d] = vencimentoPrimeira.split('-').map(Number);
        const dataBase = new Date(y, m - 1, d, 12);
        for (let i = 0; i < qtdeParcelas; i++) {
            let val = valorBaseInteiro;
            if (i < restoInteiro) val += 1;
            if (i === 0) val += centavos;
            const dt = new Date(dataBase); dt.setMonth(dataBase.getMonth() + i);
            novas.push({ numero_parcela: i + 1, data_vencimento: dt.toISOString().split('T')[0], valor_parcela: parseFloat(val.toFixed(2)) });
        }
        setParcelasGrid(novas);
    }

    const handleParcelaChange = (index: number, novoValorStr: string) => {
        const novoValor = parseLocaleFloat(novoValorStr);
        const gridAtualizado = [...parcelasGrid];
        gridAtualizado[index] = { ...gridAtualizado[index], valor_parcela: novoValor };
        setParcelasGrid(gridAtualizado);
    };

    const handleResetCarne = async () => {
        if (!confirm(temParcelaPaga ? "Isso apagará as parcelas pendentes para renegociar o saldo. Confirmar?" : "Isso cancelará o carnê inteiro. Confirmar?")) return;

        const valorParaRestaurar = financiamento?.valor_total_financiado || 0;

        startResetTransition(true);

        try {
            const res = await deleteFinanciamentoLoja(vendaId, storeId);

            // Verifica se deu sucesso OU se o erro é "já não existe mais" (que na prática é sucesso)
            const msg = res?.message ? res.message.toLowerCase() : '';
            const isSuccess = res?.success || msg.includes('not found') || msg.includes('excluído');

            if (isSuccess) {
                setIsDeletedLocally(true);
                resetFormularioCriacao(valorParaRestaurar);
                await onFinanceAdded();
            } else {
                alert(res?.message || 'Erro desconhecido');
            }
        } catch (error: any) {
            console.error(error);
            alert('Ocorreu um erro ao excluir. Tente recarregar a página.');
        } finally {
            startResetTransition(false);
        }
    }

    const resetFormularioCriacao = (valorSugerido?: number) => {
        const valorInicial = valorSugerido !== undefined ? valorSugerido : valorRestante;
        setValorFinanciadoStr(formatCurrency(valorInicial));
        setQtdeParcelas(1);
        setVencimentoPrimeira(getFirstDueMonth());
        setParcelasGrid([]);
        setObs('');
        setAuthedEmployee(null);
        setIsConfigModalOpen(false);
    }

    const handleAuthSuccess = (employee: Pick<Employee, 'id' | 'full_name'>) => {
        setAuthedEmployee(employee);
        setIsConfigModalOpen(false);
    }

    const handleConfirmRecebimento = (dados: any) => {
        const formData = new FormData();
        Object.keys(dados).forEach(key => formData.append(key, dados[key]));
        formData.append('venda_id', vendaId.toString());
        formData.append('store_id', storeId.toString());

        // Chamada direta para evitar complexidade
        receberParcela(null, formData).then(res => {
            if (res.success) { setSelectedParcela(null); onFinanceAdded(); }
            else { alert(res.message); }
        });
    }

    // Estilos
    const labelStyle = 'block text-[10px] font-bold text-slate-400 mb-0.5 uppercase tracking-wider';
    const inputStyle = 'block w-full rounded-md border border-white/10 bg-white/5 shadow-sm text-slate-200 h-9 text-xs px-2 focus:ring-1 focus:ring-amber-500/50 focus:outline-none disabled:bg-white/5 disabled:text-slate-500 placeholder:text-slate-600 transition-all';

    const renderContent = () => (
        <>
            {isFinanced ? (
                /* MODO VISUALIZAÇÃO */
                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden shadow-lg backdrop-blur-sm">
                    <div className="bg-amber-500/5 px-4 py-3 border-b border-amber-500/10 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-amber-500/20 rounded-lg text-amber-400 ring-1 ring-amber-500/30">
                                <ClipboardList className="h-4 w-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-amber-400">Carnê Ativo</h3>
                            </div>
                        </div>
                        {!disabled && !isQuitado && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => window.open(`/print/promissoria/${financiamento.id}`, '_blank')}
                                    className="text-[10px] font-bold text-blue-400 hover:bg-blue-500/10 px-2 py-1 rounded border border-transparent hover:border-blue-500/20 transition-all flex items-center gap-1"
                                    title="Imprimir Compromisso de Pagamento"
                                >
                                    <Printer className="h-3 w-3" /> IMPRIMIR DUPLICATA
                                </button>
                                <button
                                    onClick={() => window.open(`/print/carne/${financiamento.id}`, '_blank')}
                                    className="text-[10px] font-bold text-amber-400 hover:bg-amber-500/10 px-2 py-1 rounded border border-transparent hover:border-amber-500/20 transition-all flex items-center gap-1"
                                    title="Imprimir Carnê de Pagamento"
                                >
                                    <Printer className="h-3 w-3" /> IMPRIMIR CARNÊ
                                </button>
                                <button
                                    onClick={handleResetCarne}
                                    disabled={isResetting}
                                    className="text-[10px] font-bold text-red-400 hover:bg-red-500/10 px-2 py-1 rounded border border-transparent hover:border-red-500/20 transition-all flex items-center gap-1"
                                >
                                    {isResetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                    RENEGOCIAR
                                </button>
                            </div>
                        )}
                    </div>

                    {existeDivergencia && (
                        <div className="bg-orange-900/20 p-2 text-[10px] text-orange-300 border-b border-orange-500/20 flex items-center gap-2 justify-center font-bold">
                            <AlertTriangle className="h-3 w-3" />
                            Há R$ {formatCurrency(valorRestante)} não financiados.
                            <button onClick={handleResetCarne} className="underline hover:text-orange-200">Renegociar?</button>
                        </div>
                    )}

                    <div className="divide-y divide-white/5">
                        {financiamento?.financiamento_parcelas.sort((a, b) => a.numero_parcela - b.numero_parcela).map((p) => {
                            const isPago = p.status === 'Pago';
                            const isAtrasado = !isPago && new Date(p.data_vencimento) < new Date(new Date().setHours(0, 0, 0, 0));
                            return (
                                <div key={p.id} className={`flex items-center justify-between p-3 hover:bg-white/5 transition-colors ${isPago ? 'bg-green-500/5' : ''}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${isPago ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                                            isAtrasado ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                                'bg-white/5 text-slate-400 border-white/10'
                                            }`}>
                                            {p.numero_parcela}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-200">R$ {formatCurrency(p.valor_parcela)}</p>
                                            <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                                <Calendar className="h-3 w-3" /> {formatDate(p.data_vencimento)}
                                            </p>
                                        </div>
                                    </div>
                                    <div>
                                        {isPago ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-[10px] font-bold border border-green-500/30">
                                                <CheckCircle2 className="h-3 w-3" /> PAGO
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setSelectedParcela(p); }}
                                                disabled={disabled || isQuitado}
                                                className="px-3 py-1.5 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-lg hover:bg-amber-500/30 border border-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-900/20"
                                            >
                                                RECEBER
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ) : (
                /* MODO CRIAÇÃO */
                <div className={isModal ? "bg-transparent p-3 h-full flex flex-col" : "relative bg-gradient-to-br from-amber-600/20 to-orange-700/20 backdrop-blur-md p-3 rounded-xl shadow-lg border border-amber-500/20"}>
                    {!isModal && (
                        <div className="flex items-center gap-1.5 mb-2 border-b border-amber-500/20 pb-2">
                            <div className="p-1 bg-amber-500/20 rounded-md text-amber-400">
                                <Calculator className="h-4 w-4" />
                            </div>
                            <h3 className="text-xs font-bold text-amber-300">Gerar Carnê</h3>
                        </div>
                    )}

                    {isQuitado && !isDeletedLocally && (
                        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl text-center p-4">
                            <div className="bg-green-50 border border-green-200 p-2 rounded-full mb-2"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
                            <p className="text-green-800 font-bold text-xs">Venda Quitada. Sem saldo para financiar.</p>
                        </div>
                    )}

                    {/* CRIAÇÃO MANUAL (SEM FORMULÁRIO HTML) */}
                    {(() => {
                        // Cálculo da soma das parcelas editadas
                        const somaParcelasEditadas = parcelasGrid.reduce((acc, p) => acc + p.valor_parcela, 0);
                        const valorTotalEsperado = parseLocaleFloat(valorFinanciadoStr);
                        const diferencaSoma = Math.abs(somaParcelasEditadas - valorTotalEsperado);
                        const somaValida = diferencaSoma < 0.02; // Tolerância de 2 centavos

                        const handleCriarCarneManual = async (empIdOverride?: number) => {
                            if (parcelasGrid.length === 0) {
                                alert("Por favor, clique em CALCULAR antes de gerar o carnê.");
                                return;
                            }

                            if (!somaValida) {
                                alert("A soma das parcelas não corresponde ao valor total. Ajuste os valores.");
                                return;
                            }

                            // Prepara parcelas customizadas para enviar ao backend
                            const parcelasCustomizadas = parcelasGrid.map(p => ({
                                numero_parcela: p.numero_parcela,
                                data_vencimento: p.data_vencimento,
                                valor_parcela: p.valor_parcela
                            }));

                            const payload = {
                                venda_id: vendaId,
                                customer_id: customerId,
                                employee_id: empIdOverride ?? authedEmployee?.id ?? employeeId,
                                valor_total: parseLocaleFloat(valorFinanciadoStr),
                                qtd_parcelas: qtdeParcelas,
                                data_primeiro_vencimento: vencimentoPrimeira,
                                obs: obs,
                                parcelas_customizadas: parcelasCustomizadas
                            };

                            const resultado = await saveFinanciamentoLoja(null, payload);

                            if (resultado.success) {
                                setParcelasGrid([]);
                                setIsDeletedLocally(false); // Garante que a UI atualize
                                await onFinanceAdded();

                                // AUTO-PRINT: Abre a impressão automaticamente
                                if (resultado.data?.id) {
                                    window.open(`/print/promissoria/${resultado.data.id}`, '_blank');
                                }
                            } else {
                                alert(resultado.message || "Erro desconhecido ao criar carnê.");
                            }
                        };

                        // AUTO-TRIGGER: Assim que autenticar, já chama a criação
                        const handleAuthSuccessAuto = (employee: Pick<Employee, 'id' | 'full_name'>) => {
                            setAuthedEmployee(employee);
                            setIsConfigModalOpen(false);
                            handleCriarCarneManual(employee.id);
                        }

                        return (
                            <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className={labelStyle}>Valor Total (R$)</label>
                                        <input type="text" value={valorFinanciadoStr} onChange={e => { setValorFinanciadoStr(e.target.value); setParcelasGrid([]); }} className={`${inputStyle} font-bold text-amber-400 text-right`} />
                                    </div>
                                    <div>
                                        <label className={labelStyle}>1º Vencimento</label>
                                        <input type="date" value={vencimentoPrimeira} onChange={e => { setVencimentoPrimeira(e.target.value); setParcelasGrid([]); }} className={`${inputStyle} text-[10px]`} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 items-end">
                                    <div>
                                        <label className={labelStyle}>Qtd. Parcelas</label>
                                        <select value={qtdeParcelas} onChange={e => { setQtdeParcelas(parseInt(e.target.value)); setParcelasGrid([]); }} className={`${inputStyle} font-bold cursor-pointer text-slate-300`}>
                                            {[...Array(24)].map((_, i) => <option key={i} value={i + 1} className="bg-slate-800">{i + 1}x</option>)}
                                        </select>
                                    </div>
                                    <button type="button" onClick={handleCalcular} className="h-8 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold uppercase rounded shadow-lg shadow-amber-900/30 transition-colors flex items-center justify-center gap-1">
                                        <RefreshCw className="h-3 w-3" /> Calcular
                                    </button>
                                </div>

                                {parcelasGrid.length > 0 && (
                                    <div className="bg-white/5 rounded-lg p-2 max-h-[180px] overflow-y-auto custom-scrollbar border border-white/10 shadow-inner mt-2">
                                        <table className="w-full text-[10px]">
                                            <thead>
                                                <tr className="text-amber-400 border-b border-white/10">
                                                    <th className="text-left py-1 px-1">#</th>
                                                    <th className="text-left py-1 px-1">Vencimento</th>
                                                    <th className="text-right py-1 px-1">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {parcelasGrid.map((p, i) => (
                                                    <tr key={i} className="hover:bg-white/5 transition-colors">
                                                        <td className="py-1 px-1 font-bold text-slate-400">{p.numero_parcela}x</td>
                                                        <td className="py-1 px-1 text-slate-300">{formatDate(p.data_vencimento)}</td>
                                                        <td className="py-1 px-1">
                                                            <ParcelaInput valor={p.valor_parcela} index={i} onChange={handleParcelaChange} />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            {/* Linha de totais com validação visual */}
                                            <tfoot>
                                                <tr className={`border-t-2 font-bold ${somaValida ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                                                    <td colSpan={2} className={`py-1.5 px-1 text-right ${somaValida ? 'text-green-400' : 'text-red-400'}`}>
                                                        {somaValida ? '✓ Total:' : '✗ Soma inválida:'}
                                                    </td>
                                                    <td className={`py-1.5 px-1 text-right ${somaValida ? 'text-green-400' : 'text-red-400'}`}>
                                                        R$ {formatCurrency(somaParcelasEditadas)}
                                                    </td>
                                                </tr>
                                                {!somaValida && (
                                                    <tr className="bg-red-500/10">
                                                        <td colSpan={3} className="py-1 px-1 text-center text-red-400 text-[9px]">
                                                            Esperado: R$ {formatCurrency(valorTotalEsperado)} | Diferença: R$ {formatCurrency(diferencaSoma)}
                                                        </td>
                                                    </tr>
                                                )}
                                            </tfoot>
                                        </table>
                                    </div>
                                )}

                                <div>
                                    <label className={labelStyle}>Observação</label>
                                    <input type="text" value={obs} onChange={(e) => setObs(e.target.value)} className={inputStyle} placeholder="Opcional..." />
                                </div>

                                <div className="pt-2">
                                    {/* MODAL DE AUTH AGORA CHAMA O AUTO-TRIGGER */}
                                    {isConfigModalOpen && <EmployeeAuthModal storeId={storeId} isOpen={isConfigModalOpen} onClose={() => setIsConfigModalOpen(false)} onSuccess={handleAuthSuccessAuto} title="Autorizar Emissão" description="PIN do responsável." />}

                                    {!authedEmployee ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!customer?.cpf || !customer?.fone_movel) {
                                                    setIsCpfModalOpen(true)
                                                    return
                                                }
                                                setIsConfigModalOpen(true)
                                            }}
                                            disabled={parcelasGrid.length === 0 || !somaValida}
                                            className={`w-full h-9 font-bold text-xs rounded-lg shadow-lg shadow-amber-900/20 transition-all active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide ${somaValida ? 'bg-amber-500 hover:bg-amber-600 text-white border border-amber-500/50' : 'bg-white/10 text-slate-500 border border-white/10'}`}
                                        >
                                            <CheckCircle2 className="h-4 w-4" /> GERAR CARNÊ
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                                            <div className="flex-1 bg-white/20 text-white text-[10px] font-bold px-2 py-1.5 rounded flex items-center justify-between border border-white/30">
                                                <span>{authedEmployee.full_name}</span>
                                                <button type="button" onClick={() => setAuthedEmployee(null)}><X className="h-3 w-3" /></button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleCriarCarneManual()}
                                                className="h-9 px-4 bg-green-500 hover:bg-green-600 text-white font-bold text-xs rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-1"
                                            >
                                                CONFIRMAR
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })()}
                </div>
            )}
        </>
    );

    if (isModal) {
        return (
            <div className="h-full overflow-y-auto custom-scrollbar pr-1 pt-2">
                {renderContent()}

                {selectedParcela && <RecebimentoModal parcela={selectedParcela} storeId={storeId} onClose={() => setSelectedParcela(null)} onConfirm={handleConfirmRecebimento} />}

                {isCpfModalOpen && customer && (
                    <UpdateCpfModal
                        isOpen={isCpfModalOpen}
                        onClose={() => setIsCpfModalOpen(false)}
                        onSuccess={() => { setIsCpfModalOpen(false); onFinanceAdded(); }}
                        customerId={customer.id}
                        customerName={customer.full_name}
                        currentCpf={customer.cpf || ''}
                        currentPhone={customer.fone_movel || customer.phone || ''}
                    />
                )}
            </div>
        );
    }

    return (
        <>
            {isFinanced ? (
                <CollapsibleBox
                    title="Carnê da Loja"
                    icon={<Wallet className="h-5 w-5 text-amber-400" />}
                    color="amber"
                    defaultOpen={true}
                    badge="EMITIDO"
                    subtitle={
                        <div className="absolute inset-0 pointer-events-none hidden md:flex items-center">
                            {/* This inner div mimics the column spacing of the Pagamentos table above */}
                            <div className="w-full flex px-2" style={{ marginRight: '16px' }}>
                                {/* 2/12 (Data) + 3/12 (Forma) = 5/12 offset */}
                                <div className="w-5/12"></div>
                                {/* 3/12 (Responsável) */}
                                <div className="w-3/12 font-bold text-xs text-slate-500 uppercase truncate pl-1" title={(financiamento as any)?.employee?.full_name}>
                                    {(financiamento as any)?.employee?.full_name?.split(' ')[0] || ''}
                                </div>
                                {/* 2/12 (Valor) */}
                                <div className="w-2/12 text-right font-bold text-xs text-amber-400">
                                    {formatCurrency(financiamento?.valor_total_financiado)}
                                </div>
                                {/* 1/12 + 1/12 (Parc + Actions) */}
                                <div className="w-2/12"></div>
                            </div>
                        </div>
                    }
                >
                    {renderContent()}
                </CollapsibleBox>
            ) : renderContent()}


            {selectedParcela && <RecebimentoModal parcela={selectedParcela} storeId={storeId} onClose={() => setSelectedParcela(null)} onConfirm={handleConfirmRecebimento} />}

            {isCpfModalOpen && customer && (
                <UpdateCpfModal
                    isOpen={isCpfModalOpen}
                    onClose={() => setIsCpfModalOpen(false)}
                    onSuccess={() => { setIsCpfModalOpen(false); onFinanceAdded(); }}
                    customerId={customer.id}
                    customerName={customer.full_name}
                    currentCpf={customer.cpf || ''}
                    currentPhone={customer.fone_movel || customer.phone || ''}
                />
            )}
        </>
    )
}