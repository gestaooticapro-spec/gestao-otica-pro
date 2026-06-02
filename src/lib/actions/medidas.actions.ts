'use server'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export interface MedicaoPayload {
  osId: number
  storeId?: number
  dnpOd: number; dnpOe: number
  altOd: number;  altOe: number
  ponte: number
  horizontal: number; vertical: number; diagonal: number
  diamOd: number; diamOe: number
  palpebraOd?: number; palpebraOe?: number
  tipoLente: 'surfacada' | 'bifocal' | 'pronto'
  // JPEG base64 da imagem do canvas (sem o prefixo data:image/jpeg;base64,)
  fotoBase64?: string
}

export interface MedicaoOSLookup {
  id: number
  protocolo_fisico: string | null
  customer_name: string | null
  dependente_name: string | null
}

export async function findMedicaoOSByNumber(
  storeId: number,
  osNumber: string,
): Promise<{ ok: boolean; os?: MedicaoOSLookup; error?: string }> {
  const normalized = osNumber.trim()
  if (!normalized) return { ok: false, error: 'Informe o numero da OS' }

  const supabaseAdmin = createAdminClient()
  const numericId = /^\d+$/.test(normalized) ? Number(normalized) : null

  let query = (supabaseAdmin
    .from('service_orders') as any)
    .select(`
      id, protocolo_fisico, store_id,
      customer:customer_id ( full_name ),
      dependente:dependente_id ( full_name )
    `)
    .eq('store_id', storeId)

  if (numericId !== null) {
    query = query.or(`id.eq.${numericId},protocolo_fisico.eq.${normalized}`)
  } else {
    query = query.eq('protocolo_fisico', normalized)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(2)

  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: 'OS nao encontrada nessa loja' }
  if (data.length > 1) return { ok: false, error: 'Mais de uma OS encontrada. Use o ID interno da OS.' }

  const row = data[0]
  return {
    ok: true,
    os: {
      id: row.id,
      protocolo_fisico: row.protocolo_fisico,
      customer_name: row.customer?.full_name ?? null,
      dependente_name: row.dependente?.full_name ?? null,
    },
  }
}

export async function saveMedicaoOS(payload: MedicaoPayload): Promise<{ ok: boolean; error?: string }> {
  const supabase      = createClient()
  const supabaseAdmin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  let allowAnonymousTablet = false

  if (!user) {
    if (!payload.storeId) return { ok: false, error: 'Nao autenticado' }

    const { data: osRow, error: osError } = await (supabaseAdmin
      .from('service_orders') as any)
      .select('id, store_id')
      .eq('id', payload.osId)
      .eq('store_id', payload.storeId)
      .maybeSingle()

    if (osError || !osRow) return { ok: false, error: 'OS nao encontrada para a loja informada' }
    allowAnonymousTablet = true
  }

  const round1 = (n: number) => Math.round(n * 10) / 10

  let fotoUrl: string | null = null

  // ── Upload da foto para o Supabase Storage ────────────────────────────────
  if (payload.fotoBase64) {
    try {
      const byteString = atob(payload.fotoBase64)
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
      const blob = new Blob([ab], { type: 'image/jpeg' })

      const path = `os/${payload.osId}/${Date.now()}.jpg`
      const { error: uploadError } = await supabaseAdmin.storage
        .from('medicoes')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true })

      if (!uploadError) {
        // URL assinada válida por 10 anos (bucket privado)
        const { data: signed } = await supabaseAdmin.storage
          .from('medicoes')
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
        fotoUrl = signed?.signedUrl ?? null
      }
    } catch (e) {
      console.warn('[saveMedicaoOS] upload foto falhou:', e)
    }
  }

  // ── Atualiza a OS ─────────────────────────────────────────────────────────
  const update: Record<string, unknown> = {
    medida_dnp_od:     round1(payload.dnpOd),
    medida_dnp_oe:     round1(payload.dnpOe),
    medida_altura_od:  round1(payload.altOd),
    medida_altura_oe:  round1(payload.altOe),
    medida_ponte:      round1(payload.ponte),
    medida_horizontal: round1(payload.horizontal),
    medida_vertical:   round1(payload.vertical),
    medida_diagonal:   round1(payload.diagonal),
    medida_diametro_od: round1(payload.diamOd),
    medida_diametro_oe: round1(payload.diamOe),
    medida_tipo_lente:  payload.tipoLente,
  }

  if (payload.palpebraOd != null) update.medida_palpebra_od = round1(payload.palpebraOd)
  if (payload.palpebraOe != null) update.medida_palpebra_oe = round1(payload.palpebraOe)
  if (fotoUrl)                    update.foto_medicao_url   = fotoUrl

  let updateQuery = (supabaseAdmin.from('service_orders') as any)
    .update(update)
    .eq('id', payload.osId)

  if (allowAnonymousTablet && payload.storeId) {
    updateQuery = updateQuery.eq('store_id', payload.storeId)
  }

  const { error } = await updateQuery

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Lista de OS pendentes de laboratório ─────────────────────────────────────
export interface OSPendente {
  id: number
  protocolo_fisico: string | null
  created_at: string
  obs_os: string | null
  foto_medicao_url: string | null
  medida_dnp_od: string | null
  customer_name: string | null
  dependente_name: string | null
  venda_id: number
  store_id: number
}

