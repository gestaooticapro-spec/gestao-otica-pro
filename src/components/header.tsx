'use client'

import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { getStorePublicProfile, getTenantName } from '@/lib/actions/store.actions'

export default function Header() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const [storeName, setStoreName] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [tenantName, setTenantName] = useState<string | null>(null)

  const storeId = params.storeId ? Number(params.storeId) : null

  // --- LÓGICA DE LOGOUT DIÁRIO ---
  useEffect(() => {
    const checkDate = async () => {
      const today = new Date().toLocaleDateString('pt-BR')
      const storedDate = localStorage.getItem('gestao_otica_session_date')

      if (!storedDate) {
        localStorage.setItem('gestao_otica_session_date', today)
        return
      }

      if (storedDate !== today) {
        console.log(`[Header] Data mudou de ${storedDate} para ${today}. Forçando logout...`)
        localStorage.removeItem('gestao_otica_session_date')
        await supabase.auth.signOut()
        router.replace('/login?reason=daily_expired')
      }
    }

    checkDate()
    const onFocus = () => checkDate()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [router, supabase])

  // --- BUSCAR DADOS DA LOJA + TENANT ---
  useEffect(() => {
    if (storeId) {
      getStorePublicProfile(storeId).then(async (data) => {
        if (data) {
          setStoreName(data.name)
          setLogoUrl(data.logo_url)
          if (data.tenant_id) {
            const name = await getTenantName(data.tenant_id)
            if (name) setTenantName(name)
          }
        }
      })
    } else {
      setStoreName(null)
      setLogoUrl(null)
      setTenantName(null)
    }
  }, [storeId])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <header className="fixed top-0 left-0 w-full z-30 bg-slate-950/95 backdrop-blur-md border-b border-white/10 font-sans shadow-lg shadow-black/40">
      <div className="mx-auto flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8 relative">

        {/* Esquerda: Marca do Sistema */}
        <Link href="/dashboard/manager" className="flex items-center gap-2.5 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg" alt="NeoManager" className="w-8 h-8 drop-shadow-[0_0_8px_rgba(59,130,246,0.4)] group-hover:drop-shadow-[0_0_12px_rgba(59,130,246,0.6)] transition-all" />
          <div>
            <span className="text-base font-black text-white tracking-tight group-hover:text-blue-300 transition-colors">
              NeoManager
            </span>
            <span className="text-[10px] text-blue-400/80 font-bold ml-1.5 bg-blue-500/10 px-1.5 py-0.5 rounded-full border border-blue-500/20">
              2.0
            </span>
          </div>
        </Link>

        {/* Centro: Logo da Loja + Nome do Tenant/Loja */}
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

        {/* Direita: Sair */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-red-400/70 hover:bg-red-500/10 hover:text-red-300 border border-transparent hover:border-red-500/20 transition-all"
          title="Sair do Sistema"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline text-sm font-bold uppercase tracking-wider">Sair</span>
        </button>
      </div>
    </header>
  )
}