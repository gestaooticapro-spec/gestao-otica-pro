import type { BillingStoreStatus } from './integracao-asaas'

type BillingBannerStatus = Pick<BillingStoreStatus,
  'status' | 'blockAfter' | 'daysUntilDue' | 'paymentDueSoon' | 'shouldBlockNewOperations' | 'blockScope' | 'store'
>

export function formatBillingCurrency(value?: number | null) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatBillingDate(value?: string | null) {
  if (!value) return null
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function parseCalendarDate(value?: string | null) {
  if (!value) return null
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return { year, month, day }
}

function localCalendarDate(date: Date) {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
}

function calendarTimestamp(value: { year: number; month: number; day: number }) {
  return Date.UTC(value.year, value.month - 1, value.day)
}

export function localBillingDateKey(now = new Date()) {
  const { year, month, day } = localCalendarDate(now)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function billingDaysUntil(value?: string | null, now = new Date()) {
  const date = parseCalendarDate(value)
  if (!date) return null
  return Math.round((calendarTimestamp(date) - calendarTimestamp(localCalendarDate(now))) / 86_400_000)
}

export function getBillingBannerPresentation(status: BillingBannerStatus, now = new Date()) {
  const paidUntil = formatBillingDate(status.store?.paid_until)
  const daysUntilDue = billingDaysUntil(status.store?.paid_until, now)
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0
  const isDueToday = daysUntilDue === 0
  const isBlocked = status.shouldBlockNewOperations || status.status === 'bloqueado'
  const daysUntilBlock = billingDaysUntil(status.blockAfter, now)
  const isFinalGraceDay = status.status === 'pendente' && daysUntilBlock === 0
  const showBanner = Boolean(status.paymentDueSoon || status.status === 'pendente' || isBlocked)
  const hasPayment = Boolean(status.store?.payment_copy_paste || status.store?.payment_qr_code)
  const canPay = hasPayment && status.status !== 'vip' && status.status !== 'liberado' && (
    status.status === 'pendente' || isBlocked || Boolean(status.paymentDueSoon) || (daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 2)
  )
  const amount = formatBillingCurrency(status.store?.monthly_amount)

  const title = isBlocked
    ? 'Mensalidade em atraso'
    : isOverdue
      ? 'Mensalidade pendente'
      : 'Mensalidade em dia'

  let message: string
  if (isBlocked) {
    message = 'Novas vendas estao bloqueadas por atraso na mensalidade. Seus dados, historico e relatorios continuam salvos. Fale com o administrador para regularizar.'
  } else if (isFinalGraceDay) {
    message = 'Hoje e o ultimo dia de tolerancia. Novas vendas serao bloqueadas ao fim do dia se a mensalidade nao for regularizada.'
  } else if (paidUntil) {
    if (isOverdue) {
      message = daysUntilBlock !== null && daysUntilBlock >= 1 && daysUntilBlock <= 4
        ? `Sua mensalidade venceu em ${paidUntil}. Seu acesso sera bloqueado em ${daysUntilBlock} ${daysUntilBlock === 1 ? 'dia' : 'dias'}. Regularize para evitar a interrupcao.`
        : `Sua mensalidade venceu em ${paidUntil}. Regularize o pagamento para evitar bloqueio de novas vendas.`
    } else if (isDueToday) {
      message = 'Sua mensalidade vence hoje. Use o QR Code para realizar o pagamento por Pix.'
    } else {
      message = `Sua mensalidade vence em ${paidUntil}. O QR Code ja esta disponivel para pagamento antecipado.`
    }
  } else {
    message = 'Existe uma mensalidade pendente.'
  }

  return { amount, canPay, isBlocked, isFinalGraceDay, isOverdue, message, showBanner, title }
}
