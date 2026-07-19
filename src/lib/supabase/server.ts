import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies, type UnsafeUnwrappedCookies } from 'next/headers'

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

/** Prefer this factory in Next 15 Server Components and async server code. */
export async function createAsyncClient() {
  const cookieStore = await cookies()
  return createClientWithCookieStore(cookieStore)
}

/**
 * Legacy synchronous factory kept while older actions are migrated gradually.
 * New code must use createAsyncClient().
 */
export function createClient() {
  const cookieStore = (cookies() as unknown as UnsafeUnwrappedCookies) as unknown as ServerCookieStore
  return createClientWithCookieStore(cookieStore)
}
