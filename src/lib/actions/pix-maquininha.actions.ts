'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSicrediPilotStoreCnpj } from '@/lib/pix/sicredi-availability'
import { createPixMachineGrant, pixMachineCookieName, pixMachineGrantMaxAge } from '@/lib/pix/pix-maquininha-access'
import type { StoreSettings } from '@/lib/store-modules'

export type PixMachineAccessResult = { success: boolean; message: string }

export async function authorizePixMachine(
  _previousState: PixMachineAccessResult,
  formData: FormData,
): Promise<PixMachineAccessResult> {
  const storeId = Number(formData.get('store_id'))
  const pin = String(formData.get('pin') || '').trim()
  if (!Number.isSafeInteger(storeId) || storeId <= 0 || !/^\d{1,6}$/.test(pin)) {
    return { success: false, message: 'Informe um PIN valido.' }
  }

  const admin: any = createAdminClient()
  try {
    const { data: store } = await admin
      .from('stores')
      .select('id, cnpj, settings')
      .eq('id', storeId)
      .maybeSingle()
    const settings = (store?.settings || {}) as StoreSettings
    if (!store || !isSicrediPilotStoreCnpj(store.cnpj) || settings.pix_provider !== 'sicredi') {
      return { success: false, message: 'Modo maquininha Pix indisponivel para esta loja.' }
    }

    const { data: employee } = await admin
      .from('employees')
      .select('id')
      .eq('store_id', storeId)
      .eq('pin', pin)
      .eq('is_active', true)
      .maybeSingle()
    if (!employee) return { success: false, message: 'PIN incorreto ou funcionario inativo.' }

    cookies().set(pixMachineCookieName(storeId), createPixMachineGrant(storeId, Number(employee.id)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: pixMachineGrantMaxAge,
    })
    return { success: true, message: 'Maquininha autorizada.' }
  } catch {
    return { success: false, message: 'Nao foi possivel validar o PIN da maquininha.' }
  }
}
