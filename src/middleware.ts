// Caminho: src/middleware.ts (CONFIRMADO E CORRIGIDO)

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const maintenanceWriteLock = process.env.MAINTENANCE_WRITE_LOCK === 'true'
  const isWriteRequest = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)

  // Bloqueia gravacoes durante manutencoes sem impedir consultas e sem afetar a conexao
  // direta usada pelo procedimento administrativo de migracao.
  if (maintenanceWriteLock && isWriteRequest) {
    return new NextResponse(
      JSON.stringify({ error: 'Sistema temporariamente em manutencao. Nenhuma alteracao pode ser salva agora.' }),
      {
        status: 503,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'retry-after': '300',
        },
      },
    )
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // USANDO CHAVES PÚBLICAS
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.delete(name)
          response = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
            maxAge: 0,
            expires: new Date(0),
          })
        },
      },
    }
  )

  await supabase.auth.getSession()

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
