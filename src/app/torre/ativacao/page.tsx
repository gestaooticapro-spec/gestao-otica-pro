import { createHash } from 'crypto'
import { Clock3, ScanLine, ShieldCheck } from 'lucide-react'
import TowerActivationAdminPin from '@/components/tower/TowerActivationAdminPin'
import TowerActivationFallbackCode from '@/components/tower/TowerActivationFallbackCode'
import TowerActivationQr from '@/components/tower/TowerActivationQr'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTowerAdminPin } from '@/lib/tower-admin-pin'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: {
    token?: string
    code?: string
    pin?: string
  }
}

type ActivationAccessRow = {
  status: 'pending' | 'consumed' | 'revoked'
  expires_at: string
  store_id: number
}

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value))
}

function isActivationWithinExpiry(activation: ActivationAccessRow) {
  return new Date(activation.expires_at).getTime() > Date.now()
}

function InvalidActivation() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-white">
      <section className="w-full max-w-md rounded-3xl border border-rose-300/20 bg-slate-900 p-7 text-center shadow-2xl shadow-black/30">
        <ShieldCheck className="mx-auto h-10 w-10 text-rose-300" />
        <h1 className="mt-5 text-2xl font-black">Ativacao indisponivel</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Este link ja foi utilizado, expirou, foi revogado ou nao e valido. Solicite uma nova ativacao ao responsavel pela instalacao.
        </p>
      </section>
    </main>
  )
}

export default async function TowerActivationPage({ searchParams }: PageProps) {
  const token = searchParams.token?.trim() || ''
  const fallbackCode = searchParams.code?.trim().toUpperCase() || ''
  const adminPin = searchParams.pin?.trim() || ''

  if (!/^[A-Za-z0-9_-]{32,}$/.test(token) || !/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(fallbackCode) || !/^\d{6}$/.test(adminPin)) {
    return <InvalidActivation />
  }

  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex')
  const fallbackCodeHash = createHash('sha256').update(fallbackCode, 'utf8').digest('hex')
  const admin = createAdminClient()
  const { data } = await admin
    .from('tower_device_activations')
    .select('status,expires_at,store_id')
    .eq('token_hash', tokenHash)
    .eq('fallback_code_hash', fallbackCodeHash)
    .maybeSingle()

  const activation = data as ActivationAccessRow | null
  const { data: pinRow } = activation
    ? await admin.from('tower_store_admin_pins').select('pin_hash').eq('store_id', activation.store_id).maybeSingle()
    : { data: null }
  const pinRecord = pinRow as { pin_hash: string } | null
  const isPending = activation?.status === 'pending'
  const isWithinExpiry = activation ? isActivationWithinExpiry(activation) : false
  const isAdminPinValid = pinRecord ? verifyTowerAdminPin(adminPin, pinRecord.pin_hash) : false

  if (!isPending || !isWithinExpiry || !isAdminPinValid) {
    return <InvalidActivation />
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white sm:px-8 sm:py-12">
      <section className="mx-auto flex max-w-xl flex-col items-center text-center">
        <div className="flex items-center gap-2 text-amber-300">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-black uppercase tracking-[0.16em]">Ativacao segura da Torre</span>
        </div>

        <h1 className="mt-5 text-3xl font-black sm:text-4xl">Mostre este QR Code para a Torre</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
          Deixe esta tela aberta e aproxime a camera da Torre do codigo abaixo para concluir a ativacao.
        </p>

        <div className="mt-8 w-full max-w-[430px]">
          <TowerActivationQr payload={`MBTOWER:1:${token}`} />
        </div>

        <TowerActivationFallbackCode code={fallbackCode} />
        <TowerActivationAdminPin pin={adminPin} />

        <div className="mt-7 flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs font-bold text-amber-100">
          <Clock3 className="h-4 w-4" />
          Valido ate {formatExpiry(activation.expires_at)}
        </div>
        <div className="mt-5 flex items-center gap-2 text-xs font-bold text-slate-500">
          <ScanLine className="h-4 w-4" />
          A leitura e feita diretamente pela camera da Torre.
        </div>
      </section>
    </main>
  )
}
