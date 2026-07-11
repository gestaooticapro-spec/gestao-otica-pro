'use client'

import { useEffect } from 'react'
import { runDashboardWhatsAppWakePing, type DashboardWhatsAppWakePingResult } from '@/lib/actions/whatsapp.actions'

const MAX_PER_DAY = 2
const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000
export const OPERATOR_WHATSAPP_WAKE_PING_AUDIT_EVENT = 'operator-whatsapp-wake-ping-audit'

export type OperatorWhatsAppWakePingAuditFlag = {
  status: DashboardWhatsAppWakePingResult['status']
  message: string
  checkedAt: string
}

function attemptKey(storeId: number) {
  return `wa-vps-wake-ping:${storeId}:${new Date().toISOString().slice(0, 10)}`
}

function auditKey(storeId: number) {
  return `wa-vps-wake-ping-audit:${storeId}`
}

function canRun(storeId: number) {
  const raw = window.localStorage.getItem(attemptKey(storeId))
  if (!raw) return true
  try {
    const value = JSON.parse(raw) as { attempts?: number; lastAt?: number }
    if (Number(value.attempts || 0) >= MAX_PER_DAY) return false
    return Date.now() - Number(value.lastAt || 0) >= MIN_INTERVAL_MS
  } catch {
    return true
  }
}

function recordAttempt(storeId: number, status: DashboardWhatsAppWakePingResult['status']) {
  const key = attemptKey(storeId)
  let attempts = 0
  try {
    attempts = Number((JSON.parse(window.localStorage.getItem(key) || '{}') as { attempts?: number }).attempts || 0)
  } catch {}
  window.localStorage.setItem(key, JSON.stringify({ attempts: attempts + 1, lastAt: Date.now(), status }))
}

export function readOperatorWhatsAppWakePingAudit(storeId: number): OperatorWhatsAppWakePingAuditFlag | null {
  if (storeId !== 1) return null
  try {
    const flag = JSON.parse(window.localStorage.getItem(auditKey(storeId)) || 'null') as OperatorWhatsAppWakePingAuditFlag | null
    return flag?.status && flag?.checkedAt ? flag : null
  } catch {
    return null
  }
}

export function clearOperatorWhatsAppWakePingAudit(storeId: number) {
  if (storeId === 1) window.localStorage.removeItem(auditKey(storeId))
}

function writeAudit(storeId: number, result: DashboardWhatsAppWakePingResult) {
  if (storeId !== 1) return
  const flag: OperatorWhatsAppWakePingAuditFlag = { status: result.status, message: result.message, checkedAt: new Date().toISOString() }
  window.localStorage.setItem(auditKey(storeId), JSON.stringify(flag))
  window.dispatchEvent(new CustomEvent(OPERATOR_WHATSAPP_WAKE_PING_AUDIT_EVENT))
}

export default function OperatorWhatsAppWakePing({ storeId }: { storeId: number }) {
  useEffect(() => {
    if (storeId !== 1 || !canRun(storeId)) return
    let cancelled = false

    const saveResult = (result: DashboardWhatsAppWakePingResult) => {
      if (cancelled || result.status === 'automation_disabled' || result.status === 'not_configured') return
      recordAttempt(storeId, result.status)
      writeAudit(storeId, result)
    }

    runDashboardWhatsAppWakePing(storeId)
      .then(saveResult)
      .catch(() => saveResult({ success: false, status: 'unreachable', message: 'Nao foi possivel consultar a VPS do WhatsApp.' }))

    return () => { cancelled = true }
  }, [storeId])

  return null
}
