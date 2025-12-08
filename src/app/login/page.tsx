// Caminho: src/app/login/page.tsx (CORREÇÃO DE LAYOUT)

'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { getLoginRoute } from '@/lib/actions/auth.actions'

// --- Componente do Botão de Submit (Mantido) ---
function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:bg-blue-400"
    >
      {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar'}
    </button>
  )
}

// --- Componente Principal da Página ---
export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
          router.push(route);
      } else {
          await supabase.auth.signOut();
          setErrorMessage(message || 'Erro no roteamento. Tente novamente.');
      }

    } catch (error: any) {
      setErrorMessage(error.message || 'Ocorreu um erro inesperado.')
    }
  }

  return (
    <main 
        // CORREÇÃO: Removemos 'flex-1' e garantimos a centralização na tela.
        className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4"
    >
      {/* A classe 'text-white' é crucial para manter a caixa escura (gray-800) */}
      <div className="w-full max-w-md rounded-lg bg-gray-800 p-8 shadow-lg text-white">
        <h1 className="mb-6 text-center text-3xl font-bold">
          Gestão Ótica Pro
        </h1>

        <form action={handleSubmit} className="space-y-4">
          {errorMessage && (
            // Mensagem de erro fica em cores claras sobre o fundo escuro
            <div className="mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700">
              <p>
                <strong>Erro:</strong> {errorMessage}
              </p>
            </div>
          )}
          <div>
            {/* O label deve ser branco para contraste */}
            <label htmlFor="email" className="block text-sm font-medium text-white">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              // O input continua branco com texto escuro
              className="mt-1 block w-full rounded-md border-gray-300 bg-white shadow-sm text-gray-900 h-10 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-white">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="mt-1 block w-full rounded-md border-gray-300 bg-white shadow-sm text-gray-900 h-10 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="pt-2">
            <SubmitButton />
          </div>
          <div className="text-center text-sm">
            <Link
              href="/forgot-password"
              // Link em tom de azul claro para contraste no fundo escuro
              className="font-medium text-blue-400 hover:text-blue-300"
            >
              Esqueceu sua senha?
            </Link>
          </div>
        </form>
      </div>
    </main>
  )
}