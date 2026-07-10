'use client'

import { toast } from 'sonner'
import {
  sendManualWhatsApp,
  type SendManualWhatsAppInput,
  type SendManualWhatsAppResult,
} from '@/lib/actions/manual-whatsapp.actions'

export async function sendManualWhatsAppFromClient(input: SendManualWhatsAppInput): Promise<SendManualWhatsAppResult> {
  try {
    const result = await sendManualWhatsApp(input)

    if (result.shouldOpenExternal && result.externalUrl) {
      const opened = window.open(result.externalUrl, '_blank')
      if (!opened) {
        window.location.href = result.externalUrl
      }
    }

    if (!result.success) {
      toast.error(result.message)
      return result
    }

    if (result.routeUsed === 'vps') {
      toast.success('Mensagem enviada via WhatsApp da loja.')
      return result
    }

    toast.info('WhatsApp externo aberto por fallback.')
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nao foi possivel iniciar o envio do WhatsApp.'
    toast.error(message)

    return {
      success: false,
      message,
      routeUsed: 'external_fallback',
      shouldOpenExternal: false,
    }
  }
}
