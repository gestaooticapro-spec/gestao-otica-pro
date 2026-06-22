'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    DollarSign, CheckCircle2, Loader2, User, Wallet,
    Filter, TrendingUp, AlertCircle, X
} from 'lucide-react'
import { pagarComissoesEmLote, type ResumoComissao } from '@/lib/actions/commission.actions'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')

const labelStyle = 'block text-[9px] font-bold text-white/80 uppercase mb-0.5 tracking-wider'
const inputHeaderStyle = 'block w-full rounded-lg border-0 bg-white shadow-lg text-slate-800 h-9 text-xs px-2 focus:ring-2 focus:ring-fuchsia-300 font-bold'

type GlobalOriginItem = {
    data_venda: string | null
    venda_id: number | null
    venda_label: string
    valor_venda: number
    valor_comissao: number
    os_labels: string[]
    protocolo_labels: string[]
}

type DetalheComissao = {
    id: number
    data: string
    venda_id: number | null
    valor_venda: number
    valor_comissao: number
    status: string
    type: string
    commission_stage: string
    os_id_label?: string | null
    protocolo_fisico?: string | null
    global_origin_items?: GlobalOriginItem[]
}

function GlobalDetailModal({
    employeeName,
    detail,
    onClose,
}: {
    employeeName: string
    detail: DetalheComissao
    onClose: () => void
}) {
    const items = Array.isArray(detail.global_origin_items) ? detail.global_origin_items : []

    return (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-6 backdrop-blur-sm">
            <div className="my-auto max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <div>
                        <h3 className="text-lg font-black text-slate-800">Detalhes do Faturamento Global</h3>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {employeeName} • Ref. {formatDate(detail.data)}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                        title="Fechar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="max-h-[calc(85vh-88px)] overflow-y-auto p-6">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <tr>
                                <th className="px-3 py-3">Data da Venda</th>
                                <th className="px-3 py-3">#Venda</th>
                                <th className="px-3 py-3">#OS / Protocolo</th>
                                <th className="px-3 py-3 text-right">Valor Base</th>
                                <th className="px-3 py-3 text-right">Comissão</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {items.map((item, index) => (
                                <tr key={`${item.venda_label}-${index}`} className="align-top">
                                    <td className="px-3 py-3 text-xs font-mono text-slate-500">
                                        {item.data_venda ? formatDate(item.data_venda) : '-'}
                                    </td>
                                    <td className="px-3 py-3 font-bold text-blue-600">
                                        {item.venda_label}
                                    </td>
                                    <td className="px-3 py-3">
                                        <div className="flex flex-wrap items-center gap-1">
                                            {item.os_labels.length > 0 ? item.os_labels.map((label) => (
                                                <span key={label} className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-black text-indigo-700 shadow-sm">
                                                    {label}
                                                </span>
                                            )) : (
                                                <span className="text-[10px] font-semibold text-slate-400">Sem OS</span>
                                            )}
                                            {item.protocolo_labels.map((label) => (
                                                <div key={label} className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 shadow-sm">
                                                    <span className="text-[9px] font-semibold uppercase tracking-wide text-violet-400">
                                                        Prot.
                                                    </span>
                                                    <span className="text-[12px] font-black text-violet-700">
                                                        {label}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-right font-semibold text-slate-600">
                                        {formatCurrency(item.valor_venda || 0)}
                                    </td>
                                    <td className="px-3 py-3 text-right font-black text-slate-800">
                                        {formatCurrency(item.valor_comissao || 0)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

export default function ComissoesInterface({
    data,
    storeId,
    periodo
}: {
    data: ResumoComissao[],
    storeId: number,
    periodo: { inicio: string, fim: string }
}) {
    const router = useRouter()
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [selectedGlobalDetail, setSelectedGlobalDetail] = useState<DetalheComissao | null>(null)
    const [isPending, startTransition] = useTransition()

    const [dataInicio, setDataInicio] = useState(periodo.inicio)
    const [dataFim, setDataFim] = useState(periodo.fim)

    const selectedEmployee = data.find(d => d.employee_id === selectedId)

    const handleFilter = () => {
        router.push(`/dashboard/loja/${storeId}/financeiro/comissoes?inicio=${dataInicio}&fim=${dataFim}`)
    }

    const handlePagar = () => {
        if (!selectedEmployee) return

        const pendentes = selectedEmployee.detalhes.filter((d: any) => d.status === 'Pendente')
        if (pendentes.length === 0) return

        const ids = pendentes.map((d: any) => d.id)
        const total = pendentes.reduce((acc: number, curr: any) => acc + curr.valor_comissao, 0)

        if (!confirm(`Confirmar pagamento de ${formatCurrency(total)} para ${selectedEmployee.employee_name}?`)) return

        startTransition(async () => {
            const res = await pagarComissoesEmLote(storeId, selectedEmployee.employee_id, ids)
            if (res.success) {
                alert('Pagamento registrado com sucesso!')
                router.refresh()
            } else {
                alert('Erro: ' + res.message)
            }
        })
    }

    return (
        <div className="flex h-full overflow-hidden bg-slate-100">
            <div className="w-1/3 flex flex-col border-r border-slate-200 bg-white z-10 shadow-sm">
                <div className="bg-gradient-to-br from-violet-600 to-fuchsia-700 p-5 flex flex-col gap-4 shadow-md z-20">
                    <div className="flex justify-between items-center text-white">
                        <h2 className="font-bold text-sm flex items-center gap-2 uppercase tracking-wide">
                            <Wallet className="h-4 w-4" /> Comissões
                        </h2>
                        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-medium">
                            {data.length} colab.
                        </span>
                    </div>

                    <div className="flex gap-2 items-end">
                        <div className="flex-1">
                            <label className={labelStyle}>De</label>
                            <input
                                type="date"
                                value={dataInicio}
                                onChange={e => setDataInicio(e.target.value)}
                                className={inputHeaderStyle}
                            />
                        </div>
                        <div className="flex-1">
                            <label className={labelStyle}>Até</label>
                            <input
                                type="date"
                                value={dataFim}
                                onChange={e => setDataFim(e.target.value)}
                                className={inputHeaderStyle}
                            />
                        </div>
                        <button
                            onClick={handleFilter}
                            className="h-9 w-9 bg-white/20 hover:bg-white/30 text-white rounded-lg flex items-center justify-center shadow-sm transition-colors"
                            title="Filtrar"
                        >
                            <Filter className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {data.length === 0 ? (
                        <div className="text-center p-10 text-slate-400 flex flex-col items-center">
                            <User className="h-10 w-10 mb-2 opacity-20" />
                            <p className="text-xs">Nenhum registro no período.</p>
                        </div>
                    ) : (
                        data.map((item) => (
                            <div
                                key={item.employee_id}
                                onClick={() => setSelectedId(item.employee_id)}
                                className={`p-4 border-b border-slate-100 cursor-pointer transition-colors flex justify-between items-center group
                                    ${selectedId === item.employee_id ? 'bg-fuchsia-50 border-l-4 border-l-fuchsia-600' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}
                                `}
                            >
                                <div>
                                    <p className={`font-bold text-sm ${selectedId === item.employee_id ? 'text-fuchsia-900' : 'text-slate-700'}`}>
                                        {item.employee_name}
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        Vendas: {formatCurrency(item.total_vendas)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    {item.comissao_pendente > 0 ? (
                                        <span className="block font-black text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                                            {formatCurrency(item.comissao_pendente)}
                                        </span>
                                    ) : (
                                        <span className="block font-bold text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3" /> Quitada
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
                {selectedEmployee ? (
                    <>
                        <div className="bg-white px-6 py-4 border-b border-slate-200 shadow-sm shrink-0">
                            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                <User className="h-6 w-6 text-slate-400" />
                                {selectedEmployee.employee_name}
                            </h2>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="max-w-5xl mx-auto space-y-6 pb-20">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Vendas no Período</p>
                                        <p className="text-2xl font-black text-slate-700">{formatCurrency(selectedEmployee.total_vendas)}</p>
                                        <div className="mt-2 flex items-center gap-1 text-[10px] text-blue-600 font-bold">
                                            <TrendingUp className="h-3 w-3" /> Performance
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm relative overflow-hidden">
                                        <div className="absolute right-0 top-0 p-2 opacity-10"><AlertCircle className="h-12 w-12 text-amber-500" /></div>
                                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">A Pagar (Pendente)</p>
                                        <p className="text-2xl font-black text-amber-600">{formatCurrency(selectedEmployee.comissao_pendente)}</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm relative overflow-hidden">
                                        <div className="absolute right-0 top-0 p-2 opacity-10"><CheckCircle2 className="h-12 w-12 text-emerald-500" /></div>
                                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Já Pago (Período)</p>
                                        <p className="text-2xl font-black text-emerald-600">{formatCurrency(selectedEmployee.comissao_paga)}</p>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
                                        <h3 className="font-bold text-slate-700 text-sm">Extrato de Vendas</h3>
                                    </div>
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-white text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                            <tr>
                                                <th className="px-5 py-3">Data Ref.</th>
                                                <th className="px-5 py-3">Venda</th>
                                                <th className="px-5 py-3">OS</th>
                                                <th className="px-5 py-3 text-right">Valor Base / Venda</th>
                                                <th className="px-5 py-3 text-right">Comissão</th>
                                                <th className="px-5 py-3 text-center">Status Pgto</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {selectedEmployee.detalhes.map((det: any) => (
                                                <tr
                                                    key={det.id}
                                                    onClick={det.type === 'global_store' ? () => setSelectedGlobalDetail(det) : undefined}
                                                    className={`transition-colors ${det.type === 'global_store' ? 'bg-indigo-50/50 hover:bg-indigo-50 cursor-pointer' : 'hover:bg-slate-50'}`}
                                                >
                                                    <td className="px-5 py-3 text-slate-500 font-mono text-xs">{formatDate(det.data)}</td>
                                                    <td className={`px-5 py-3 font-bold text-xs ${det.type === 'global_store' ? 'text-indigo-600' : 'text-blue-600'}`}>
                                                        {det.type === 'global_store' ? 'Faturamento Global' : `#${det.venda_id}`}
                                                        {det.commission_stage === 'provisional' && (
                                                            <span className="ml-2 text-[9px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
                                                                Provisoria
                                                            </span>
                                                        )}
                                                        {det.type === 'global_store' && (
                                                            <div className="mt-1 text-[10px] font-semibold text-indigo-500">
                                                                Clique para ver detalhes
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className={`px-5 py-3 font-bold text-xs ${det.type === 'global_store' ? 'text-indigo-600' : 'text-blue-600'}`}>
                                                        {det.type === 'global_store' ? 'Resumo do Mês' : (det.os_id_label || '-')}
                                                        {det.type !== 'global_store' && det.protocolo_fisico && (
                                                            <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 shadow-sm">
                                                                <span className="text-[9px] font-semibold uppercase tracking-wide text-violet-400">
                                                                    Protocolo
                                                                </span>
                                                                <span className="text-[12px] font-black text-violet-700">
                                                                    {det.protocolo_fisico}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3 text-right text-slate-600">
                                                        {det.type === 'global_store' ? <span className="text-[10px] text-slate-400">Todo o Mês</span> : formatCurrency(det.valor_venda)}
                                                    </td>
                                                    <td className={`px-5 py-3 text-right font-bold ${det.type === 'global_store' ? 'text-indigo-800' : 'text-slate-800'}`}>
                                                        {formatCurrency(det.valor_comissao)}
                                                    </td>
                                                    <td className="px-5 py-3 text-center">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${det.status === 'Pago' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                                            {det.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {selectedEmployee.comissao_pendente > 0 && (
                            <div className="bg-white border-t border-slate-200 p-4 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] flex justify-between items-center z-20 shrink-0">
                                <div>
                                    <p className="text-xs text-slate-500 font-bold uppercase">Total a Pagar Agora</p>
                                    <p className="text-2xl font-black text-slate-800">{formatCurrency(selectedEmployee.comissao_pendente)}</p>
                                </div>
                                <button
                                    onClick={handlePagar}
                                    disabled={isPending}
                                    className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl shadow-lg shadow-green-200 font-bold flex items-center gap-2 transition-transform active:scale-95"
                                >
                                    {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <DollarSign className="h-5 w-5" />}
                                    CONFIRMAR PAGAMENTO
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                        <Filter className="h-16 w-16 mb-4 opacity-20" />
                        <p className="text-lg font-light">Selecione um colaborador para ver o extrato</p>
                    </div>
                )}

                {selectedEmployee && selectedGlobalDetail && (
                    <GlobalDetailModal
                        employeeName={selectedEmployee.employee_name}
                        detail={selectedGlobalDetail}
                        onClose={() => setSelectedGlobalDetail(null)}
                    />
                )}
            </div>
        </div>
    )
}
