'use client';

import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';

export default function DashboardLayoutWrapper({ children }: { children: React.ReactNode }) {
    const { preference } = useBackgroundPreference();

    return (
        <div className="flex w-full h-full overflow-hidden relative font-sans transition-colors duration-500 bg-slate-950">
            {/* Toggle de Fundo - Posicionado no Header normalmente, mas como o Header sumiu no layout full, vamos por absolute ou deixar o usuário decidir onde por. 
                Na verdade, o layout admin TEM um header em `dashboard/layout.tsx`, mas `loja/[id]/layout.tsx` é aninhado.
                Se o usuário for Admin/Manager, ele vê o Header Global?
                Vamos verificar `src/app/dashboard/layout.tsx`. Ele retorna <Header /> e depois {children}.
                Então o background vai ficar APENAS na área de conteúdo (abaixo do header), o que é bom.
             */}
            <div className="absolute top-4 right-6 z-50">
                <BackgroundToggle />
            </div>

            {/* Background Image */}
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 pointer-events-none ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                {/* Usando uma imagem mais neutra/profissional para gestão */}
                <div className="absolute inset-0 bg-[url('/dashboard.jpg')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
            </div>

            {/* Conteúdo (Sidebar + Main) */}
            <div className="flex w-full h-full relative z-10">
                {children}
            </div>
        </div>
    );
}
