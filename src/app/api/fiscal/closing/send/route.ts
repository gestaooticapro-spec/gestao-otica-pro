import { NextResponse } from 'next/server'
import { sendMonthlyAccountantClosing } from '@/lib/accounting/monthly-closing'
import { canManageAccountantClosing } from '@/lib/accounting/closing-access'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const storeId = Number(body.storeId)
    const month = Number(body.month)
    const year = Number(body.year)
    if (!Number.isInteger(storeId) || !Number.isInteger(month) || !Number.isInteger(year)) {
      return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
    }
    if (!await canManageAccountantClosing(storeId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await sendMonthlyAccountantClosing({ storeId, month, year, allowResend: true })
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (error) {
    console.error('[Accountant closing] manual send failed', error)
    return NextResponse.json({ error: 'Não foi possível enviar o fechamento.' }, { status: 500 })
  }
}
