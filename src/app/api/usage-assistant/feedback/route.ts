import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAsyncClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { canUseUsageAssistant, USAGE_ANSWER_LIMIT, USAGE_QUESTION_LIMIT, type UsageProfile } from '@/lib/usage-assistant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  id: z.string().uuid(),
  storeId: z.number().int().positive().safe(),
  question: z.string().trim().min(1).max(USAGE_QUESTION_LIMIT),
  answer: z.string().trim().min(1).max(USAGE_ANSWER_LIMIT),
}).strict()
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origem não permitida.' }, 403)
    if (Number(request.headers.get('content-length')) > 40000) return json({ error: 'Mensagem muito longa.' }, 413)
    const supabase = await createAsyncClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: 'Sua sessão terminou. Entre novamente no sistema.' }, 401)
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > 40000) return json({ error: 'Mensagem muito longa.' }, 413)
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { return json({ error: 'Não foi possível ler a avaliação.' }, 400) }
    const input = schema.safeParse(parsed)
    if (!input.success) return json({ error: 'Não foi possível registrar esta avaliação.' }, 400)

    const profile = await getProfileByAdmin(user.id) as UsageProfile | null
    const admin = createAdminClient()
    const { data: store, error: storeError } = await admin.from('stores').select('tenant_id').eq('id', input.data.storeId).maybeSingle()
    if (storeError) return json({ error: 'Não foi possível verificar a loja. Tente novamente.' }, 503)
    if (!store || !canUseUsageAssistant(profile, store, input.data.storeId)) return json({ error: 'Você não tem acesso a esta loja.' }, 403)

    // O identificador é estável por resposta, permitindo tentar novamente sem duplicar.
    const { error } = await (admin as any).from('usage_assistant_feedback').upsert({
      id: input.data.id, tenant_id: profile!.tenant_id, store_id: input.data.storeId,
      user_id: user.id, question: input.data.question, answer: input.data.answer,
    }, { onConflict: 'id', ignoreDuplicates: true })
    if (error) return json({ error: 'Não foi possível enviar a avaliação. Tente novamente.' }, 503)
    return json({ success: true })
  } catch {
    return json({ error: 'Não foi possível enviar a avaliação. Tente novamente.' }, 503)
  }
}
