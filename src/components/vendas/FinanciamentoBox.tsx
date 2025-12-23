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
import { Calendar, ClipboardList, AlertTriangle, CheckCircle2, Wallet, DollarSign, X, RefreshCw, Trash2, Calculator, Loader2 } from 'lucide-react'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import CollapsibleBox from './CollapsibleBox'

type Financiamento = Database['public']['Tables']['financiamento_loja']['Row']
type FinanciamentoParcela = Database['public']['Tables']['financiamento_parcelas']['Row']
type Employee = Database['public']['Tables']['employees']['Row']
type ParcelaGridItem = Pick<FinanciamentoParcela, 'numero_parcela' | 'data_vencimento' | 'valor_parcela'>

type FinanciamentoBoxProps = {
    financiamento: (Financiamento & { financiamento_parcelas: FinanciamentoParcela[] }) | null
    vendaId: number
    customerId: number
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
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pt-BR')
const getToday = () => new Date().toISOString().split('T')[0]

// Sugere data 30 dias no futuro (próximo mês)
const getFirstDueMonth = () => {
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setDate(today.getDate() + 30);
    return nextMonth.toISOString().split('T')[0];
}

const ParcelaInput = ({ valor, index, onChange }: { valor: number, index: number, onChange: (idx: number, val: string) => void }) => {
    const [localStr, setLocalStr] = useState(formatCurrency(valor))
    const [isFocused, setIsFocused] = useState(false)
    useEffect(() => { if (!isFocused) setLocalStr(formatCurrency(valor)) }, [valor, isFocused])
    return (
        <div className="flex items-center gap-1 w-full justify-end">
            <span className="text-gray-500 text-[10px] font-bold">R$</span>
            <input
                type="text" value={localStr} onFocus={() => setIsFocused(true)}
                onBlur={() => { setIsFocused(false); setLocalStr(formatCurrency(parseLocaleFloat(localStr))) }}
                onChange={(e) => { setLocalStr(e.target.value); onChange(index, e.target.value) }}
                className="w-20 text-right font-bold text-gray-900 bg-white border border-gray-400 rounded px-1 h-6 text-xs focus:ring-amber-500 focus:border-amber-500"
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
    const [dataPagto, setDataPagto] = useState(getFirstDueMonth())
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
                <div className="bg-amber-50 px-6 py-4 border-b border-amber-100 flex justify-between items-center">
                    <h3 className="font-bold text-amber-900 flex items-center gap-2">
                        <Wallet className="h-5 w-5" /> Receber Parcela {parcela.numero_parcela}
                    </h3>
                    <button onClick={onClose} type="button" className="p-1 rounded hover:bg-amber-200/50 transition-colors"><X className="h-5 w-5 text-amber-600" /></button>
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
    const [saveState, dispatchSave] = useFormState(saveFinanciamentoLoja, initialState)
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

    // Substitua a função handleConfirmRecebimento por esta versão com LOGS:

    const handleConfirmRecebimento = (dados: any) => {
        const formData = new FormData();

        // Adiciona os dados do formulário (agora com o nome correto 'valor_pago_total')
        Object.keys(dados).forEach(key => formData.append(key, dados[key]));

        // Adiciona dados fixos
        formData.append('venda_id', vendaId.toString());
        formData.append('store_id', storeId.toString());

        dispatchRecebimento(formData);
    }

    const labelStyle = 'block text-[9px] font-bold text-amber-100 mb-0.5 uppercase tracking-wider'
    // MODIFICADO: Aumentado contraste para border-gray-400
    const inputStyle = 'block w-full rounded-md border border-gray-400 bg-white shadow-sm text-gray-800 h-8 text-xs px-2 focus:ring-1 focus:ring-amber-300 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 placeholder:text-gray-400 transition-all'

    // Se já existe financiamento, mostra a lista
    if (isFinanced) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-amber-100 rounded-md text-amber-700">
                            <ClipboardList className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-amber-900">Carnê Ativo</h3>
                            <p className="text-[10px] text-amber-600 font-medium">
                                Total: R$ {formatCurrency(financiamento?.valor_total_financiado)}
                            </p>
                        </div>
                    </div>
                    {!disabled && !isQuitado && (
                        <button
                            onClick={handleResetCarne}
                            disabled={isResetting}
                            className="text-[10px] font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded border border-transparent hover:border-red-100 transition-all flex items-center gap-1"
                        >
                            {isResetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            {temParcelaPaga ? "RENEGOCIAR" : "CANCELAR"}
                        </button>
                    )}
                </div>

                {existeDivergencia && (
                    <div className="bg-orange-50 p-2 text-[10px] text-orange-800 border-b border-orange-100 flex items-center gap-2 justify-center font-bold">
                        <AlertTriangle className="h-3 w-3" />
                        Há R$ {formatCurrency(valorRestante)} não financiados.
                        <button onClick={handleResetCarne} className="underline hover:text-orange-900">Renegociar?</button>
                    </div>
                )}

                <div className="divide-y divide-gray-100">
                    {financiamento?.financiamento_parcelas.sort((a, b) => a.numero_parcela - b.numero_parcela).map((parcela) => (
                        <div key={parcela.id} className={`flex items-center justify-between p-3 hover:bg-gray-50 transition-colors ${parcela.status === 'Pago' ? 'bg-green-50/50' : ''}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${parcela.status === 'Pago' ? 'bg-green-100 text-green-700 border-green-200' :
                                    new Date(parcela.data_vencimento) < new Date() ? 'bg-red-100 text-red-700 border-red-200' :
                                        'bg-gray-100 text-gray-600 border-gray-200'
                                    }`}>
                                    {parcela.numero_parcela}
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-gray-800">R$ {formatCurrency(parcela.valor_parcela)}</p>
                                    <p className="text-[10px] text-gray-500 flex items-center gap-1">
                                        <Calendar className="h-3 w-3" /> {formatDate(parcela.data_vencimento)}
                                    </p>
                                </div>
                            </div>

                            <div>
                                {parcela.status === 'Pago' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-bold border border-green-200">
                                        <CheckCircle2 className="h-3 w-3" /> PAGO
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => setSelectedParcela(parcela)}
                                        disabled={disabled || isQuitado}
                                        className="px-3 py-1.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded hover:bg-amber-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        RECEBER
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {selectedParcela && (
                    <RecebimentoModal
                        parcela={selectedParcela}
                        onClose={() => setSelectedParcela(null)}
                        onConfirm={handleConfirmRecebimento}
                        storeId={storeId}
                    />
                )}
            </div>
        )
    }

    // MODO CRIAÇÃO (Formulário)
    return (
        <div className={isModal ? "bg-white p-3 h-full flex flex-col" : "relative bg-gradient-to-br from-amber-500 to-orange-600 p-3 rounded-xl shadow-md shadow-amber-200 border border-white/20"}>

            {!isModal && (
                <div className="flex items-center gap-1.5 mb-2 border-b border-white/20 pb-2">
                    <div className="p-1 bg-white/20 rounded-md text-white">
                        <Calculator className="h-4 w-4" />
                    </div>
                    <h3 className="text-xs font-bold text-white">
                        Gerar Carnê
                    </h3>
                </div>
            )}

            <form action={dispatchSave} className="space-y-2">
                <input type="hidden" name="venda_id" value={vendaId} />
                <input type="hidden" name="customer_id" value={customerId} />
                <input type="hidden" name="store_id" value={storeId} />
                <input type="hidden" name="employee_id" value={authedEmployee?.id || employeeId} />
                <input type="hidden" name="parcelas_json" value={JSON.stringify(parcelasGrid)} />

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className={isModal ? 'text-[10px] font-bold text-gray-500 mb-0.5' : labelStyle}>Valor Total (R$)</label>
                        <input
                            type="text"
                            value={valorFinanciadoStr}
                            onChange={(e) => setValorFinanciadoStr(e.target.value)}
                            className={`${inputStyle} font-bold text-amber-700 text-right`}
                        />
                    </div>
                    <div>
                        <label className={isModal ? 'text-[10px] font-bold text-gray-500 mb-0.5' : labelStyle}>1º Vencimento</label>
                        <input
                            type="date"
                            value={vencimentoPrimeira}
                            onChange={(e) => setVencimentoPrimeira(e.target.value)}
                            className={`${inputStyle} text-[10px]`}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 items-end">
                    <div>
                        <label className={isModal ? 'text-[10px] font-bold text-gray-500 mb-0.5' : labelStyle}>Qtd. Parcelas</label>
                        <select
                            value={qtdeParcelas}
                            onChange={(e) => setQtdeParcelas(parseInt(e.target.value))}
                            className={`${inputStyle} font-bold cursor-pointer`}
                        >
                            {[...Array(24)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}x</option>)}
                        </select>
                    </div>
                    <button
                        type="button"
                        onClick={handleCalcular}
                        className="h-8 bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-bold uppercase rounded shadow-sm transition-colors flex items-center justify-center gap-1"
                    >
                        <RefreshCw className="h-3 w-3" /> Calcular
                    </button>
                </div>

                {/* GRID DE PARCELAS */}
                {parcelasGrid.length > 0 && (
                    <div className="bg-white/90 rounded-lg p-2 max-h-[180px] overflow-y-auto custom-scrollbar border border-amber-100 shadow-inner mt-2">
                        <table className="w-full text-[10px]">
                            <thead>
                                <tr className="text-amber-800 border-b border-amber-100">
                                    <th className="text-left py-1 px-1">#</th>
                                    <th className="text-left py-1 px-1">Vencimento</th>
                                    <th className="text-right py-1 px-1">Valor</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {parcelasGrid.map((p, idx) => (
                                    <tr key={idx} className="hover:bg-amber-50">
                                        <td className="py-1 px-1 font-bold text-gray-600">{p.numero_parcela}x</td>
                                        <td className="py-1 px-1 text-gray-500">{formatDate(p.data_vencimento)}</td>
                                        <td className="py-1 px-1">
                                            <ParcelaInput valor={p.valor_parcela} index={idx} onChange={handleParcelaChange} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div>
                    <label className={isModal ? 'text-[10px] font-bold text-gray-500 mb-0.5' : labelStyle}>Observação</label>
                    <input
                        name="obs"
                        type="text"
                        value={obs}
                        onChange={(e) => setObs(e.target.value)}
                        className={inputStyle}
                        placeholder="Opcional..."
                    />
                </div>

                <div className="pt-2">
                    {!authedEmployee ? (
                        <button
                            type="button"
                            onClick={() => setIsConfigModalOpen(true)}
                            className="w-full h-9 bg-white text-amber-700 hover:bg-amber-50 font-bold text-xs rounded-lg shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
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
                                type="submit"
                                className="h-9 px-4 bg-green-500 hover:bg-green-600 text-white font-bold text-xs rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-1"
                            >
                                CONFIRMAR
                            </button>
                        </div>
                    )}
                </div>
            </form>

            {isConfigModalOpen && (
                <EmployeeAuthModal
                    storeId={storeId}
                    isOpen={isConfigModalOpen}
                    onClose={() => setIsConfigModalOpen(false)}
                    onSuccess={handleAuthSuccess}
                    title="Autorizar Carnê"
                    description="Confirme seu PIN para gerar o carnê."
                />
            )}
        </div>
    )
}