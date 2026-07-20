'use client'

import {
  completeTowerSession,
  getActiveTowerSessions,
  getOrCreateTowerSession,
  linkCustomerToTowerSession,
  type TowerSession,
  type TowerSessionSummary,
} from '@/lib/actions/tower-session.actions'
import { saveTowerMeasurementResult } from '@/lib/actions/tower-measurement.actions'
import { createQuickCustomer } from '@/lib/actions/customer.actions'

type Experience = 'look' | 'visagismo' | 'campo_visual' | 'medidas' | 'thickness'
type ActionResult<T> = { success: boolean; message: string; data?: T }
type MeasurementInput = Parameters<typeof saveTowerMeasurementResult>[0]
export type OperationalTowerCustomer = {
  id: number | string
  localId?: string
  full_name: string
  fone_movel: string | null
  provisional?: boolean
}

export async function getOrCreateOperationalTowerSession(input: {
  storeId: number
  experience: Experience
  sessionId?: string
}): Promise<ActionResult<TowerSession>> {
  if (window.towerDesktop) {
    return window.towerDesktop.createLocalSession({
      experience: input.experience,
      sessionId: input.sessionId,
    })
  }
  return getOrCreateTowerSession(input)
}

export async function getOperationalTowerSessions(storeId: number): Promise<ActionResult<TowerSessionSummary[]>> {
  if (window.towerDesktop) {
    const local = await window.towerDesktop.listLocalSessions()
    try {
      const remote = await getActiveTowerSessions(storeId)
      if (remote.success) {
        const merged = new Map<string, TowerSessionSummary>()
        for (const session of remote.data ?? []) merged.set(session.id, session)
        for (const session of local.data ?? []) merged.set(session.id, { ...session, customer: null })
        return { success: true, message: 'Sessoes locais e remotas carregadas.', data: [...merged.values()] }
      }
    } catch {
      // Durante uma queda, a lista local continua sendo a fonte operacional.
    }
    return {
      ...local,
      data: local.data?.map((session) => ({ ...session, customer: null })),
    }
  }
  return getActiveTowerSessions(storeId)
}

export async function completeOperationalTowerSession(input: {
  storeId: number
  sessionId: string
}): Promise<ActionResult<undefined>> {
  if (window.towerDesktop) {
    return window.towerDesktop.closeLocalSession({ sessionId: input.sessionId, status: 'completed' })
  }
  return completeTowerSession(input)
}

export async function createOperationalTowerCustomer(input: {
  storeId: number
  sessionId: string
  fullName: string
  mobilePhone: string
}): Promise<ActionResult<OperationalTowerCustomer>> {
  if (window.towerDesktop) {
    const result = await window.towerDesktop.createLocalCustomer({
      sessionId: input.sessionId,
      fullName: input.fullName,
      mobilePhone: input.mobilePhone,
    })
    return {
      success: result.success,
      message: result.message,
      data: result.data ? {
        id: result.data.id,
        localId: result.data.localId,
        full_name: result.data.fullName,
        fone_movel: result.data.mobilePhone,
        provisional: result.data.provisional,
      } : undefined,
    }
  }

  const form = new FormData()
  form.set('store_id', String(input.storeId))
  form.set('full_name', input.fullName)
  form.set('fone_movel', input.mobilePhone)
  const created = await createQuickCustomer(form)
  if (!created.success || !created.data) return { success: false, message: created.message }
  const linked = await linkCustomerToTowerSession({
    storeId: input.storeId,
    sessionId: input.sessionId,
    customerId: created.data.id,
  })
  if (!linked.success) return { success: false, message: linked.message }
  return {
    success: true,
    message: 'Cliente cadastrado e vinculado.',
    data: {
      id: created.data.id,
      full_name: created.data.full_name,
      fone_movel: created.data.fone_movel,
      provisional: false,
    },
  }
}

export async function linkOperationalTowerCustomer(input: {
  storeId: number
  sessionId: string
  customer: OperationalTowerCustomer
}): Promise<ActionResult<{ remoteCustomerId?: number | null }>> {
  if (typeof input.customer.id === 'string') {
    if (!window.towerDesktop) return { success: false, message: 'Cliente provisório indisponivel fora da Torre.' }
    const linked = await window.towerDesktop.linkLocalCustomer({
      sessionId: input.sessionId,
      localCustomerId: input.customer.localId || input.customer.id,
    })
    return { success: linked.success, message: linked.message, data: { remoteCustomerId: linked.remoteCustomerId } }
  }
  const linked = await linkCustomerToTowerSession({
    storeId: input.storeId,
    sessionId: input.sessionId,
    customerId: input.customer.id,
  })
  return { success: linked.success, message: linked.message }
}

export async function resolveOperationalTowerCustomer(
  customer: OperationalTowerCustomer,
): Promise<OperationalTowerCustomer | null> {
  if (typeof customer.id === 'number') return customer
  if (!window.towerDesktop) return null
  const status = await window.towerDesktop.getLocalCustomerStatus(customer.localId || customer.id)
  if (!status.success || !status.remoteCustomerId) return null
  return { ...customer, id: status.remoteCustomerId, provisional: false }
}

export async function saveOperationalTowerMeasurement(
  input: MeasurementInput,
): Promise<ActionResult<{ id: string; version: number }>> {
  if (window.towerDesktop) {
    return window.towerDesktop.saveLocalMeasurement({
      towerSessionId: input.towerSessionId,
      lensMode: input.lensMode,
      referenceMm: input.referenceMm,
      frontMeasurements: input.frontMeasurements,
      profileMeasurements: input.profileMeasurements,
      attentionCodes: input.attentionCodes,
      algorithmVersion: input.algorithmVersion,
    })
  }
  return saveTowerMeasurementResult(input)
}
