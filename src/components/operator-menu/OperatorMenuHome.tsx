'use client';

import { ShoppingCart, Archive, LogOut, ArrowRight, Store } from 'lucide-react';
import Image from 'next/image';

interface OperatorMenuHomeProps {
    storeId: number;
    storeName: string;
    logoUrl: string | null;
    onNavigate: (menu: 'atendimento' | 'loja-vazia') => void;
    onLogout: () => void;
    onBackToDashboard?: () => void;
}

export default function OperatorMenuHome({
    storeName,
    logoUrl,
    onNavigate,
    onLogout
}: OperatorMenuHomeProps) {
    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center p-6 overflow-hidden bg-slate-950 font-sans">

            {/* BACKGROUND IGUAL AO LOGIN */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-[url('/tela1.jpg')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
            </div>

            {/* Conteúdo */}
            <div className="relative z-10 w-full max-w-5xl flex flex-col items-center mt-[-12vh]">

                {/* Header / Logo */}
                <div className="mb-4 text-center flex flex-col items-center animate-in slide-in-from-top-5 duration-700">
                    <div className="w-28 h-28 relative mb-4 rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-black/40 backdrop-blur-xl flex items-center justify-center group">
                        {logoUrl ? (
                            <Image
                                src={logoUrl}
                                alt={storeName}
                                fill
                                className="object-contain p-4 group-hover:scale-110 transition-transform duration-500"
                            />
                        ) : (
                            <Store className="w-12 h-12 text-white/50" />
                        )}
                        {/* Brilho no logo */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    </div>

                    <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-lg mb-1">
                        {storeName}
                    </h1>
                    <p className="text-slate-400 text-sm font-medium uppercase tracking-[0.2em] bg-white/5 px-4 py-1 rounded-full border border-white/5">
                        Central de Operações
                    </p>
                </div>

                {/* Botões Principais */}
                <div className="flex flex-col md:flex-row gap-6 w-full max-w-3xl justify-center px-4">

                    {/* Botão Atendimento */}
                    <button
                        onClick={() => onNavigate('atendimento')}
                        className="group relative flex-1 h-64 md:h-80 rounded-[2rem] overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20 border border-white/10 bg-black/20 backdrop-blur-md"
                    >
                        {/* Imagem de Fundo (Placeholder para quando o usuário mandar) */}
                        {/* <Image src="/buttons/atendimento-bg.jpg" fill className="object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" /> */}

                        {/* Gradiente Fallback */}
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-blue-900/40 to-slate-900/60 group-hover:opacity-80 transition-opacity" />

                        {/* Overlay Gradiente */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                        {/* Conteúdo do Botão */}
                        <div className="absolute inset-0 p-8 flex flex-col items-center justify-end text-center z-10 pb-12">
                            <div className="mb-auto mt-8 p-6 rounded-full bg-blue-500/20 ring-1 ring-blue-400/30 group-hover:bg-blue-500/40 transition-colors backdrop-blur-sm shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                                <ShoppingCart className="w-12 h-12 text-blue-200 group-hover:text-white transition-colors" strokeWidth={1.5} />
                            </div>

                            <h2 className="text-3xl font-black text-white tracking-tight mb-2 group-hover:translate-y-[-2px] transition-transform">
                                Atendimento
                            </h2>
                            <p className="text-blue-200/70 text-sm font-medium uppercase tracking-widest mb-4 group-hover:text-blue-100 transition-colors">
                                Frente de Loja
                            </p>

                            <div className="w-12 h-1 bg-blue-500/50 rounded-full group-hover:w-24 group-hover:bg-blue-400 transition-all duration-300" />
                        </div>

                        {/* Ícone de Seta (Hover) */}
                        <div className="absolute top-6 right-6 p-2 rounded-full bg-white/10 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                            <ArrowRight className="w-5 h-5 text-white" />
                        </div>
                    </button>

                    {/* Botão Loja Vazia */}
                    <button
                        onClick={() => onNavigate('loja-vazia')}
                        className="group relative flex-1 h-64 md:h-80 rounded-[2rem] overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-amber-500/20 border border-white/10 bg-black/20 backdrop-blur-md"
                    >
                        {/* Imagem de Fundo (Placeholder) */}
                        {/* <Image src="/buttons/loja-vazia-bg.jpg" fill className="object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" /> */}

                        <div className="absolute inset-0 bg-gradient-to-br from-amber-600/20 via-orange-900/40 to-slate-900/60 group-hover:opacity-80 transition-opacity" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                        <div className="absolute inset-0 p-8 flex flex-col items-center justify-end text-center z-10 pb-12">
                            <div className="mb-auto mt-8 p-6 rounded-full bg-amber-500/20 ring-1 ring-amber-400/30 group-hover:bg-amber-500/40 transition-colors backdrop-blur-sm shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                                <Archive className="w-12 h-12 text-amber-200 group-hover:text-white transition-colors" strokeWidth={1.5} />
                            </div>

                            <h2 className="text-3xl font-black text-white tracking-tight mb-2 group-hover:translate-y-[-2px] transition-transform">
                                Loja Vazia
                            </h2>
                            <p className="text-amber-200/70 text-sm font-medium uppercase tracking-widest mb-4 group-hover:text-amber-100 transition-colors">
                                Gestão & Interno
                            </p>
                            <div className="w-12 h-1 bg-amber-500/50 rounded-full group-hover:w-24 group-hover:bg-amber-400 transition-all duration-300" />
                        </div>

                        <div className="absolute top-6 right-6 p-2 rounded-full bg-white/10 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                            <ArrowRight className="w-5 h-5 text-white" />
                        </div>
                    </button>
                </div>

                {/* Footer */}
                <div className="text-center opacity-40 hover:opacity-100 transition-opacity duration-300">
                    <p className="text-[10px] text-slate-300 font-medium uppercase tracking-[0.3em]">
                        Powered by <span className="font-bold text-white">NeoManager 2.0</span>
                    </p>
                </div>
            </div>

            {/* Botão Sair */}
            <button
                onClick={onLogout}
                className="absolute bottom-6 right-6 md:bottom-10 md:right-10 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-200 transition-all duration-300 border border-white/5 hover:border-red-500/30 backdrop-blur-sm z-20 group"
            >
                <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs font-bold uppercase tracking-wider">Sair</span>
            </button>
        </div>
    );
}
