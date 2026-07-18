// Caminho: src/lib/supabase/server.ts (CORRIGIDO PARA CONSISTÊNCIA)

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies, type UnsafeUnwrappedCookies } from 'next/headers';

export function createClient() {
  // Next 15 ainda preserva o acesso sincrono por compatibilidade. O cast
  // concentra essa transicao sem transformar todas as actions em Promises de cliente.
  const cookieStore = (cookies() as unknown as UnsafeUnwrappedCookies) as unknown as {
    get: (name: string) => { value?: string } | undefined
    set: (cookie: { name: string; value: string } & CookieOptions) => void
  }

  return createServerClient(
    // USAR CHAVES PÚBLICAS PARA CONSISTÊNCIA E ACESSO NO SSR
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Ocorre em Server Actions, o que é esperado
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options, maxAge: 0, expires: new Date(0) })
          } catch (error) {
            // Ocorre em Server Actions, o que é esperado
          }
        },
      },
    }
  )
}
