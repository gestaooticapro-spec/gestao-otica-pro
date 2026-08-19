'use client';

import { ShoppingCart, Archive, LogOut, ArrowRight, Store, ArrowLeft } from 'lucide-react';
import Image from 'next/image';

import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import FullscreenToggleButton from '@/components/FullscreenToggleButton';

interface OperatorMenuHomeProps {
    storeId: number;
    storeName: string;
    logoUrl: string | null;
    onNavigate: (menu: 'atendimento' | 'loja-vazia') => void;
    onLogout: () => void;
    onBackToHub?: () => void;
    backLabel?: string;
}

export default function OperatorMenuHome({
    storeName,
    logoUrl,
    onNavigate,
    onLogout,
    onBackToHub,
    backLabel = 'Voltar'
}: OperatorMenuHomeProps) {
    const { preference } = useBackgroundPreference();

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center p-6 overflow-y-auto md:overflow-hidden bg-slate-950 font-sans transition-colors duration-500">
            <div className="absolute top-6 right-6 z-50 flex items-center gap-3">
                <FullscreenToggleButton className="right-20 top-6" />
                <BackgroundToggle />
            </div>

            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/tela1.jpg')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
            </div>

            <div className="relative z-10 w-full max-w-5xl flex flex-col items-center mt-0 pt-3 md:pt-4">
                <div className="mb-4 text-center flex flex-col items-center animate-in slide-in-from-top-5 duration-700">
                    <div
                        className="w-28 h-28 relative mb-4 rounded-3xl overflow-hidden shadow-2xl shadow-cyan-500/10 ring-1 ring-white/15 backdrop-blur-xl flex items-center justify-center group border border-white/10 transition-all duration-500 hover:shadow-cyan-400/20 hover:ring-white/25"
                        style={{ background: 'radial-gradient(circle at 50% 40%, rgba(100,180,255,0.15) 0%, rgba(30,40,60,0.95) 60%, rgba(10,15,30,1) 100%)' }}
                    >
                        {/* Shine sweep */}
                        <div className="absolute inset-0 z-20 bg-gradient-to-r from-transparent via-white/20 to-transparent w-1/2 h-full animate-crystal-shine pointer-events-none" />

                        <div className="relative z-10 w-full h-full flex items-center justify-center">
                            {logoUrl ? (
                                <Image
                                    src={logoUrl}
                                    alt={storeName}
                                    fill
                                    className="object-contain p-4 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] group-hover:scale-110 transition-transform duration-500"
                                />
                            ) : (
                                <Store className="w-12 h-12 text-white/40" />
                            )}
                        </div>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-lg mb-1">
                        {storeName}
                    </h1>
                    <p className="text-slate-400 text-sm font-medium uppercase tracking-[0.2em] bg-white/5 px-4 py-1 rounded-full border border-white/5">
                        Central de Operações
                    </p>
                </div>

                <div className="flex flex-col md:flex-row gap-12 md:gap-16 w-full max-w-4xl justify-center px-4">
                    <button
                        onClick={() => onNavigate('atendimento')}
                        className="group relative flex-none h-64 md:flex-1 md:h-80 rounded-[2rem] overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20 border border-white/10 bg-black/20 backdrop-blur-md"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-blue-900/40 to-slate-900/60 group-hover:opacity-80 transition-opacity" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                        <div className="absolute inset-0 p-8 flex flex-col items-center justify-end text-center z-10 pb-12">
                            <div className="mb-auto mt-8 p-6 rounded-full bg-blue-500/20 ring-1 ring-blue-400/30 group-hover:bg-blue-500/40 transition-colors backdrop-blur-sm shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                                <ShoppingCart className="w-12 h-12 text-blue-200 group-hover:text-white transition-colors" strokeWidth={1.5} />
                            </div>

                            <h2 className="text-3xl font-black text-white tracking-tight mb-2 group-hover:translate-y-[-2px] transition-transform">
                                Atendimento
                            </h2>
                            <p className="text-blue-200/70 text-sm font-medium uppercase tracking-widest mb-4 group-hover:text-blue-100 transition-colors">
                                Cliente na Loja
                            </p>

                            <div className="w-12 h-1 bg-blue-500/50 rounded-full group-hover:w-24 group-hover:bg-blue-400 transition-all duration-300" />
                        </div>

                        <div className="absolute top-6 right-6 p-2 rounded-full bg-white/10 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                            <ArrowRight className="w-5 h-5 text-white" />
                        </div>
                    </button>

                    <button
                        onClick={() => onNavigate('loja-vazia')}
                        className="group relative flex-none h-64 md:flex-1 md:h-80 rounded-[2rem] overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-amber-500/20 border border-white/10 bg-black/20 backdrop-blur-md"
                    >
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

                <div className="text-center opacity-40 hover:opacity-100 transition-opacity duration-300 mt-8 mb-8 md:mb-0">
                    <p className="text-[10px] text-slate-300 font-medium uppercase tracking-[0.3em]">
                        Powered by <span className="font-bold text-white">MBOptical</span>
                    </p>
                </div>
            </div>

            <button
                onClick={onLogout}
                className="fixed bottom-6 right-6 md:bottom-10 md:right-10 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-200 transition-all duration-300 border border-white/5 hover:border-red-500/30 backdrop-blur-sm z-30 group"
            >
                <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs font-bold uppercase tracking-wider">Sair</span>
            </button>

            {onBackToHub && (
                <button
                    onClick={onBackToHub}
                    className="fixed bottom-6 left-6 md:bottom-10 md:left-10 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-blue-500/20 text-slate-400 hover:text-blue-200 transition-all duration-300 border border-white/5 hover:border-blue-500/30 backdrop-blur-sm z-30 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-xs font-bold uppercase tracking-wider">{backLabel}</span>
                </button>
            )}
        </div>
    );
}