export async function listOSPendentesLab(storeId: number): Promise<OSPendente[]> {
  const supabaseAdmin = createAdminClient()

  const { data, error } = await (supabaseAdmin
    .from('service_orders') as any)
    .select(`
      id, protocolo_fisico, created_at, obs_os, foto_medicao_url,
      medida_dnp_od, dt_pedido_em, dt_entregue_em, venda_id, store_id,
      customer:customer_id ( full_name ),
      dependente:dependente_id ( full_name )
    `)
    .eq('store_id', storeId)
    .is('dt_pedido_em', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error || !data) return []

  return data.map((row: any) => ({
    id: row.id,
    protocolo_fisico: row.protocolo_fisico,
    created_at: row.created_at,
    obs_os: row.obs_os,
    foto_medicao_url: row.foto_medicao_url,
    medida_dnp_od: row.medida_dnp_od,
    customer_name: row.customer?.full_name ?? null,
    dependente_name: row.dependente?.full_name ?? null,
    venda_id: row.venda_id,
    store_id: row.store_id,
  }))
}

export async function clearFotoMedicao(osId: number): Promise<{ ok: boolean }> {
  const supabaseAdmin = createAdminClient()
  const { error } = await (supabaseAdmin.from('service_orders') as any)
    .update({ foto_medicao_url: null })
    .eq('id', osId)
  return { ok: !error }
}

export interface OSLabPublic {
  id: number
  protocolo_fisico: string | null
  foto_medicao_url: string | null
  medida_dnp_od: string | null
  medida_dnp_oe: string | null
  medida_altura_od: string | null
  medida_altura_oe: string | null
  medida_horizontal: string | null
  medida_vertical: string | null
  medida_ponte: string | null
  medida_diametro: string | null
  medida_diametro_od: string | null
  medida_diametro_oe: string | null
  medida_palpebra_od: string | null
  medida_palpebra_oe: string | null
  medida_tipo_lente: string | null
  receita_longe_od_esferico: string | null
  receita_longe_od_cilindrico: string | null
  receita_longe_od_eixo: string | null
  receita_longe_oe_esferico: string | null
  receita_longe_oe_cilindrico: string | null
  receita_longe_oe_eixo: string | null
  receita_adicao: string | null
  store_name: string | null
  patient_name: string | null
}

export async function getOSByLabToken(token: string): Promise<OSLabPublic | null> {
  const supabaseAdmin = createAdminClient()

  const { data, error } = await (supabaseAdmin
    .from('service_orders') as any)
    .select(`
      id, protocolo_fisico, foto_medicao_url,
      medida_dnp_od, medida_dnp_oe, medida_altura_od, medida_altura_oe,
      medida_horizontal, medida_vertical, medida_ponte,
      medida_diametro, medida_diametro_od, medida_diametro_oe,
      medida_palpebra_od, medida_palpebra_oe, medida_tipo_lente,
      receita_longe_od_esferico, receita_longe_od_cilindrico, receita_longe_od_eixo,
      receita_longe_oe_esferico, receita_longe_oe_cilindrico, receita_longe_oe_eixo,
      receita_adicao,
      store:store_id ( name ),
      customer:customer_id ( full_name ),
      dependente:dependente_id ( full_name )
    `)
    .eq('token_lab', token)
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    protocolo_fisico: data.protocolo_fisico,
    foto_medicao_url: data.foto_medicao_url,
    medida_dnp_od: data.medida_dnp_od,
    medida_dnp_oe: data.medida_dnp_oe,
    medida_altura_od: data.medida_altura_od,
    medida_altura_oe: data.medida_altura_oe,
    medida_horizontal: data.medida_horizontal,
    medida_vertical: data.medida_vertical,
    medida_ponte: data.medida_ponte,
    medida_diametro: data.medida_diametro,
    medida_diametro_od: data.medida_diametro_od,
    medida_diametro_oe: data.medida_diametro_oe,
    medida_palpebra_od: data.medida_palpebra_od,
    medida_palpebra_oe: data.medida_palpebra_oe,
    medida_tipo_lente: data.medida_tipo_lente,
    receita_longe_od_esferico: data.receita_longe_od_esferico,
    receita_longe_od_cilindrico: data.receita_longe_od_cilindrico,
    receita_longe_od_eixo: data.receita_longe_od_eixo,
    receita_longe_oe_esferico: data.receita_longe_oe_esferico,
    receita_longe_oe_cilindrico: data.receita_longe_oe_cilindrico,
    receita_longe_oe_eixo: data.receita_longe_oe_eixo,
    receita_adicao: data.receita_adicao,
    store_name: data.store?.name ?? null,
    patient_name: data.dependente?.full_name ?? data.customer?.full_name ?? null,
  }
}
