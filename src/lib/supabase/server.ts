import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

type ServerCookieStore = {
  get: (name: string) => { value?: string } | undefined
  set: (cookie: { name: string; value: string } & CookieOptions) => void
}

function createClientWithCookieStore(cookieStore: ServerCookieStore) {
  return createServerClient(
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
          } catch {
            // Server Components nao podem alterar cookies durante a renderizacao.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options, maxAge: 0, expires: new Date(0) })
          } catch {
            // Server Components nao podem alterar cookies durante a renderizacao.
          }
        },
      },
    }
  )
}

/** Async-compatible factory kept for callers that already await the client. */
export async function createAsyncClient() {
  return createClientWithCookieStore(cookies())
}

export function createClient() {
  return createClientWithCookieStore(cookies())
}
