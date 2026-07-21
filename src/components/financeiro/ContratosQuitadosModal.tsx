'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Filter, Loader2, X, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { ContratoQuitado, getContratosQuitados } from '@/lib/actions/parcelas.actions'

const dateInput = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export default function ContratosQuitadosModal({ storeId, onClose }: { storeId: number; onClose: () => void }) {
    const hoje = new Date()
    const quatroMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 4, hoje.getDate())
    const [dataInicial, setDataInicial] = useState(dateInput(quatroMesesAtras))
    const [dataFinal, setDataFinal] = useState(dateInput(hoje))
    const [contratos, setContratos] = useState<ContratoQuitado[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const buscar = async (inicio = dataInicial, fim = dataFinal) => {
        setLoading(true)
        setError('')
        const result = await getContratosQuitados(storeId, { dataInicial: inicio, dataFinal: fim })
        if (result.success) setContratos(result.data)
        else setError(result.message || 'Não foi possível carregar os contratos quitados.')
        setLoading(false)
    }

    useEffect(() => { buscar() }, [storeId])
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [onClose])

    const aplicarUltimos4Meses = () => {
        const agora = new Date()
        const inicio = dateInput(new Date(agora.getFullYear(), agora.getMonth() - 4, agora.getDate()))
        const fim = dateInput(agora)
        setDataInicial(inicio)
        setDataFinal(fim)
        buscar(inicio, fim)
    }
    const formatDate = (value: string) => new Date(`${value.split('T')[0]}T12:00:00`).toLocaleDateString('pt-BR')
    const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
        <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 bg-slate-800/60 px-6 py-4">
                <h2 className="flex items-center gap-2 text-lg font-bold text-white"><CheckCircle2 className="h-5 w-5 text-emerald-400" />Contratos quitados</h2>
                <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex flex-wrap items-end gap-3 border-b border-white/10 bg-slate-900 px-6 py-4">
                <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Data inicial<input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} className="mt-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white color-scheme-dark" /></label>
                <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Data final<input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} className="mt-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white color-scheme-dark" /></label>
                <button onClick={aplicarUltimos4Meses} className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-bold text-slate-300 hover:bg-white/10 hover:text-white">Últimos 4 meses</button>
                <button onClick={() => buscar()} disabled={loading} className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"><Filter className="h-4 w-4" />Filtrar</button>
            </div>
            <div className="min-h-[220px] overflow-auto p-6">
                {loading ? <div className="flex h-48 flex-col items-center justify-center text-slate-400"><Loader2 className="mb-3 h-7 w-7 animate-spin text-blue-400" />Carregando contratos...</div> : error ? <div className="flex h-48 items-center justify-center text-sm text-rose-400">{error}</div> : contratos.length === 0 ? <div className="flex h-48 items-center justify-center text-sm text-slate-400">Nenhum contrato quitado no período.</div> : <table className="w-full text-left"><thead><tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500"><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Venda</th><th className="px-3 py-3">Quitação</th><th className="px-3 py-3">Parcelas</th><th className="px-3 py-3 text-right">Valor</th><th /></tr></thead><tbody className="divide-y divide-white/5">{contratos.map((contrato) => <tr key={contrato.financiamento_id} className="group hover:bg-white/5"><td className="px-3 py-3 text-sm font-semibold text-white">{contrato.cliente_nome}</td><td className="px-3 py-3 font-mono text-sm text-slate-300">{contrato.venda_id ? `#${contrato.venda_id}` : '-'}</td><td className="px-3 py-3 text-sm text-emerald-400">{formatDate(contrato.data_quitacao)}</td><td className="px-3 py-3 text-sm text-slate-300">{contrato.quantidade_parcelas}</td><td className="px-3 py-3 text-right text-sm font-semibold text-slate-200">{formatCurrency(contrato.valor_total)}</td><td className="px-3 py-3 text-right">{contrato.venda_id && <Link href={`/dashboard/loja/${storeId}/vendas/${contrato.venda_id}/experimental`} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs font-bold text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white">Ver venda<ArrowRight className="h-3 w-3" /></Link>}</td></tr>)}</tbody></table>}
            </div>
        </div>
        <style dangerouslySetInnerHTML={{ __html: `.color-scheme-dark { color-scheme: dark; }` }} />
    </div>
}
