'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export interface MedicaoPayload {
  osId: number
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

export async function saveMedicaoOS(payload: MedicaoPayload): Promise<{ ok: boolean; error?: string }> {
  const supabase      = createClient()
  const supabaseAdmin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

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

  const { error } = await (supabaseAdmin.from('service_orders') as any)
    .update(update)
    .eq('id', payload.osId)

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
      medida_dnp_od, venda_id, store_id,
      customer:customer_id ( full_name ),
      dependente:dependente_id ( full_name )
    `)
    .eq('store_id', storeId)
    .is('lab_nome', null)
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
