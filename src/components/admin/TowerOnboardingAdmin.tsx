'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import {
  Building2,
  Check,
  Clock3,
  Copy,
  KeyRound,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Store,
  XCircle,
} from 'lucide-react'
import {
  createTowerOnboarding,
  revokeTowerActivation,
  type CreateTowerOnboardingInput,
  type TowerActivationCredential,
  type TowerActivationStatus,
  type TowerAdminDashboardData,
} from '@/lib/actions/tower-admin.actions'

type Props = {
  initialData: TowerAdminDashboardData
}

const inputClass = 'mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/10 disabled:cursor-not-allowed disabled:opacity-50'
const labelClass = 'text-xs font-black uppercase tracking-[0.14em] text-slate-400'

const statusLabels: Record<TowerActivationStatus, string> = {
  pending: 'Aguardando leitura',
  consumed: 'Torre ativada',
  revoked: 'Revogada',
  expired: 'Expirada',
}

const statusClasses: Record<TowerActivationStatus, string> = {
  pending: 'border-amber-300/25 bg-amber-300/10 text-amber-200',
  consumed: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200',
  revoked: 'border-rose-300/25 bg-rose-300/10 text-rose-200',
  expired: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function TowerOnboardingAdmin({ initialData }: Props) {
  const router = useRouter()
  const [tenantMode, setTenantMode] = useState<'existing' | 'new'>(initialData.tenants.length ? 'existing' : 'new')
  const [activation, setActivation] = useState<TowerActivationCredential | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [copied, setCopied] = useState<'code' | 'pin' | 'qr' | null>(null)
  const [isCreating, startCreating] = useTransition()
  const [isRevoking, startRevoking] = useTransition()
  const onboardingInFlight = useRef(false)

  const copyValue = async (kind: 'code' | 'pin' | 'qr', value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1800)
  }

  const handleSubmit = (formData: FormData) => {
    if (onboardingInFlight.current) return
    onboardingInFlight.current = true
    setMessage(null)
    setActivation(null)

    const input: CreateTowerOnboardingInput = {
      tenantMode,
      existingTenantId: String(formData.get('existingTenantId') || ''),
      newTenantName: String(formData.get('newTenantName') || ''),
      storeName: String(formData.get('storeName') || ''),
      city: String(formData.get('city') || ''),
      state: String(formData.get('state') || ''),
      address: String(formData.get('address') || ''),
      phone: String(formData.get('phone') || ''),
      validForHours: Number(formData.get('validForHours') || 168),
    }

    startCreating(async () => {
      try {
        const result = await createTowerOnboarding(input)
        if (!result.success || !result.activation) {
          setMessage({ type: 'error', text: result.message })
          return
        }

        setActivation(result.activation)
        setMessage({ type: 'success', text: result.message })
        router.refresh()
      } finally {
        onboardingInFlight.current = false
      }
    })
  }

  const handleRevoke = (activationId: string) => {
    setMessage(null)
    startRevoking(async () => {
      const result = await revokeTowerActivation(activationId)
      setMessage({ type: result.success ? 'success' : 'error', text: result.message })
      if (result.success) router.refresh()
    })
  }

  const getActivationShareUrl = (credential: TowerActivationCredential) => {
    const token = credential.qrPayload.replace(/^MBTOWER:1:/, '')
    const url = new URL('/torre/ativacao', window.location.origin)
    url.searchParams.set('token', token)
    url.searchParams.set('code', credential.fallbackCode)
    url.searchParams.set('pin', credential.adminPin)
    return url.toString()
  }

  const shareActivationViaWhatsApp = (credential: TowerActivationCredential) => {
    const activationUrl = getActivationShareUrl(credential)
    const message = [
      `A ativacao da Torre da loja ${credential.storeName} esta pronta.`,
      'Abra este link e mostre o QR Code na tela para a camera da Torre:',
      activationUrl,
    ].join('\n\n')

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/20">
        <div className="border-b border-white/10 px-6 py-5 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">Novo equipamento</p>
              <h2 className="mt-2 text-2xl font-black text-white">Preparar loja para receber a Torre</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Escolha uma empresa existente ou crie uma nova. A loja será cadastrada e receberá uma ativação temporária de uso único.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-xs font-bold text-emerald-100">
              <ShieldCheck className="mr-2 inline h-4 w-4" />
              Credenciais guardadas como hash
            </div>
          </div>
        </div>

        <form action={handleSubmit} className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr_.85fr]">
          <div className="space-y-7">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-amber-300" />
                <h3 className="font-black text-white">1. Rede de Óticas</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTenantMode('existing')}
                  disabled={!initialData.tenants.length}
                  className={`rounded-2xl border p-4 text-left transition ${tenantMode === 'existing' ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/10 bg-slate-950/40 hover:border-white/20'} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <p className="text-sm font-black text-white">Tenant existente</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Adicionar outra loja a uma empresa cadastrada.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setTenantMode('new')}
                  className={`rounded-2xl border p-4 text-left transition ${tenantMode === 'new' ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/10 bg-slate-950/40 hover:border-white/20'}`}
                >
                  <p className="text-sm font-black text-white">Nova empresa</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Criar um tenant para a primeira loja.</p>
                </button>
              </div>

              <div className="mt-4">
                {tenantMode === 'existing' ? (
                  <label className={labelClass}>
                    Empresa
                    <select name="existingTenantId" required className={inputClass} defaultValue="">
                      <option value="" disabled>Selecione uma empresa</option>
                      {initialData.tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className={labelClass}>
                    Nome da Nova Rede
                    <input name="newTenantName" required minLength={2} maxLength={120} className={inputClass} placeholder="Ex.: Grupo Óptico Horizonte" />
                  </label>
                )}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <Store className="h-5 w-5 text-cyan-300" />
                <h3 className="font-black text-white">2. Loja que receberá a Torre</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={`${labelClass} sm:col-span-2`}>
                  Nome da loja
                  <input name="storeName" required minLength={2} maxLength={120} className={inputClass} placeholder="Ex.: Ótica Horizonte Centro" />
                </label>
                <label className={labelClass}>
                  Cidade
                  <input name="city" maxLength={100} className={inputClass} placeholder="Cidade" />
                </label>
                <label className={labelClass}>
                  UF
                  <input name="state" maxLength={2} className={inputClass} placeholder="SP" />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  Endereço
                  <input name="address" maxLength={240} className={inputClass} placeholder="Rua, número e complemento" />
                </label>
                <label className={labelClass}>
                  Telefone
                  <input name="phone" maxLength={40} className={inputClass} placeholder="(00) 00000-0000" />
                </label>
                <label className={labelClass}>
                  Validade da ativação
                  <select name="validForHours" defaultValue="168" className={inputClass}>
                    <option value="24">24 horas</option>
                    <option value="168">7 dias</option>
                    <option value="720">30 dias</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <aside className="h-fit rounded-3xl border border-white/10 bg-slate-950/55 p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Pacote inicial</p>
            <h3 className="mt-2 text-xl font-black text-white">Experiências da Torre</h3>
            <div className="mt-5 space-y-3">
              {['Visagismo', 'Campo Visual', 'Medidas', 'Informações Úteis'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[.03] px-3 py-2.5 text-sm font-bold text-slate-200">
                  <Check className="h-4 w-4 text-emerald-300" />
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.06] p-4 text-xs leading-5 text-cyan-100/80">
              O QR vincula somente o equipamento à loja. Configuração comercial e PIN local de manutenção permanecem separados.
            </div>
            <button
              type="submit"
              disabled={isCreating}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60"
            >
              {isCreating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              Criar loja e gerar ativação
            </button>
          </aside>
        </form>
      </section>

      {message && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${message.type === 'success' ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-rose-300/25 bg-rose-300/10 text-rose-100'}`}>
          {message.text}
        </div>
      )}

      {activation && (
        <section className="rounded-3xl border border-amber-300/25 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-2xl shadow-amber-950/20 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">Ativação pronta</p>
              <h2 className="mt-2 text-2xl font-black text-white">{activation.storeName}</h2>
              <p className="mt-1 text-sm text-slate-400">{activation.tenantName} · Loja #{activation.storeId}</p>
            </div>
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100">
              Expira em {formatDate(activation.expiresAt)}
            </div>
          </div>

          <div className="mt-7 grid gap-6 lg:grid-cols-[280px_1fr]">
            <div className="rounded-3xl bg-white p-5">
              <QRCodeSVG value={activation.qrPayload} size={240} level="H" marginSize={1} className="h-auto w-full" />
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-center gap-2 text-slate-400">
                  <KeyRound className="h-4 w-4" />
                  <p className="text-xs font-black uppercase tracking-[0.14em]">Código alternativo provisório</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <code className="text-2xl font-black tracking-[0.2em] text-white">{activation.fallbackCode}</code>
                  <button type="button" onClick={() => copyValue('code', activation.fallbackCode)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5">
                    {copied === 'code' ? <Check className="mr-2 inline h-4 w-4 text-emerald-300" /> : <Copy className="mr-2 inline h-4 w-4" />}
                    {copied === 'code' ? 'Copiado' : 'Copiar código'}
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border border-violet-300/20 bg-violet-300/[.07] p-5">
                <div className="flex items-center gap-2 text-violet-100">
                  <KeyRound className="h-4 w-4" />
                  <p className="text-xs font-black uppercase tracking-[0.14em]">PIN administrativo provisório</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <code className="text-2xl font-black tracking-[0.2em] text-white">{activation.adminPin}</code>
                  <button type="button" onClick={() => copyValue('pin', activation.adminPin)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5">
                    {copied === 'pin' ? <Check className="mr-2 inline h-4 w-4 text-emerald-300" /> : <Copy className="mr-2 inline h-4 w-4" />}
                    {copied === 'pin' ? 'Copiado' : 'Copiar PIN'}
                  </button>
                </div>
                <p className="mt-3 text-xs leading-5 text-violet-100/70">
                  Entregue ao lojista para o primeiro acesso às configurações locais da Torre. Na primeira entrada, ele deverá definir um novo PIN.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Conteúdo técnico do QR</p>
                <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-500">{activation.qrPayload}</p>
                <button type="button" onClick={() => copyValue('qr', activation.qrPayload)} className="mt-3 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5">
                  {copied === 'qr' ? <Check className="mr-2 inline h-4 w-4 text-emerald-300" /> : <Copy className="mr-2 inline h-4 w-4" />}
                  {copied === 'qr' ? 'Copiado' : 'Copiar conteúdo'}
                </button>
              </div>
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[.06] p-5">
                <div className="flex items-center gap-2 text-emerald-100">
                  <MessageCircle className="h-4 w-4" />
                  <p className="text-xs font-black uppercase tracking-[0.14em]">Enviar para o lojista</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-emerald-100/70">
                  O link abre uma tela dedicada com o QR Code, pronta para ser mostrada a camera da Torre.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href={getActivationShareUrl(activation)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-emerald-300/25 px-3 py-2 text-xs font-bold text-emerald-100 transition hover:bg-emerald-300/10"
                  >
                    Abrir tela do QR
                  </a>
                  <button
                    type="button"
                    onClick={() => shareActivationViaWhatsApp(activation)}
                    className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-black text-emerald-950 transition hover:bg-emerald-300"
                  >
                    <MessageCircle className="mr-2 inline h-4 w-4" />
                    Enviar pelo WhatsApp
                  </button>
                </div>
              </div>
              <p className="text-xs leading-5 text-amber-100/70">
                Salve ou imprima agora. Por segurança, o código completo não poderá ser recuperado depois que esta tela for fechada.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Auditoria</p>
            <h2 className="mt-2 text-xl font-black text-white">Ativações recentes</h2>
          </div>
          <RefreshCw className="h-5 w-5 text-slate-600" />
        </div>

        <div className="mt-5 space-y-3">
          {!initialData.activations.length && (
            <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-slate-500">
              Nenhuma ativação foi gerada ainda.
            </div>
          )}
          {initialData.activations.map((item) => (
            <article key={item.id} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-black text-white">{item.storeName}</p>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[.1em] ${statusClasses[item.status]}`}>
                    {statusLabels[item.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.tenantName} · criada em {formatDate(item.createdAt)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" /> Expira em {formatDate(item.expiresAt)}</p>
              </div>
              {item.status === 'pending' && (
                <button
                  type="button"
                  disabled={isRevoking}
                  onClick={() => handleRevoke(item.id)}
                  className="rounded-xl border border-rose-300/20 px-3 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-300/10 disabled:opacity-50"
                >
                  <XCircle className="mr-2 inline h-4 w-4" />
                  Revogar
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
