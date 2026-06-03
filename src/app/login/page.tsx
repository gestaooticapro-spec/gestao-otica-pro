// Caminho: src/app/login/page.tsx (CORREÇÃO DE LAYOUT)

'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, Eye, EyeOff, Maximize2, Minimize2 } from 'lucide-react'
import Link from 'next/link'
import { getLoginRoute } from '@/lib/actions/auth.actions'

// --- Componente do Botão de Submit (Mantido e Estilizado) ---
function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full justify-center rounded-lg border border-white/10 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 py-3 px-4 text-sm font-bold text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-transparent transition-all uppercase tracking-wide bg-opacity-80 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Acessar Sistema'}
    </button>
  )
}

// --- Componente Principal da Página ---
export default function LoginPage() {
  const supabase = createClient()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    handleFullscreenChange()
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }

      await document.documentElement.requestFullscreen()
    } catch {
      setErrorMessage('Não foi possível ativar a tela cheia neste dispositivo.')
    }
  }

  const handleSubmit = async (formData: FormData) => {
    setErrorMessage(null)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    try {
      const { error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        })

      if (authError) {
        setErrorMessage(authError.message || 'Credenciais inválidas')
        return
      }

      const { route, message } = await getLoginRoute();

      if (route.startsWith('/dashboard')) {
        window.location.href = route;
      } else {
        await supabase.auth.signOut();
        setErrorMessage(message || 'Erro no roteamento. Tente novamente.');
      }

    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Ocorreu um erro inesperado.')
    }
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-4 bg-[url('/login.jpg')] bg-cover bg-center relative"
    >
      {/* Overlay escuro para melhorar leitura sobre a imagem */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"></div>

      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
        title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/60 backdrop-blur-md transition-all hover:border-white/20 hover:bg-black/35 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/70"
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>

      <div className="relative w-full max-w-md rounded-2xl bg-black/20 backdrop-blur-xl p-8 shadow-2xl text-white border border-white/10 ring-1 ring-white/5">

        {/* LOGO / BRANDING */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tight mb-2 text-white drop-shadow-lg">
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">MB</span>Optical
          </h1>
          <p className="text-gray-300 text-xs font-medium uppercase tracking-widest text-shadow-sm opacity-80">Sistema de Gestão Ótica</p>
        </div>

        <form action={handleSubmit} className="space-y-6">
          {errorMessage && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
              <p>{errorMessage}</p>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="email" className="block text-xs font-medium text-gray-300 ml-1">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="seu@email.com"
              className="block w-full rounded-lg border border-white/10 bg-black/40 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 sm:text-sm h-11 transition-all hover:bg-black/50"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-xs font-medium text-gray-300 ml-1">
              Senha
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="••••••••"
                className="block w-full rounded-lg border border-white/10 bg-black/40 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 sm:text-sm h-11 transition-all hover:bg-black/50 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-white transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="pt-4">
            <SubmitButton />
          </div>

          <div className="text-center pt-2">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-gray-400 hover:text-white transition-colors"
            >
              Esqueceu sua senha?
            </Link>
          </div>
        </form>

        {/* Footer discreto */}
        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <p className="text-[10px] text-gray-300 opacity-80">© {new Date().getFullYear()} MBOptical. Todos os direitos reservados.</p>
        </div>
      </div>
    </main>
  )
}
