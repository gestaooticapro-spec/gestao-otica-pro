import { NextResponse } from 'next/server'
import { getAccountantClosingLog } from '@/lib/accounting/monthly-closing'
import { canManageAccountantClosing } from '@/lib/accounting/closing-access'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  const url = new URL(request.url)
  const storeId = Number(url.searchParams.get('storeId'))
  const month = Number(url.searchParams.get('month'))
  const year = Number(url.searchParams.get('year'))
  if (!Number.isInteger(storeId) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
  }

  if (!await canManageAccountantClosing(storeId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json({ log: await getAccountantClosingLog(storeId, year, month) })
  } catch (error) {
    console.error('[Accountant closing] status lookup failed', error)
    return NextResponse.json({ error: 'Não foi possível consultar o envio.' }, { status: 500 })
  }
}
