'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ResumoCaixa, 
  abrirCaixa, 
  adicionarMovimento, 
  fecharCaixa 
} from '@/lib/actions/cashflow.actions'
import { 
  Wallet, ArrowUpCircle, ArrowDownCircle, Lock, Unlock, 
  Save, Loader2, DollarSign, AlertTriangle, TrendingUp, TrendingDown, Package
} from 'lucide-react'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

// --- DESIGN SYSTEM (ALTO CONTRASTE) ---
const labelStyle = "block text-[10px] font-bold text-emerald-100 uppercase mb-1 tracking-wider"
const inputStyle = "block w-full rounded-lg border-0 bg-white shadow-sm text-slate-900 h-10 text-sm px-3 focus:ring-2 focus:ring-emerald-300 focus:outline-none font-bold placeholder:font-normal placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500 transition-all"

export default function CaixaInterface({ initialData, storeId }: { initialData: ResumoCaixa | null, storeId: number }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const formRef = useRef<HTMLFormElement>(null)
    
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
                            {isPending ? <Loader2 className="animate-spin"/> : <Unlock className="h-5 w-5" />}
                            ABRIR OPERAÇÃO
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    // 2. MODO CAIXA ABERTO (Dashboard)
    const { totais, vendas, movimentacoes, categoriasUsadas } = initialData

    return (
        <div className="flex flex-col h-full space-y-4">
            
            {/* --- TOPO: INDICADORES (KPIs) --- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                {/* Card Saldo Gaveta */}
                <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-lg shadow-emerald-100 flex items-center justify-between border border-white/10 relative overflow-hidden">
                     <div className="relative z-10">
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Saldo em Dinheiro (Gaveta)</p>
                        <p className="text-3xl font-black mt-1">{formatCurrency(totais.saldo_esperado_dinheiro)}</p>
                        <p className="text-[10px] mt-1 opacity-60">Fundo Inicial: {formatCurrency(initialData.caixa.saldo_inicial)}</p>
                     </div>
                     <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm"><Wallet className="h-6 w-6 text-white" /></div>
                </div>

                {/* Card Entradas Vendas */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Vendas (Hoje)</p>
                             <p className="text-2xl font-black text-slate-700">{formatCurrency(totais.saldo_geral_acumulado)}</p>
                        </div>
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><TrendingUp className="h-5 w-5" /></div>
                    </div>
                    <div className="flex gap-2 mt-2">
                        <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500 font-bold">Pix: {formatCurrency(vendas.total_pix)}</span>
                        <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500 font-bold">Cartão: {formatCurrency(vendas.total_cartao)}</span>
                    </div>
                </div>

                {/* Card Saídas */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saídas / Sangrias</p>
                        <p className="text-2xl font-black text-red-600">{formatCurrency(totais.saidas_manuais)}</p>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">{movimentacoes.filter(m => m.tipo === 'Saida').length} lançamentos</p>
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
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>} 
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
                                {isPending ? <Loader2 className="animate-spin h-4 w-4"/> : "ENCERRAR O DIA"}
                            </button>
                        </form>
                    </div>
                </div>

                {/* DIREITA (70%): EXTRATO */}
                <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
                         <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                             <Package className="h-4 w-4 text-slate-400" /> Extrato de Movimentações
                         </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                        {movimentacoes.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                <DollarSign className="h-12 w-12 mb-2 opacity-20" />
                                <p className="text-xs">Nenhuma movimentação manual hoje.</p>
                            </div>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white sticky top-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                    <tr>
                                        <th className="px-5 py-3">Hora</th>
                                        <th className="px-5 py-3">Categoria</th>
                                        <th className="px-5 py-3">Descrição</th>
                                        <th className="px-5 py-3 text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {movimentacoes.map(mov => (
                                        <tr key={mov.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-5 py-3 text-slate-500 w-24 font-mono text-xs">{formatTime(mov.created_at)}</td>
                                            <td className="px-5 py-3 w-40">
                                                {mov.categoria ? (
                                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-bold">{mov.categoria}</span>
                                                ) : (
                                                    <span className="text-[10px] text-slate-300">-</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 font-medium text-slate-700">{mov.descricao}</td>
                                            <td className={`px-5 py-3 font-bold text-right w-32 ${mov.tipo === 'Entrada' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {mov.tipo === 'Entrada' ? '+' : '-'} {formatCurrency(mov.valor)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

            </div>
        </div>
    )
}