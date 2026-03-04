'use client'

import { useState, useTransition } from 'react'
import {
    X, Calendar, DollarSign, Loader2, User, Printer,
    Stethoscope, CheckCircle2, Filter, TrendingUp, AlertCircle
} from 'lucide-react'
import {
    getRelatorioComissoesMedicos,
    pagarComissoesMedicoEmLote,
    type ResumoComissaoMedico
} from '@/lib/actions/commission.actions'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (d: string) => { try { return new Date(d).toLocaleDateString('pt-BR') } catch { return d } }

export default function MedicoComissaoModal({
    isOpen,
    onClose,
    storeId
}: {
    isOpen: boolean
    onClose: () => void
    storeId: number
}) {
    const now = new Date()
    const [dataInicio, setDataInicio] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
    const [dataFim, setDataFim] = useState(now.toISOString().split('T')[0])
    const [data, setData] = useState<ResumoComissaoMedico[]>([])
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [isLoading, startTransition] = useTransition()
    const [isPaying, startPayTransition] = useTransition()
    const [loaded, setLoaded] = useState(false)

    const selectedMedico = data.find(d => d.oftalmologista_id === selectedId)

    const handleFilter = () => {
        startTransition(async () => {
            const res = await getRelatorioComissoesMedicos(storeId, dataInicio, dataFim)
            if (res.success && res.data) {
                setData(res.data)
                setSelectedId(null)
                setLoaded(true)
            }
        })
    }

    const handlePagar = () => {
        if (!selectedMedico) return
        const pendentes = selectedMedico.detalhes.filter(d => d.status === 'Pendente')
        if (pendentes.length === 0) return
        const ids = pendentes.map(d => d.id)
        const total = pendentes.reduce((acc, curr) => acc + curr.valor_comissao, 0)

        if (!confirm(`Confirmar pagamento de ${formatCurrency(total)} para Dr(a). ${selectedMedico.nome_medico}?`)) return

        startPayTransition(async () => {
            const res = await pagarComissoesMedicoEmLote(storeId, selectedMedico.oftalmologista_id, ids)
            if (res.success) {
                alert('Pagamento registrado!')
                handleFilter() // Reload
            } else {
                alert('Erro: ' + res.message)
            }
        })
    }

    const handlePrint = () => {
        if (!selectedMedico) return
        const printWindow = window.open('', '_blank', 'width=800,height=600')
        if (!printWindow) return

        const rows = selectedMedico.detalhes
            .map(d => `
                <tr>
                    <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:12px">${formatDate(d.data)}</td>
                    <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:12px">${d.cliente_nome}</td>
                    <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:12px;text-align:right">${formatCurrency(d.valor_venda)}</td>
                    <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:12px;text-align:right;font-weight:bold">${formatCurrency(d.valor_comissao)}</td>
                    <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:12px;text-align:center">
                        <span style="padding:2px 8px;border-radius:12px;font-size:10px;font-weight:bold;${d.status === 'Pago' ? 'background:#d1fae5;color:#065f46' : 'background:#fef3c7;color:#92400e'}">${d.status}</span>
                    </td>
                </tr>
            `).join('')

        const totalComissao = selectedMedico.detalhes.reduce((acc, d) => acc + d.valor_comissao, 0)

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Relatório de Comissão - Dr(a). ${selectedMedico.nome_medico}</title>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #333; }
                    h1 { font-size: 18px; margin-bottom: 4px; }
                    .periodo { font-size: 12px; color: #666; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
                    .totais { margin-top: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; display: flex; gap: 30px; }
                    .totais div { }
                    .totais .label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: bold; }
                    .totais .valor { font-size: 20px; font-weight: 900; color: #1e293b; }
                    .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; }
                    .footer .assinatura { width: 200px; text-align: center; border-top: 1px solid #333; padding-top: 5px; font-size: 11px; }
                    @media print { body { padding: 15px; } }
                </style>
            </head>
            <body>
                <h1>Relatório de Comissão — Dr(a). ${selectedMedico.nome_medico}</h1>
                <p class="periodo">Período: ${formatDate(dataInicio)} a ${formatDate(dataFim)}</p>

                <table>
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Cliente</th>
                            <th style="text-align:right">Valor Venda</th>
                            <th style="text-align:right">Comissão</th>
                            <th style="text-align:center">Status</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>

                <div class="totais">
                    <div>
                        <div class="label">Vendas no Período</div>
                        <div class="valor">${formatCurrency(selectedMedico.total_vendas)}</div>
                    </div>
                    <div>
                        <div class="label">Total Comissão</div>
                        <div class="valor">${formatCurrency(totalComissao)}</div>
                    </div>
                    <div>
                        <div class="label">Pendente</div>
                        <div class="valor" style="color:#d97706">${formatCurrency(selectedMedico.comissao_pendente)}</div>
                    </div>
                    <div>
                        <div class="label">Já Pago</div>
                        <div class="valor" style="color:#059669">${formatCurrency(selectedMedico.comissao_paga)}</div>
                    </div>
                </div>

                <div class="footer">
                    <div class="assinatura">Responsável</div>
                    <div class="assinatura">Dr(a). ${selectedMedico.nome_medico}</div>
                </div>
            </body>
            </html>
        `)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => printWindow.print(), 300)
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-[95vw] max-w-5xl h-[85vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-teal-600/30 to-emerald-700/30 px-6 py-4 border-b border-white/10 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-sm font-bold text-teal-300 flex items-center gap-2 uppercase tracking-wider">
                            <Stethoscope className="h-4 w-4" /> Comissão de Médicos Parceiros
                        </h2>
                        <p className="text-[10px] text-teal-400/60 mt-0.5">Relatório mensal por período</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex flex-1 overflow-hidden">

                    {/* Left Panel: Filters + List */}
                    <div className="w-1/3 flex flex-col border-r border-white/10 bg-slate-900/50">
                        {/* Filters */}
                        <div className="p-4 border-b border-white/10 space-y-3">
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">De</label>
                                    <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                                        className="w-full h-8 rounded-lg border border-white/10 bg-black/30 text-slate-200 text-xs px-2 font-bold outline-none focus:ring-1 focus:ring-teal-500/50" />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Até</label>
                                    <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                                        className="w-full h-8 rounded-lg border border-white/10 bg-black/30 text-slate-200 text-xs px-2 font-bold outline-none focus:ring-1 focus:ring-teal-500/50" />
                                </div>
                            </div>
                            <button onClick={handleFilter} disabled={isLoading}
                                className="w-full h-8 bg-teal-600/30 hover:bg-teal-600/50 text-teal-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-teal-500/30 transition-colors">
                                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Filter className="h-3 w-3" />}
                                BUSCAR
                            </button>
                        </div>

                        {/* Doctor List */}
                        <div className="flex-1 overflow-y-auto">
                            {!loaded ? (
                                <div className="text-center p-8 text-slate-500 text-xs">
                                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                    <p>Selecione o período e clique em Buscar</p>
                                </div>
                            ) : data.length === 0 ? (
                                <div className="text-center p-8 text-slate-500 text-xs">
                                    <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                    <p>Nenhuma comissão no período.</p>
                                </div>
                            ) : (
                                data.map(item => (
                                    <div
                                        key={item.oftalmologista_id}
                                        onClick={() => setSelectedId(item.oftalmologista_id)}
                                        className={`p-3 border-b border-white/5 cursor-pointer transition-colors flex justify-between items-center
                                            ${selectedId === item.oftalmologista_id
                                                ? 'bg-teal-500/10 border-l-4 border-l-teal-500'
                                                : 'hover:bg-white/5 border-l-4 border-l-transparent'}`}
                                    >
                                        <div>
                                            <p className={`font-bold text-xs ${selectedId === item.oftalmologista_id ? 'text-teal-300' : 'text-slate-300'}`}>
                                                Dr(a). {item.nome_medico}
                                            </p>
                                            <p className="text-[10px] text-slate-500 mt-0.5">
                                                {item.detalhes.length} venda{item.detalhes.length !== 1 ? 's' : ''}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            {item.comissao_pendente > 0 ? (
                                                <span className="block font-black text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                                                    {formatCurrency(item.comissao_pendente)}
                                                </span>
                                            ) : (
                                                <span className="block font-bold text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 flex items-center gap-1">
                                                    <CheckCircle2 className="h-3 w-3" /> Quitada
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Right Panel: Details */}
                    <div className="flex-1 flex flex-col bg-slate-950/30 relative overflow-hidden">
                        {selectedMedico ? (
                            <>
                                {/* Doctor Header */}
                                <div className="bg-slate-900/50 px-6 py-3 border-b border-white/10 flex justify-between items-center shrink-0">
                                    <h3 className="text-sm font-black text-slate-200 flex items-center gap-2">
                                        <User className="h-4 w-4 text-teal-400" />
                                        Dr(a). {selectedMedico.nome_medico}
                                    </h3>
                                    <button onClick={handlePrint}
                                        className="text-slate-400 hover:text-teal-300 transition-colors flex items-center gap-1 text-xs font-bold bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10">
                                        <Printer className="h-3 w-3" /> Imprimir
                                    </button>
                                </div>

                                {/* KPIs */}
                                <div className="p-4 shrink-0">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Vendas no Período</p>
                                            <p className="text-lg font-black text-slate-200">{formatCurrency(selectedMedico.total_vendas)}</p>
                                            <div className="mt-1 flex items-center gap-1 text-[9px] text-teal-400 font-bold">
                                                <TrendingUp className="h-3 w-3" /> {selectedMedico.detalhes.length} vendas
                                            </div>
                                        </div>
                                        <div className="bg-amber-500/5 p-3 rounded-xl border border-amber-500/20 relative overflow-hidden">
                                            <div className="absolute right-0 top-0 p-1.5 opacity-10"><AlertCircle className="h-10 w-10 text-amber-500" /></div>
                                            <p className="text-[9px] font-bold text-amber-500/70 uppercase tracking-wider mb-1">Pendente</p>
                                            <p className="text-lg font-black text-amber-400">{formatCurrency(selectedMedico.comissao_pendente)}</p>
                                        </div>
                                        <div className="bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/20 relative overflow-hidden">
                                            <div className="absolute right-0 top-0 p-1.5 opacity-10"><CheckCircle2 className="h-10 w-10 text-emerald-500" /></div>
                                            <p className="text-[9px] font-bold text-emerald-500/70 uppercase tracking-wider mb-1">Já Pago</p>
                                            <p className="text-lg font-black text-emerald-400">{formatCurrency(selectedMedico.comissao_paga)}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="flex-1 overflow-y-auto px-4 pb-4">
                                    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                                        <div className="bg-slate-800/50 px-4 py-2 border-b border-white/10">
                                            <h4 className="font-bold text-slate-300 text-xs">Extrato de Vendas</h4>
                                        </div>
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-slate-800/30 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/5">
                                                <tr>
                                                    <th className="px-4 py-2">Data</th>
                                                    <th className="px-4 py-2">Cliente</th>
                                                    <th className="px-4 py-2 text-right">Valor Venda</th>
                                                    <th className="px-4 py-2 text-right">Comissão</th>
                                                    <th className="px-4 py-2 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {selectedMedico.detalhes.map(det => (
                                                    <tr key={det.id} className="hover:bg-white/5 transition-colors">
                                                        <td className="px-4 py-2.5 text-slate-400 font-mono">{formatDate(det.data)}</td>
                                                        <td className="px-4 py-2.5 text-slate-300 font-bold">{det.cliente_nome}</td>
                                                        <td className="px-4 py-2.5 text-right text-slate-400">{formatCurrency(det.valor_venda)}</td>
                                                        <td className="px-4 py-2.5 text-right font-bold text-slate-200">{formatCurrency(det.valor_comissao)}</td>
                                                        <td className="px-4 py-2.5 text-center">
                                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${det.status === 'Pago'
                                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                                                                {det.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Footer: Pay Button */}
                                {selectedMedico.comissao_pendente > 0 && (
                                    <div className="bg-slate-900/80 border-t border-white/10 p-4 flex justify-between items-center shrink-0 backdrop-blur-xl">
                                        <div>
                                            <p className="text-[9px] text-slate-500 font-bold uppercase">Total a Pagar Agora</p>
                                            <p className="text-xl font-black text-slate-200">{formatCurrency(selectedMedico.comissao_pendente)}</p>
                                        </div>
                                        <button onClick={handlePagar} disabled={isPaying}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 font-bold text-xs flex items-center gap-2 transition-transform active:scale-95 border border-emerald-500/30">
                                            {isPaying ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                                            CONFIRMAR PAGAMENTO
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                                <Stethoscope className="h-16 w-16 mb-4 opacity-10" />
                                <p className="text-sm font-light">Selecione um médico para ver o extrato</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
