import { NextResponse } from 'next/server'
import { resolveLoginRoute } from '@/lib/auth/login-route'

export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await resolveLoginRoute()
  return NextResponse.json(result, {
    status: result.success ? 200 : 401,
    headers: { 'cache-control': 'no-store' },
  })
}
