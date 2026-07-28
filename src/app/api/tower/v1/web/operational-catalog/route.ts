import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDeviceWebSessionToken } from '@/lib/server/tower-device-web-session'
import {
  loadTowerOperationalCatalog,
  loadTowerOperationalFrames,
  loadTowerOperationalGeometries,
} from '@/lib/server/tower-operational-catalog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  storeId: z.coerce.number().int().positive(),
  resources: z.string().trim().min(1).max(80),
})
const RESOURCE_NAMES = new Set(['catalog', 'geometries', 'frames'])

export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Recursos operacionais invalidos.' },
      { status: 400 },
    )
  }
  const resources = [...new Set(
    parsed.data.resources.split(',').map((item) => item.trim()).filter(Boolean),
  )]
  if (!resources.length || resources.some((item) => !RESOURCE_NAMES.has(item))) {
    return NextResponse.json(
      { success: false, message: 'Recursos operacionais invalidos.' },
      { status: 400 },
    )
  }

  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json(
      { success: false, message: 'Torre nao autenticada.' },
      { status: 401 },
    )
  }
  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const entries = await Promise.all(resources.map(async (resource) => {
      if (resource === 'catalog') {
        return [
          resource,
          await loadTowerOperationalCatalog(admin, parsed.data.storeId, []),
        ]
      }
      if (resource === 'geometries') {
        return [resource, await loadTowerOperationalGeometries(admin)]
      }
      return [resource, await loadTowerOperationalFrames(admin)]
    }))
    return NextResponse.json({
      success: true,
      message: 'Snapshot operacional carregado.',
      data: Object.fromEntries(entries),
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error
        ? error.message
        : 'Falha ao carregar snapshot operacional.',
    }, { status: 500 })
  }
}
