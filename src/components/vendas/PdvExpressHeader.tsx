'use client'

import Link from 'next/link'
import { ArrowLeft, Zap } from 'lucide-react'
import Image from 'next/image'

interface Props {
    storeId: number
    storeName: string | null
    logoUrl: string | null
    tenantName: string | null
}

export default function PdvExpressHeader({ storeId, storeName, logoUrl, tenantName }: Props) {
    return (
        <div className="relative z-10 bg-white/5 backdrop-blur-md border-b border-white/10 px-6 py-4 flex justify-between items-center flex-shrink-0">

            {/* Esquerda: Botão Voltar */}
            <Link
                href={`/dashboard/loja/${storeId}`}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white border border-transparent hover:border-white/10 transition-all group"
            >
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Menu Principal</span>
            </Link>

            {/* Centro: Store Branding (Logo + Tenant/Store) */}
            {storeName && (
                <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-3">
                    {logoUrl && (
                        <div className="h-9 w-9 rounded-lg overflow-hidden ring-1 ring-white/10 bg-black/20 flex-shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={logoUrl} alt={storeName} className="h-full w-full object-contain p-0.5" />
                        </div>
                    )}
                    <div className="hidden md:flex flex-col items-center">
                        <h1 className="text-sm font-bold text-white uppercase tracking-widest leading-tight">
                            {tenantName || storeName}
                        </h1>
                        {tenantName && (
                            <p className="text-[10px] text-slate-400 font-medium tracking-wide">{storeName}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Direita: Badge PDV Express */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                <div className="p-1 bg-cyan-500/20 text-cyan-400 rounded-lg">
                    <Zap className="h-4 w-4" />
                </div>
                <div className="hidden sm:block">
                    <p className="text-xs font-black text-white uppercase tracking-tight leading-none">PDV Express</p>
                    <p className="text-[9px] text-cyan-400 font-bold uppercase tracking-widest">Venda Rápida</p>
                </div>
            </div>
        </div>
    )
}
