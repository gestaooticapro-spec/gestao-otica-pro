'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'

const TRAY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,119}$/

type NfcDatabase = {
  public: {
    Tables: {
      nfc_trays: {
        Row: TrayData & {
          created_by_user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          store_id: number
          current_service_order_id?: number | null
          status?: TrayData['status']
          created_by_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<NfcDatabase['public']['Tables']['nfc_trays']['Insert']>
        Relationships: []
      }
      nfc_tray_events: {
        Row: {
          id: number
          tray_id: string
          store_id: number
          service_order_id: number | null
          action: string
          metadata: Json
          created_at: string
        }
        Insert: {
          tray_id: string
          store_id: number
          service_order_id?: number | null
          action: string
          metadata?: Json
        }
        Update: Record<string, never>
        Relationships: []
      }
      service_orders: {
        Row: {
          id: number
          store_id: number
          dt_pedido_em: string | null
          dt_lente_chegou: string | null
          dt_montado_em: string | null
        }
        Insert: Record<string, never>
        Update: {
          dt_lente_chegou?: string | null
          dt_montado_em?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          role: string | null
          store_id: number | null
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_nfc_tray: {
        Args: {
          p_tray_id: string
          p_store_id: number
          p_created_by_user_id: string
        }
        Returns: Json
      }
      link_nfc_tray_os: {
        Args: {
          p_tray_id: string
          p_store_id: number
          p_os_id: number
        }
        Returns: Json
      }
      advance_nfc_tray: {
        Args: {
          p_tray_id: string
          p_store_id: number
          p_action: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

export type TrayData = {
  id: string
  store_id: number
  status: 'active' | 'inactive' | 'lost'
  current_service_order_id: number | null
}

export type OSContext = {
  id: number
  dt_pedido_em: string | null
  dt_lente_chegou: string | null
  dt_montado_em: string | null
}

export type NfcAction =
  | 'LENTE_CHEGOU'
  | 'MONTAGEM_CONCLUIDA'
  | 'DESVINCULAR_BANDEJA'

export type TrayContextResult = {
  success: boolean
  message?: string
  tray?: TrayData
  os?: OSContext
  nextAction?:
    | 'VINCULAR_OS'
    | 'LENTE_CHEGOU'
    | 'MONTAGEM_CONCLUIDA'
    | 'CRIAR_BANDEJA'
    | 'PRONTO'
  requireAuth?: boolean
}

type ActionResult = {
  success: boolean
  message?: string
}

function createNfcAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Chaves de Service Role não configuradas.')
  }

  return createSupabaseClient<NfcDatabase>(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function isValidStoreId(storeId: number): boolean {
  return Number.isSafeInteger(storeId) && storeId > 0
}

function isValidTrayId(trayId: string): boolean {
  return TRAY_ID_PATTERN.test(trayId)
}

function publicDatabaseMessage(
  error: { code?: string; message?: string },
  fallback: string
): string {
  if (
    error.code === 'P0001' ||
    error.code === 'P0002' ||
    error.code === '22023'
  ) {
    return error.message || fallback
  }
  if (error.code === '23505') {
    return 'Esta bandeja ou OS já está vinculada.'
  }
  return fallback
}

export async function getTrayContext(
  trayId: string,
  storeId: number
): Promise<TrayContextResult> {
  if (!isValidStoreId(storeId) || !isValidTrayId(trayId)) {
    return { success: false, message: 'URL de bandeja inválida.' }
  }

  const supabaseAdmin = createNfcAdminClient()
  const { data: tray, error } = await supabaseAdmin
    .from('nfc_trays')
    .select('id,store_id,status,current_service_order_id')
    .eq('id', trayId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) {
    console.error('[NFC] Falha ao buscar bandeja:', error)
    return { success: false, message: 'Erro ao buscar bandeja.' }
  }

  if (!tray) {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return {
        success: false,
        message: 'Bandeja não cadastrada. Entre no sistema para cadastrá-la.',
        requireAuth: true,
      }
    }

    return { success: true, nextAction: 'CRIAR_BANDEJA' }
  }

  if (tray.status !== 'active') {
    return { success: false, message: 'Esta bandeja está inativa ou perdida.' }
  }

  const typedTray = tray as TrayData
  if (!typedTray.current_service_order_id) {
    return { success: true, tray: typedTray, nextAction: 'VINCULAR_OS' }
  }

  const { data: osData, error: osError } = await supabaseAdmin
    .from('service_orders')
    .select('id,store_id,dt_pedido_em,dt_lente_chegou,dt_montado_em')
    .eq('id', typedTray.current_service_order_id)
    .eq('store_id', storeId)
    .maybeSingle()

  if (osError) {
    console.error('[NFC] Falha ao buscar OS vinculada:', osError)
    return { success: false, message: 'Erro ao buscar a OS vinculada.' }
  }

  if (!osData) {
    return {
      success: false,
      message: 'A bandeja possui um vínculo inválido. Solicite a correção ao administrador.',
    }
  }

  let nextAction: TrayContextResult['nextAction']
  if (!osData.dt_lente_chegou) {
    nextAction = 'LENTE_CHEGOU'
  } else if (!osData.dt_montado_em) {
    nextAction = 'MONTAGEM_CONCLUIDA'
  } else {
    nextAction = 'PRONTO'
  }

  return {
    success: true,
    tray: typedTray,
    os: {
      id: osData.id,
      dt_pedido_em: osData.dt_pedido_em,
      dt_lente_chegou: osData.dt_lente_chegou,
      dt_montado_em: osData.dt_montado_em,
    },
    nextAction,
  }
}

export async function createNfcTray(
  trayId: string,
  storeId: number
): Promise<ActionResult> {
  if (!isValidStoreId(storeId) || !isValidTrayId(trayId)) {
    return { success: false, message: 'Identificador de bandeja inválido.' }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, message: 'Usuário não autenticado.' }
  }

  const supabaseAdmin = createNfcAdminClient()
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role,store_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('[NFC] Falha ao buscar perfil:', profileError)
    return { success: false, message: 'Não foi possível validar sua permissão.' }
  }

  if (!profile || !['admin', 'manager'].includes(profile.role ?? '')) {
    return {
      success: false,
      message: 'Apenas administradores ou gerentes podem cadastrar bandejas.',
    }
  }
  if (profile.role !== 'admin' && Number(profile.store_id) !== storeId) {
    return {
      success: false,
      message: 'Você não tem permissão para cadastrar bandejas nesta loja.',
    }
  }

  const { error } = await supabaseAdmin.rpc('create_nfc_tray', {
    p_tray_id: trayId,
    p_store_id: storeId,
    p_created_by_user_id: user.id,
  })

  if (error) {
    console.error('[NFC] Falha ao cadastrar bandeja:', error)
    return {
      success: false,
      message: publicDatabaseMessage(error, 'Erro ao cadastrar bandeja.'),
    }
  }

  revalidatePath(`/nfc/${storeId}/bandeja/${trayId}`)
  return { success: true, message: 'Bandeja cadastrada com sucesso.' }
}

export async function linkOsToTray(
  trayId: string,
  storeId: number,
  osId: number
): Promise<ActionResult> {
  if (
    !isValidStoreId(storeId) ||
    !isValidTrayId(trayId) ||
    !Number.isSafeInteger(osId) ||
    osId <= 0
  ) {
    return { success: false, message: 'Dados de vinculação inválidos.' }
  }

  const supabaseAdmin = createNfcAdminClient()
  const { error } = await supabaseAdmin.rpc('link_nfc_tray_os', {
    p_tray_id: trayId,
    p_store_id: storeId,
    p_os_id: osId,
  })

  if (error) {
    console.error('[NFC] Falha ao vincular OS:', error)
    return {
      success: false,
      message: publicDatabaseMessage(error, 'Erro ao vincular a OS.'),
    }
  }

  revalidatePath(`/nfc/${storeId}/bandeja/${trayId}`)
  return { success: true, message: `Bandeja vinculada à OS ${osId}.` }
}

export async function advanceOsStatus(
  trayId: string,
  storeId: number,
  actionType: NfcAction
): Promise<ActionResult> {
  if (!isValidStoreId(storeId) || !isValidTrayId(trayId)) {
    return { success: false, message: 'Dados da bandeja inválidos.' }
  }

  const allowedActions: NfcAction[] = [
    'LENTE_CHEGOU',
    'MONTAGEM_CONCLUIDA',
    'DESVINCULAR_BANDEJA',
  ]
  if (!allowedActions.includes(actionType)) {
    return { success: false, message: 'Ação inválida.' }
  }

  const supabaseAdmin = createNfcAdminClient()
  const { error } = await supabaseAdmin.rpc('advance_nfc_tray', {
    p_tray_id: trayId,
    p_store_id: storeId,
    p_action: actionType,
  })

  if (error) {
    console.error('[NFC] Falha ao avançar OS:', error)
    return {
      success: false,
      message: publicDatabaseMessage(error, 'Erro ao atualizar o status da OS.'),
    }
  }

  revalidatePath(`/nfc/${storeId}/bandeja/${trayId}`)
  return { success: true }
}
