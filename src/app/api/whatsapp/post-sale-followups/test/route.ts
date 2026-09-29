import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAdmin } from '@/lib/supabase/admin'
import { triggerStoreOnePostSaleFollowupTest } from '@/lib/whatsapp/post-sale-followups'

export const runtime = 'nodejs'

const requestSchema = z.object({
  protocol: z.string().trim().min(1).max(40),
  expectedRecipient: z.string().trim().min(8).max(40),
})

const reasonMessages: Record<string, string> = {
  protocol_not_allowed: 'Este gatilho só aceita o protocolo de teste autorizado.',
  invalid_recipient: 'Informe um telefone válido para a conferência de segurança.',
  order_not_found: 'A OS de teste não foi localizada na Loja 1.',
  order_ambiguous: 'Há mais de uma OS compatível; nenhum disparo foi feito.',
  channel_unavailable_or_ambiguous: 'A Loja 1 não tem exatamente um canal WhatsApp conectado.',
  followup_disabled: 'O acompanhamento automático está desativado para a Loja 1.',
  tenant_mismatch: 'A OS não pertence ao mesmo cadastro da conexão da Loja 1.',
  recipient_mismatch: 'O telefone informado não corresponde ao telefone cadastrado na OS.',
  delivery_not_old_enough: 'A OS ainda não atingiu o prazo configurado para o pós-venda.',
  sale_ineligible: 'A venda está cancelada ou devolvida; nenhum disparo foi feito.',
  post_sale_ambiguous: 'O pós-venda da OS está inconsistente; nenhum disparo foi feito.',
  post_sale_already_active_or_complete: 'Esta OS já tem um pós-venda ativo ou concluído.',
  outside_business_hours: 'A loja está fora do horário permitido para disparos.',
  human_control_active: 'Há controle humano ativo para esta conversa; nenhum disparo foi feito.',
  recipient_opted_out: 'Este número optou por não receber acompanhamentos automáticos.',
  followup_already_exists: 'Já existe um registro de disparo para esta OS; não será repetido.',
  sending: 'O envio foi iniciado, mas ainda precisa de reconciliação antes de qualquer repetição.',
  failed: 'O envio falhou. O registro foi preservado e não será repetido automaticamente.',
  cancelled: 'O envio foi cancelado por uma proteção de segurança.',
  scheduled: 'O envio continua pendente; não repita o gatilho.',
  delivery_pending_review: 'O resultado do envio é incerto; verifique o operacional antes de tentar novamente.',
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) {
    return json({ ok: false, message: 'Origem da solicitação inválida.' }, 403)
  }

  const auth = createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return json({ ok: false, message: 'Faça login novamente.' }, 401)

  const profile = await getProfileByAdmin(user.id) as {
    role?: string | null
    store_id?: number | null
  } | null
  const isStoreOneAdmin = profile?.role === 'admin'
    && (profile.store_id == null || Number(profile.store_id) === 1)
  const isStoreOneOperator = ['manager', 'store_operator'].includes(profile?.role || '')
    && Number(profile?.store_id) === 1
  if (!isStoreOneAdmin && !isStoreOneOperator) {
    return json({ ok: false, message: 'Acesso negado para este teste da Loja 1.' }, 403)
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, message: 'Informe o protocolo e o telefone para conferência.' }, 400)

  try {
    const result = await triggerStoreOnePostSaleFollowupTest(parsed.data)
    if (result.outcome === 'sent') {
      return json({ ok: true, outcome: 'sent', message: 'Disparo de teste enviado à OS autorizada.' })
    }

    const status = result.reason === 'protocol_not_allowed' || result.reason === 'invalid_recipient' ? 400 : 409
    return json({
      ok: false,
      outcome: 'not_sent',
      message: reasonMessages[result.reason] || 'Nenhuma mensagem foi enviada.',
    }, status)
  } catch {
    console.error('[WhatsApp] Falha no gatilho manual isolado de pós-venda da Loja 1.')
    return json({
      ok: false,
      outcome: 'delivery_pending_review',
      message: 'Não foi possível confirmar o resultado. Verifique o WhatsApp Operacional antes de tentar novamente.',
    }, 500)
  }
}
