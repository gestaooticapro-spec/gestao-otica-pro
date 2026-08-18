'use server'

import { createFiscalPublicLinkToken } from '@/lib/fiscal-public-link'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function createFiscalPublicPrintLink(invoiceId: string | number) {
  const parsedInvoiceId = Number(invoiceId)
  if (!Number.isInteger(parsedInvoiceId) || parsedInvoiceId <= 0) {
    return { success: false as const, message: 'Nota fiscal invalida.' }
  }

  const auth = createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { success: false as const, message: 'Login necessario.' }

  const [profile, invoiceResult] = await Promise.all([
    getProfileByAdmin(user.id) as Promise<{ role?: string | null; store_id?: number | null } | null>,
    (createAdminClient() as any)
      .from('fiscal_invoices')
      .select('id, store_id')
      .eq('id', parsedInvoiceId)
      .maybeSingle(),
  ])
  const invoice = invoiceResult.data as { id: number; store_id: number } | null
  if (invoiceResult.error || !invoice) return { success: false as const, message: 'Nota fiscal nao encontrada.' }
  if (!profile || (profile.role !== 'admin' && Number(profile.store_id) !== Number(invoice.store_id))) {
    return { success: false as const, message: 'Acesso negado.' }
  }

  return {
    success: true as const,
    path: `/api/fiscal/print/${invoice.id}?access=${encodeURIComponent(createFiscalPublicLinkToken(invoice.id))}&download=true`,
  }
}
