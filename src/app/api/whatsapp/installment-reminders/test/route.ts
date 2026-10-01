import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAdmin } from '@/lib/supabase/admin'
import { triggerStoreOneInstallmentReminderTest } from '@/lib/whatsapp/installment-reminders'

export const runtime = 'nodejs'

const requestSchema = z.object({
  expectedRecipient: z.string().trim().min(8).max(40),
})

const reasonMessages: Record<string, string> = {
  invalid_recipient: 'Informe o telefone cadastrado, com DDD, para a conferência de segurança.',
  channel_unavailable_or_ambiguous: 'A Loja 1 não tem exatamente um canal WhatsApp conectado.',
  reminder_disabled: 'Os lembretes de parcelas estão desativados para a Loja 1.',
  outside_business_hours: 'O teste só pode ser enviado em dia útil, entre 9h e 18h.',
  installment_not_found: 'A parcela reservada para este teste não foi localizada.',
  installment_not_eligible: 'A parcela de teste não está elegível; nenhum envio foi feito.',
  recipient_mismatch: 'O telefone informado não corresponde ao telefone cadastrado na parcela de teste.',
  recipient_opted_out: 'Este número optou por não receber lembretes de vencimento por WhatsApp.',
  human_control_active: 'Há controle humano ativo para esta conversa; nenhum envio foi feito.',
  reminder_already_exists: 'Esta parcela já tem um registro de lembrete; o teste não será repetido.',
  failed: 'O envio falhou. O registro foi preservado e não será repetido automaticamente.',
  cancelled: 'O envio foi cancelado por uma proteção de segurança.',
  delivery_pending_review: 'Não foi possível confirmar o resultado. Verifique o WhatsApp Operacional antes de tentar novamente.',
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function POST(request: Request) {
  const requestId = randomUUID()
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) {
    return json({ ok: false, outcome: 'not_sent', message: 'Origem da solicitação inválida.' }, 403)
  }

  const auth = createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return json({ ok: false, outcome: 'not_sent', message: 'Faça login novamente.' }, 401)

  const profile = await getProfileByAdmin(user.id) as {
    role?: string | null
    store_id?: number | null
  } | null
  const isStoreOneAdmin = profile?.role === 'admin'
    && (profile.store_id == null || Number(profile.store_id) === 1)
  const isStoreOneOperator = ['manager', 'store_operator'].includes(profile?.role || '')
    && Number(profile?.store_id) === 1
  if (!isStoreOneAdmin && !isStoreOneOperator) {
    return json({ ok: false, outcome: 'not_sent', message: 'Acesso negado para este teste da Loja 1.' }, 403)
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return json({ ok: false, outcome: 'not_sent', message: 'Informe um telefone válido para a conferência.' }, 400)
  }

  try {
    const result = await triggerStoreOneInstallmentReminderTest(parsed.data)
    if (result.outcome === 'accepted') {
      console.info('[WhatsApp][installment-reminder-test]', JSON.stringify({
        requestId,
        outcome: result.outcome,
        installmentId: result.installmentId,
        reminderId: result.reminderId,
      }))
      return json({
        ok: true,
        outcome: 'accepted',
        requestId,
        reminderId: result.reminderId,
        installmentId: result.installmentId,
        message: 'A Evolution aceitou o envio isolado do lembrete. Confira o WhatsApp; a aceitação não confirma a entrega no aparelho. O registro não poderá ser repetido para esta parcela.',
      })
    }

    const status = result.reason === 'invalid_recipient' ? 400
      : result.reason === 'delivery_pending_review' ? 500
        : 409
    console.info('[WhatsApp][installment-reminder-test]', JSON.stringify({
      requestId,
      outcome: result.outcome,
      reason: result.reason,
    }))
    return json({
      ok: false,
      outcome: result.reason === 'delivery_pending_review' ? 'delivery_pending_review' : 'not_sent',
      requestId,
      message: reasonMessages[result.reason] || 'Nenhuma mensagem foi enviada.',
    }, status)
  } catch {
    console.error('[WhatsApp][installment-reminder-test]', JSON.stringify({
      requestId,
      outcome: 'delivery_pending_review',
      reason: 'unhandled_error',
    }))
    return json({
      ok: false,
      outcome: 'delivery_pending_review',
      requestId,
      message: reasonMessages.delivery_pending_review,
    }, 500)
  }
}
