'use client';

import { ShoppingCart, Archive, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getStoreLogoPublicUrl } from '@/lib/store-logo';

export default function DemoMenuPage() {
    const router = useRouter();
    const demoLogoUrl = getStoreLogoPublicUrl('stores/3/logo.png') || '';

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center p-8 overflow-hidden">
            {/* Fundo gradiente suave */}
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-slate-50 to-blue-50" />

            {/* Círculos decorativos desfocados */}
            <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-amber-200/40 to-orange-300/30 blur-3xl" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-blue-200/40 to-indigo-300/30 blur-3xl" />
            <div className="absolute top-[30%] right-[20%] w-[300px] h-[300px] rounded-full bg-gradient-to-br from-amber-100/30 to-yellow-200/20 blur-2xl" />

            {/* Conteúdo */}
            <div className="relative z-10 flex flex-col items-center w-full">
                {/* Logo da Loja */}
                <div className="mb-12 text-center">
                    <div className="w-28 h-28 mx-auto relative mb-4">
                        <img
                            src={demoLogoUrl}
                            alt="Ótica Prisma"
                            className="h-full w-full object-contain rounded-2xl shadow-xl"
                        />
                    </div>
                    <h1 className="text-slate-500 text-sm font-medium uppercase tracking-widest">
                        Ótica Prisma Guaíra
                    </h1>
                </div>

                {/* Botões Principais */}
                <div className="flex flex-col sm:flex-row gap-8 sm:gap-10 justify-center">
                    {/* Botão Atendimento */}
                    <button
                        onClick={() => router.push('/demo/menu/atendimento')}
                        className="group w-64 h-64 sm:w-72 sm:h-72 bg-gradient-to-br from-blue-500 to-blue-700 rounded-3xl flex flex-col items-center justify-center p-8 shadow-[0_25px_80px_-15px_rgba(59,130,246,0.6)] hover:shadow-[0_35px_100px_-15px_rgba(59,130,246,0.7)] hover:scale-105 hover:-translate-y-3 transition-all duration-300 cursor-pointer"
                    >
                        <ShoppingCart className="w-20 h-20 sm:w-24 sm:h-24 text-white/90 mb-6 group-hover:scale-110 transition-transform duration-300" strokeWidth={1.5} />
                        <span className="text-white text-2xl font-bold tracking-wide">
                            Atendimento
                        </span>
                    </button>

                    {/* Botão Loja Vazia */}
                    <button
                        onClick={() => router.push('/demo/menu/loja-vazia')}
                        className="group w-64 h-64 sm:w-72 sm:h-72 bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl flex flex-col items-center justify-center p-8 shadow-[0_25px_80px_-15px_rgba(245,158,11,0.6)] hover:shadow-[0_35px_100px_-15px_rgba(245,158,11,0.7)] hover:scale-105 hover:-translate-y-3 transition-all duration-300 cursor-pointer"
                    >
                        <Archive className="w-20 h-20 sm:w-24 sm:h-24 text-white/90 mb-6 group-hover:scale-110 transition-transform duration-300" strokeWidth={1.5} />
                        <span className="text-white text-2xl font-bold tracking-wide">
                            Loja Vazia
                        </span>
                    </button>
                </div>
            </div>

            {/* Botão Sair (canto inferior direito) */}
            <button className="absolute bottom-6 right-8 flex items-center gap-2 text-slate-400 hover:text-red-500 transition-colors duration-200 text-sm font-medium z-10">
                <LogOut className="w-4 h-4" />
                Sair
            </button>
        </div>
    );
}
