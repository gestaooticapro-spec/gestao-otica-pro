import { NextResponse } from 'next/server'
import { createAsyncClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { canUseUsageAssistant, getUsageDestinations, parseUsageRequest, type UsageProfile, type UsageRole } from '@/lib/usage-assistant'
import { generateUsageAnswer } from '@/lib/server/usage-assistant'
import type { StoreSettings } from '@/lib/store-modules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const requests = new Map<string, { count: number; expires: number; pending: boolean }>()
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  let release: (() => void) | undefined
  try {
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origem não permitida.' }, 403)
    if (Number(request.headers.get('content-length')) > 70000) return json({ error: 'A conversa está muito longa. Inicie uma nova conversa.' }, 413)
    const supabase = await createAsyncClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return json({ error: 'Sua sessão terminou. Entre novamente no sistema.' }, 401)

    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > 70000) return json({ error: 'A conversa está muito longa. Inicie uma nova conversa.' }, 413)
    let body: unknown
    try { body = JSON.parse(raw) } catch { return json({ error: 'Não foi possível ler a pergunta.' }, 400) }
    const input = parseUsageRequest(body)
    if (!input) return json({ error: 'Confira a pergunta ou inicie uma nova conversa.' }, 400)

    const profile = await getProfileByAdmin(user.id) as UsageProfile | null
    const admin = createAdminClient()
    const { data: store, error: storeError } = await admin.from('stores')
      .select('tenant_id, settings').eq('id', input.storeId).maybeSingle()
    if (storeError) return json({ error: 'Não foi possível verificar o acesso da loja. Tente novamente.' }, 503)
    if (!store || !canUseUsageAssistant(profile, store, input.storeId)) return json({ error: 'Você não tem acesso a esta loja.' }, 403)

    const now = Date.now()
    for (const [key, item] of requests) if (item.expires <= now && !item.pending) requests.delete(key)
    const key = `${user.id}:${input.storeId}`
    const previous = requests.get(key)
    if (previous?.pending || (previous && previous.expires > now && previous.count >= 12)) {
      return json({ error: 'Aguarde um pouco antes de enviar outra pergunta.' }, 429)
    }
    const bucket = previous && previous.expires > now ? previous : { count: 0, expires: now + 60000, pending: false }
    bucket.count++
    bucket.pending = true
    requests.set(key, bucket)
    release = () => { bucket.pending = false }

    const settings = store.settings as StoreSettings | null
    const role = profile!.role as UsageRole
    const result = await generateUsageAnswer({
      ...input, role, settings,
      destinations: getUsageDestinations(input.storeId, role, settings),
      signal: request.signal,
      logUsage: ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(request.url).hostname),
    })
    return json(result)
  } catch {
    return json({ error: 'Não consegui consultar a base agora. Tente novamente em alguns instantes.' }, 503)
  } finally {
    release?.()
  }
}
