// Caminho: src/app/dashboard/loja/[storeId]/config/page.tsx

import { createClient } from '@/lib/supabase/server'
import { getProfileByAdmin } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ConfigInterface from '@/components/config/ConfigInterface'
import { ShieldAlert } from 'lucide-react'

export default async function ConfigPage({ params }: { params: { storeId: string } }) {
    const supabase = createClient()
    const storeId = parseInt(params.storeId, 10)

    // 1. Quem é o usuário?
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return redirect('/login')

    // 2. Qual o cargo dele?
    // CORREÇÃO: Cast 'as any' para garantir o acesso a 'role'
    const profile = await getProfileByAdmin(user.id) as any

    // 3. SEGURANÇA: Apenas Admin ou Gerente passam
    const isAllowed = profile?.role === 'admin' || profile?.role === 'manager'

    if (!isAllowed) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] bg-slate-950 p-6">
                <div className="bg-slate-900 p-8 rounded-2xl shadow-xl text-center max-w-md border-t-4 border-red-500 border-b border-x border-b-white/10 border-x-white/10">
                    <ShieldAlert className="h-16 w-16 text-red-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-black text-white mb-2 tracking-tight uppercase">Acesso Negado</h1>
                    <p className="text-slate-400 mb-6">
                        Esta área é restrita a Gerentes e Administradores.
                        <br />Seu perfil atual é: <strong className="uppercase text-slate-200">{profile?.role || 'Desconhecido'}</strong>
                    </p>
                    <a
                        href={`/dashboard/loja/${storeId}`}
                        className="inline-block bg-slate-800 text-white font-bold py-3 px-6 rounded-lg hover:bg-slate-700 transition-colors border border-white/10"
                    >
                        Voltar para o Início
                    </a>
                </div>
            </div>
        )
    }

    // 4. Se passou, carrega a interface
    return <ConfigInterface storeId={storeId} />
}