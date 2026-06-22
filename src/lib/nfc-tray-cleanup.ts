import { createClient as createSupabaseClient } from '@supabase/supabase-js'

type CleanupDatabase = {
  public: {
    Tables: {
      nfc_trays: {
        Row: {
          id: string
          store_id: number
          current_service_order_id: number | null
        }
        Insert: never
        Update: {
          current_service_order_id?: number | null
        }
        Relationships: []
      }
      nfc_tray_events: {
        Row: {
          id: number
          tray_id: string
          store_id: number
          service_order_id: number | null
          action: string
          metadata: unknown
          created_at: string
        }
        Insert: {
          tray_id: string
          store_id: number
          service_order_id?: number | null
          action: string
          metadata?: unknown
        }
        Update: never
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

function createNfcCleanupClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Chaves de Service Role não configuradas.')
  }

  return createSupabaseClient<CleanupDatabase>(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function clearNfcTrayLinkForDeliveredOrder(
  serviceOrderId: number,
  deliveredAt?: string | null
) {
  const supabaseAdmin = createNfcCleanupClient()

  const { data: linkedTrays, error: trayError } = await supabaseAdmin
    .from('nfc_trays')
    .select('id,store_id')
    .eq('current_service_order_id', serviceOrderId)

  if (trayError) {
    throw trayError
  }

  if (!linkedTrays?.length) {
    return
  }

  const { error: unlinkError } = await supabaseAdmin
    .from('nfc_trays')
    .update({ current_service_order_id: null })
    .eq('current_service_order_id', serviceOrderId)

  if (unlinkError) {
    throw unlinkError
  }

  const eventRows = linkedTrays.map((tray) => ({
    tray_id: tray.id,
    store_id: tray.store_id,
    service_order_id: serviceOrderId,
    action: 'TRAY_UNLINKED',
    metadata: {
      reason: 'delivered_to_customer',
      delivered_at: deliveredAt ?? new Date().toISOString(),
    },
  }))

  const { error: eventError } = await supabaseAdmin
    .from('nfc_tray_events')
    .insert(eventRows)

  if (eventError) {
    throw eventError
  }
}
