// ARQUIVO: src/components/consultas/BuscaUniversal.tsx
'use client'

import { useState, useTransition } from 'react'
import { realizarBuscaUniversal, type ResultadoBusca } from '@/lib/actions/consultas.actions'
import { Search, Loader2, User, ShoppingCart, FileText, ArrowRight, Tag, Barcode, Package, Wrench } from 'lucide-react'
import Link from 'next/link'

const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (d: string) => new Date(d).toLocaleDateString('pt-BR')

export default function BuscaUniversal({ storeId }: { storeId: number }) {
    const [termo, setTermo] = useState('')
    const [resultados, setResultados] = useState<ResultadoBusca | null>(null)
    const [isSearching, startTransition] = useTransition()

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const valor = e.target.value
        setTermo(valor)

        const isNum = /^\d+$/.test(valor)

        if ((isNum && valor.length < 1) || (!isNum && valor.length < 2)) {
            setResultados(null)
            return
        }

        startTransition(async () => {
            const res = await realizarBuscaUniversal(valor, storeId)
            setResultados(res)
        })
    }

    return (
        <div className="w-full space-y-6 pb-10">

            {/* 1. CARD DE BUSCA (HERO SECTION) */}
            <div className="bg-gradient-to-r from-indigo-600/60 to-sky-700/60 p-6 rounded-3xl shadow-xl shadow-indigo-500/10 border border-white/10 relative overflow-hidden backdrop-blur-xl">

                <div className="relative z-10 max-w-3xl mx-auto text-center">
                    <h2 className="text-xl font-black text-white mb-4 tracking-tight drop-shadow-sm">
                        O que você precisa encontrar?
                    </h2>

                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-400/30 to-sky-400/30 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-200"></div>
                        <div className="relative">
                            <input
                                type="text"
                                value={termo}
                                onChange={handleSearch}
                                placeholder="Digite nome, CPF, código de barras ou número da OS..."
                                className="w-full h-12 pl-12 pr-14 rounded-xl border border-white/20 bg-black/40 backdrop-blur-md shadow-2xl text-lg font-bold text-white placeholder-white/40 focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400/50 transition-all outline-none"
                                autoFocus
                            />
                            <div className="absolute left-4 top-3 text-white/50">
                                <Search className="h-6 w-6" />
                            </div>
                            <div className="absolute right-4 top-3">
                                {isSearching ? (
                                    <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                                ) : (
                                    <span className="bg-white/10 text-white/50 text-[10px] font-black px-2 py-1 rounded border border-white/10">AUTO</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. RESULTADOS */}
            {resultados && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                    {/* A. PRODUTOS (ROXO/INDIGO) */}
                    <div className="flex flex-col gap-3">
                        <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest pl-1 flex items-center gap-2">
                            <Package className="h-4 w-4" /> Produtos ({resultados.produtos.length})
                        </h3>
                        {resultados.produtos.length === 0 ? (
                            <div className="bg-white/5 rounded-xl p-6 text-center border border-white/10 text-slate-500 text-xs font-medium backdrop-blur-sm">Nada encontrado.</div>
                        ) : (
                            <div className="space-y-2">
                                {resultados.produtos.map(p => (
                                    <div key={`${p.tipo}-${p.id}`} className="group bg-white/5 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-white/10 hover:border-indigo-500/40 hover:bg-white/10 transition-all cursor-default">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-[9px] font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded uppercase border border-indigo-500/20">{p.tipo}</span>
                                            <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1"><Barcode className="h-3 w-3" /> {p.codigo || '-'}</span>
                                        </div>
                                        <p className="font-bold text-slate-200 text-sm line-clamp-1 leading-tight" title={p.nome}>{p.nome}</p>
                                        <div className="mt-2 flex justify-between items-end">
                                            <span className="text-xs text-slate-500">Est: <strong className="text-slate-300">{p.estoque}</strong></span>
                                            <span className="font-black text-indigo-300">{currency(p.preco)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* B. CLIENTES (AZUL) */}
                    <div className="flex flex-col gap-3">
                        <h3 className="text-xs font-black text-sky-400 uppercase tracking-widest pl-1 flex items-center gap-2">
                            <User className="h-4 w-4" /> Clientes ({resultados.clientes.length})
                        </h3>
                        {resultados.clientes.length === 0 ? (
                            <div className="bg-white/5 rounded-xl p-6 text-center border border-white/10 text-slate-500 text-xs font-medium backdrop-blur-sm">Nada encontrado.</div>
                        ) : (
                            <div className="space-y-2">
                                {resultados.clientes.map(c => (
                                    <Link key={c.id} href={`/dashboard/loja/${storeId}/clientes?id=${c.id}`}>
                                        <div className="group bg-white/5 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-white/10 hover:border-sky-500/40 hover:bg-white/10 transition-all cursor-pointer relative overflow-hidden">
                                            <div className="absolute right-0 top-0 w-1 h-full bg-sky-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                            <p className="font-bold text-slate-200 text-sm group-hover:text-sky-300 transition-colors">{c.nome}</p>
                                            <div className="flex justify-between items-center mt-1">
                                                <p className="text-xs text-slate-500 font-mono">{c.cpf || 'CPF N/A'}</p>
                                                <ArrowRight className="h-4 w-4 text-sky-400 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* C. VENDAS (VERDE) */}
                    <div className="flex flex-col gap-3">
                        <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest pl-1 flex items-center gap-2">
                            <ShoppingCart className="h-4 w-4" /> Vendas ({resultados.vendas.length})
                        </h3>
                        {resultados.vendas.length === 0 ? (
                            <div className="bg-white/5 rounded-xl p-6 text-center border border-white/10 text-slate-500 text-xs font-medium backdrop-blur-sm">Nada encontrado.</div>
                        ) : (
                            <div className="space-y-2">
                                {resultados.vendas.map(v => (
                                    <Link key={v.id} href={`/dashboard/loja/${storeId}/vendas/${v.id}/experimental`}>
                                        <div className="group bg-white/5 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-white/10 hover:border-emerald-500/40 hover:bg-white/10 transition-all cursor-pointer">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-black text-white text-sm">#{v.id}</span>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase">{v.status}</span>
                                            </div>
                                            <p className="text-xs text-slate-400 truncate mb-2">{v.cliente}</p>
                                            <div className="flex justify-between items-center border-t border-white/5 pt-2">
                                                <span className="text-[10px] text-slate-500">{date(v.data)}</span>
                                                <span className="font-bold text-emerald-400 text-sm">{currency(v.valor)}</span>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* D. FICHAS OS (LARANJA) */}
                    <div className="flex flex-col gap-3">
                        <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest pl-1 flex items-center gap-2">
                            <Wrench className="h-4 w-4" /> Fichas OS ({resultados.os.length})
                        </h3>
                        {resultados.os.length === 0 ? (
                            <div className="bg-white/5 rounded-xl p-6 text-center border border-white/10 text-slate-500 text-xs font-medium backdrop-blur-sm">Nada encontrado.</div>
                        ) : (
                            <div className="space-y-2">
                                {resultados.os.map(o => (
                                    <Link key={o.id} href={`/dashboard/loja/${storeId}/vendas/${o.venda_id}/os?os_id=${o.id}`}>
                                        <div className="group bg-white/5 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-white/10 hover:border-amber-500/40 hover:bg-white/10 transition-all cursor-pointer">
                                            <div className="flex justify-between items-center mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-200 text-sm">OS #{o.id}</span>
                                                    {o.protocolo && <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold border border-amber-500/20">{o.protocolo}</span>}
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-400 truncate mb-1">{o.cliente}</p>
                                            <div className="flex justify-end items-center mt-2">
                                                <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                                    ABRIR FICHA <ArrowRight className="h-3 w-3" />
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                </div>
            )}
        </div>
    )
}