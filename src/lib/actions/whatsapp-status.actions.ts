'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'

const ContextSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  publicationId: z.coerce.number().int().positive(),
  category: z.enum(['greeting', 'promotion', 'frame', 'product', 'notice', 'other']),
  description: z.string().trim().min(5).max(1200),
  responseGuidance: z.string().trim().max(800).optional(),
  autoReplyEnabled: z.boolean().default(true),
})

async function authorizeStore(storeId: number) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) throw new Error('Usuário não autenticado.')

  const profile = await getProfileByAdmin(user.id) as { role?: string | null; store_id?: number | null } | null
  if (!profile) throw new Error('Perfil não encontrado.')
  if (profile.role !== 'admin' && Number(profile.store_id) !== storeId) {
    throw new Error('Acesso negado para esta loja.')
  }

  return user
}

export type PendingWhatsAppStatusContext = {
  id: number
  message_text: string | null
  media_kind: string | null
  published_at: string
  expires_at: string
}

export async function getPendingWhatsAppStatusContexts(storeId: number): Promise<PendingWhatsAppStatusContext[]> {
  await authorizeStore(storeId)
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('whatsapp_status_publications') as any)
    .select('id, message_text, media_kind, published_at, expires_at')
    .eq('store_id', storeId)
    .is('contextualized_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('published_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function contextualizeWhatsAppStatusPublication(input: {
  storeId: number
  publicationId: number
  category: string
  description: string
  responseGuidance?: string
  autoReplyEnabled: boolean
}) {
  const parsed = ContextSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Preencha corretamente as informações do Status.' }

  const user = await authorizeStore(parsed.data.storeId)
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('whatsapp_status_publications') as any)
    .update({
      context_category: parsed.data.category,
      context_description: parsed.data.description,
      response_guidance: parsed.data.responseGuidance || null,
      auto_reply_enabled: parsed.data.autoReplyEnabled,
      contextualized_at: new Date().toISOString(),
      contextualized_by_user_id: user.id,
    })
    .eq('id', parsed.data.publicationId)
    .eq('store_id', parsed.data.storeId)
    .is('contextualized_at', null)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) return { success: false, message: 'Este Status já foi contextualizado ou não está disponível.' }
  return { success: true }
}
