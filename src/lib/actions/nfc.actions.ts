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

type AuthorizedUserResult =
  | {
      success: true
      userId: string
    }
  | ActionResult

type AuthenticatedStoreUserResult =
  | {
      success: true
    }
  | ActionResult

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
    return 'Este envelope ou OS já está vinculado.'
  }
  return fallback
}

async function requireAuthorizedStoreUser(
  storeId: number
): Promise<AuthorizedUserResult> {
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
    return {
      success: false,
      message: 'Não foi possível validar sua permissão.',
    }
  }

  if (!profile || !['admin', 'manager'].includes(profile.role ?? '')) {
    return {
      success: false,
      message: 'Apenas administradores ou gerentes podem operar este envelope.',
    }
  }

  if (profile.role !== 'admin' && Number(profile.store_id) !== storeId) {
    return {
      success: false,
      message: 'Você não tem permissão para operar envelopes nesta loja.',
    }
  }

  return { success: true, userId: user.id }
}

async function requireAuthenticatedStoreUser(
  storeId: number
): Promise<AuthenticatedStoreUserResult> {
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
    .select('store_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('[NFC] Falha ao buscar perfil:', profileError)
    return {
      success: false,
      message: 'Não foi possível validar sua permissão.',
    }
  }

  if (!profile) {
    return {
      success: false,
      message: 'Seu usuário não possui perfil vinculado.',
    }
  }

  if (profile.store_id !== null && Number(profile.store_id) !== storeId) {
    return {
      success: false,
      message: 'Você não tem permissão para operar envelopes nesta loja.',
    }
  }

  return { success: true }
}

export async function getTrayContext(
  trayId: string,
  storeId: number
): Promise<TrayContextResult> {
  if (!isValidStoreId(storeId) || !isValidTrayId(trayId)) {
    return { success: false, message: 'URL de envelope inválida.' }
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
    return { success: false, message: 'Erro ao buscar envelope.' }
  }

  if (!tray) {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return {
        success: false,
        message: 'Envelope não cadastrado. Entre no sistema para cadastrá-lo.',
        requireAuth: true,
      }
    }

    return { success: true, nextAction: 'CRIAR_BANDEJA' }
  }

  if (tray.status !== 'active') {
    return { success: false, message: 'Este envelope está inativo ou perdido.' }
  }

  const typedTray = tray as TrayData
  if (!typedTray.current_service_order_id) {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return {
      success: !!user,
      message: user
        ? undefined
        : 'Entre no sistema para vincular uma Ordem de Serviço a este envelope.',
      tray: typedTray,
      nextAction: 'VINCULAR_OS',
      requireAuth: !user,
    }
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
      message:
        'Este envelope possui um vínculo inválido. Solicite a correção ao administrador.',
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
    return { success: false, message: 'Identificador de envelope inválido.' }
  }

  const authResult = await requireAuthorizedStoreUser(storeId)
  if (!('userId' in authResult)) {
    return authResult
  }

  const supabaseAdmin = createNfcAdminClient()
  const { error } = await supabaseAdmin.rpc('create_nfc_tray', {
    p_tray_id: trayId,
    p_store_id: storeId,
    p_created_by_user_id: authResult.userId,
  })

  if (error) {
    console.error('[NFC] Falha ao cadastrar bandeja:', error)
    return {
      success: false,
      message: publicDatabaseMessage(error, 'Erro ao cadastrar envelope.'),
    }
  }

  revalidatePath(`/nfc/${storeId}/bandeja/${trayId}`)
  return { success: true, message: 'Envelope cadastrado com sucesso.' }
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

  const authResult = await requireAuthenticatedStoreUser(storeId)
  if (!authResult.success) {
    return authResult
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
  return { success: true, message: `Envelope vinculado à OS ${osId}.` }
}

export async function advanceOsStatus(
  trayId: string,
  storeId: number,
  actionType: NfcAction
): Promise<ActionResult> {
  if (!isValidStoreId(storeId) || !isValidTrayId(trayId)) {
    return { success: false, message: 'Dados do envelope inválidos.' }
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
