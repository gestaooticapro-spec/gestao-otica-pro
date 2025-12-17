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
            <span className="text-gray-500 text-xs font-bold">R$</span>
            <input 
                type="text" value={localStr} onFocus={() => setIsFocused(true)}
                onBlur={() => { setIsFocused(false); setLocalStr(formatCurrency(parseLocaleFloat(localStr))) }}
                onChange={(e) => { setLocalStr(e.target.value); onChange(index, e.target.value) }}
                className="w-24 text-right font-bold text-gray-900 bg-white border border-gray-200 rounded px-1 h-7 text-sm focus:ring-amber-500 focus:border-amber-500"
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
            valor_pago: valorPago,
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
                    <button onClick={onClose} type="button" className="p-1 rounded hover:bg-amber-200/50 transition-colors"><X className="h-5 w-5 text-amber-600"/></button>
                </div>
                <form onSubmit={handlePreConfirm} className="p-6 space-y-5">
                    <div className="space-y-1 text-center">
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Valor da Parcela</p>
                        <p className="text-3xl font-black text-slate-700">R$ {formatCurrency(valorOriginal)}</p>
                    </div>
                   <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Valor a Receber</label>
                            <input type="text" value={valorPagoStr} onChange={e => setValorPagoStr(e.target.value)} className="w-full rounded-lg border-gray-300 focus:ring-amber-500 font-bold text-lg text-right"/>
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
  const labelStyle = 'text-[10px] font-bold text-amber-100 uppercase block mb-1 tracking-wider';
  const inputStyle = 'w-full h-10 rounded-lg border-0 bg-white shadow-sm text-sm px-3 focus:ring-2 focus:ring-amber-300 font-bold text-gray-800';

  const renderContent = () => (
    <>
      {isFinanced ? (
          /* MODO VISUALIZAÇÃO */
          <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-amber-50 pb-2">
                  <div>
                      <p className="text-[10px] text-amber-800 uppercase font-bold">Total Financiado</p>
                      <p className="text-xl font-black text-slate-700">{formatCurrency(financiamento?.valor_total_financiado)}</p>
                  </div>
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                      {financiamento?.quantidade_parcelas}x
                  </span>
              </div>

              <div className="space-y-2">
                  {financiamento?.financiamento_parcelas.sort((a,b) => a.numero_parcela - b.numero_parcela).map((p) => {
                      const isPago = p.status === 'Pago';
                      const isAtrasado = !isPago && new Date(p.data_vencimento) < new Date(new Date().setHours(0,0,0,0));
                      return (
                          <div key={p.id} className={`flex items-center justify-between p-2 rounded border transition-all ${isPago ? 'bg-green-50 border-green-100' : isAtrasado ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                              <div className="flex items-center gap-3">
                                  <span className="text-xs font-bold text-slate-500 w-6 text-center">{p.numero_parcela}ª</span>
                                  <div>
                                      <p className={`text-sm font-bold ${isPago ? 'text-green-700' : 'text-slate-700'}`}>{formatCurrency(p.valor_parcela)}</p>
                                      <p className="text-[10px] text-slate-400">Venc: {formatDate(p.data_vencimento)}</p>
                                  </div>
                              </div>
                              {isPago ? (
                                  <span className="text-[10px] font-bold text-green-700 bg-white border border-green-200 px-2 py-0.5 rounded flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/> Pago</span>
                              ) : (
                                  <button 
                                      type="button" 
                                      onClick={(e) => { e.stopPropagation(); setSelectedParcela(p); }}
                                      disabled={existeDivergencia} 
                                      className={`text-[10px] font-bold bg-white border border-amber-200 text-amber-700 hover:bg-amber-50 px-2 py-1 rounded flex items-center gap-1 shadow-sm ${existeDivergencia ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  >
                                      <DollarSign className="h-3 w-3" /> RECEBER
                                  </button>
                              )}
                          </div>
                      )
                  })}
              </div>

              {!existeDivergencia && (
                  <div className="pt-2 text-center">
                      <button onClick={handleResetCarne} disabled={isResetting} className="text-[10px] text-slate-400 hover:text-amber-600 font-bold inline-flex items-center gap-1 transition-colors uppercase tracking-wider">
                          {isResetting ? <Loader2 className="h-3 w-3 animate-spin"/> : temParcelaPaga ? <RefreshCw className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                          {temParcelaPaga ? 'Refinanciar Saldo' : 'Cancelar Carnê'}
                      </button>
                  </div>
              )}
          </div>
      ) : (
          /* MODO CRIAÇÃO */
          <div className="relative bg-gradient-to-br from-amber-500 to-orange-600 p-5 rounded-2xl shadow-lg shadow-orange-200 border border-white/20">
               <div className="flex items-center gap-2 mb-4 border-b border-white/20 pb-3">
                    <div className="p-1.5 bg-white/20 rounded-lg text-white">
                        <Calculator className="h-5 w-5" />
                   </div>
                   <h3 className="text-sm font-bold text-white">Gerar Parcelas</h3>
               </div>

               {isQuitado && !isDeletedLocally && (
                   <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl text-center p-4">
                       <div className="bg-green-50 border border-green-200 p-2 rounded-full mb-2"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
                       <p className="text-green-800 font-bold text-xs">Venda Quitada. Sem saldo para financiar.</p>
                   </div>
               )}

          {/* CRIAÇÃO MANUAL (SEM FORMULÁRIO HTML) */}
          {(() => {
              const handleCriarCarneManual = async () => {
                  if (parcelasGrid.length === 0) {
                      alert("Por favor, clique em CALCULAR antes de gerar o carnê.");
                      return;
                  }
                  
                  if (!confirm(`Confirma a criação do carnê em ${qtdeParcelas}x?`)) return;

                  const payload = {
                      venda_id: vendaId,
                      customer_id: customerId,
                      employee_id: authedEmployee?.id ?? employeeId,
                      valor_total: parseLocaleFloat(valorFinanciadoStr),
                      qtd_parcelas: qtdeParcelas,
                      data_primeiro_vencimento: vencimentoPrimeira,
                      obs: obs
                  };

                  const resultado = await saveFinanciamentoLoja(null, payload);

                  if (resultado.success) {
                      setParcelasGrid([]);
                      setIsDeletedLocally(false); // Garante que a UI atualize
                      await onFinanceAdded(); 
                  } else {
                      alert(resultado.message || "Erro desconhecido ao criar carnê.");
                  }
              };

              return (
                  <div className="space-y-4">
                       <div className="grid grid-cols-2 gap-3">
                          <div>
                              <label className={labelStyle}>Valor</label>
                              <input type="text" value={valorFinanciadoStr} onChange={e => { setValorFinanciadoStr(e.target.value); setParcelasGrid([]); }} className={`${inputStyle} text-right`} />
                          </div>
                          <div>
                              <label className={labelStyle}>Vezes</label>
                              <select value={qtdeParcelas} onChange={e => { setQtdeParcelas(parseInt(e.target.value)); setParcelasGrid([]); }} className={`${inputStyle} cursor-pointer`}>
                                  {[...Array(12)].map((_, i) => <option key={i} value={i+1}>{i+1}x</option>)}
                              </select>
                          </div>
                       </div>

                       <div className="flex gap-2 items-end">
                           <div className="flex-1">
                              <label className={labelStyle}>1º Vencimento</label>
                              <input type="date" value={vencimentoPrimeira} onChange={e => setVencimentoPrimeira(e.target.value)} className={inputStyle} />
                           </div>
                           <button type="button" onClick={handleCalcular} className="h-10 px-4 bg-white/20 hover:bg-white/30 border border-white/40 text-white rounded-lg text-xs font-bold transition-all">CALCULAR</button>
                       </div>

                       {parcelasGrid.length > 0 && (
                           <div className="bg-white/90 backdrop-blur-sm rounded-lg p-2 space-y-1 border border-white/50 max-h-40 overflow-y-auto custom-scrollbar shadow-inner">
                               {parcelasGrid.map((p, i) => (
                                   <div key={i} className="flex justify-between text-xs text-slate-700 border-b border-gray-200 last:border-0 pb-1 items-center font-medium">
                                       <span>{p.numero_parcela}ª - {formatDate(p.data_vencimento)}</span>
                                       <ParcelaInput valor={p.valor_parcela} index={i} onChange={handleParcelaChange} />
                                   </div>
                               ))}
                           </div>
                       )}

                       <div>
                          <label className={labelStyle}>Observação</label>
                          <input type="text" value={obs} onChange={(e) => setObs(e.target.value)} className={inputStyle} placeholder="Ex: Aprovado por..." />
                       </div>

                       <button 
                            type="button" 
                            onClick={handleCriarCarneManual}
                            disabled={parcelasGrid.length === 0} 
                            className="w-full h-10 bg-white text-amber-700 hover:bg-amber-50 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                       >
                           <ClipboardList className="h-4 w-4"/> GERAR CARNÊ
                       </button>
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
            {isConfigModalOpen && <EmployeeAuthModal storeId={storeId} isOpen={isConfigModalOpen} onClose={() => setIsConfigModalOpen(false)} onSuccess={handleAuthSuccess} title="Autorizar Emissão" description="PIN do responsável." />}
            {selectedParcela && <RecebimentoModal parcela={selectedParcela} storeId={storeId} onClose={() => setSelectedParcela(null)} onConfirm={handleConfirmRecebimento} />}
        </div>
      );
  }

  return (
    <>
        {isFinanced ? (
            <CollapsibleBox
                title="Carnê da Loja"
                icon={<Wallet className="h-5 w-5 text-amber-700" />}
                color="amber"
                defaultOpen={true}
                badge="EMITIDO"
            >
                {renderContent()}
            </CollapsibleBox>
        ) : renderContent()}

        {isConfigModalOpen && <EmployeeAuthModal storeId={storeId} isOpen={isConfigModalOpen} onClose={() => setIsConfigModalOpen(false)} onSuccess={handleAuthSuccess} title="Autorizar Emissão" description="PIN do responsável." />}
        {selectedParcela && <RecebimentoModal parcela={selectedParcela} storeId={storeId} onClose={() => setSelectedParcela(null)} onConfirm={handleConfirmRecebimento} />}
    </>
  )
}