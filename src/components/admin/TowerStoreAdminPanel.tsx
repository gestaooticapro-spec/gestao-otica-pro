'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, KeyRound, Loader2, Mail, MessageCircle, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import {
  grantTowerStoreFullAccess,
  issueTowerAdminPinRecovery,
  reissueTowerActivation,
  updateTowerStoreDetails,
  type TowerActivationCredential,
  type TowerPinRecoveryCredential,
  type TowerStoreAdminData,
} from '@/lib/actions/tower-admin.actions'

type Props = { initialData: TowerStoreAdminData }

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export default function TowerStoreAdminPanel({ initialData }: Props) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const [activation, setActivation] = useState<TowerActivationCredential | null>(null)
  const [pinRecovery, setPinRecovery] = useState<TowerPinRecoveryCredential | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()
  const [reissuing, startReissuing] = useTransition()
  const [recoveringPin, startRecoveringPin] = useTransition()
  const [grantingFullAccess, startGrantingFullAccess] = useTransition()

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    window.setTimeout(() => setCopied(null), 1800)
  }

  const shareUrl = (credential: TowerActivationCredential) => {
    const url = new URL('/torre/ativacao', window.location.origin)
    url.searchParams.set('token', credential.qrPayload.replace(/^MBTOWER:1:/, ''))
    url.searchParams.set('code', credential.fallbackCode)
    url.searchParams.set('pin', credential.adminPin)
    return url.toString()
  }

  const shareWhatsApp = (credential: TowerActivationCredential) => {
    const text = `A instalacao da Torre da loja ${credential.storeName} esta pronta. Abra este link e mostre o QR Code para a Torre:\n\n${shareUrl(credential)}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  const saveStore = (formData: FormData) => {
    startSaving(async () => {
      const result = await updateTowerStoreDetails({
        storeId: initialData.store.id,
        name: String(formData.get('name') || ''),
        city: String(formData.get('city') || ''),
        state: String(formData.get('state') || ''),
        address: String(formData.get('address') || ''),
        phone: String(formData.get('phone') || ''),
      })
      setMessage(result.message)
      if (result.success) router.refresh()
    })
  }

  const reissue = (formData: FormData) => {
    startReissuing(async () => {
      const result = await reissueTowerActivation({ storeId: initialData.store.id, validForHours: Number(formData.get('validForHours') || 168) })
      setMessage(result.message)
      if (result.success && result.activation) setActivation(result.activation)
      if (result.success) router.refresh()
    })
  }

  const recoverPin = (formData: FormData) => {
    startRecoveringPin(async () => {
      const result = await issueTowerAdminPinRecovery({
        storeId: initialData.store.id,
        validForHours: Number(formData.get('validForHours') || 24),
      })
      setMessage(result.message)
      if (result.success && result.pinRecovery) setPinRecovery(result.pinRecovery)
    })
  }

  const grantFullAccess = (formData: FormData) => {
    startGrantingFullAccess(async () => {
      const result = await grantTowerStoreFullAccess({
        storeId: initialData.store.id,
        adminName: String(formData.get('adminName') || ''),
        adminEmail: String(formData.get('adminEmail') || ''),
      })
      setMessage(result.message)
      if (result.success) router.refresh()
    })
  }

  return <div className="space-y-7">
    {message && <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">{message}</div>}

    <section className="rounded-3xl border border-white/10 bg-slate-900/75 p-6 sm:p-8">
      <p className="text-xs font-black uppercase tracking-[.16em] text-amber-300">{initialData.store.tenantName}</p>
      <h2 className="mt-2 text-2xl font-black text-white">{initialData.store.name}</h2>
      <p className="mt-2 text-sm text-slate-400">Loja #{initialData.store.id} · credenciais e configuracoes da instalacao.</p>
      <form action={saveStore} className="mt-7 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold uppercase tracking-[.12em] text-slate-400 sm:col-span-2">Nome da loja<input name="name" defaultValue={initialData.store.name} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white" /></label>
        <label className="text-xs font-bold uppercase tracking-[.12em] text-slate-400">Cidade<input name="city" defaultValue={initialData.store.city || ''} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white" /></label>
        <label className="text-xs font-bold uppercase tracking-[.12em] text-slate-400">UF<input name="state" defaultValue={initialData.store.state || ''} maxLength={2} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white" /></label>
        <label className="text-xs font-bold uppercase tracking-[.12em] text-slate-400 sm:col-span-2">Endereco<input name="address" defaultValue={initialData.store.address || ''} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white" /></label>
        <label className="text-xs font-bold uppercase tracking-[.12em] text-slate-400">Telefone<input name="phone" defaultValue={initialData.store.phone || ''} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white" /></label>
        <div className="flex items-end"><button disabled={saving} className="h-11 w-full rounded-xl border border-white/10 px-4 text-sm font-black text-white hover:bg-white/5 disabled:opacity-50">{saving ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : <><Save className="mr-2 inline h-4 w-4" />Salvar alteracoes</>}</button></div>
      </form>
    </section>

    <section className="rounded-3xl border border-emerald-300/15 bg-emerald-300/[.05] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-emerald-200">Gestao Otica</p>
          <h2 className="mt-2 text-xl font-black text-white">Liberar acesso completo</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/70">A Torre continua usando a credencial do dispositivo. Esta liberacao convida o responsavel humano para definir senha e acessar o dashboard desta loja.</p>
        </div>
        {initialData.fullAccess && <div className="rounded-xl border border-emerald-300/20 bg-slate-950/40 px-4 py-3 text-sm"><p className="font-black text-emerald-200">{initialData.fullAccess.status === 'active' ? 'Acesso liberado' : 'Convite em preparacao'}</p><p className="mt-1 text-slate-300">{initialData.fullAccess.adminName} · {initialData.fullAccess.adminEmail}</p><p className="mt-1 text-xs text-slate-500">{initialData.fullAccess.status === 'active' ? `Convite enviado em ${formatDate(initialData.fullAccess.invitationSentAt || initialData.fullAccess.grantedAt)}` : `Iniciado em ${formatDate(initialData.fullAccess.grantedAt)}`}</p></div>}
      </div>
      {!initialData.fullAccess && <form action={grantFullAccess} className="mt-7 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold uppercase tracking-[.12em] text-emerald-100">Nome do responsavel<input name="adminName" autoComplete="name" className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white" /></label>
        <label className="text-xs font-bold uppercase tracking-[.12em] text-emerald-100">E-mail de acesso<input name="adminEmail" type="email" autoComplete="email" className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white" /></label>
        <div className="sm:col-span-2"><button disabled={grantingFullAccess} className="h-11 rounded-xl bg-emerald-300 px-4 text-sm font-black text-emerald-950 hover:bg-emerald-200 disabled:opacity-50">{grantingFullAccess ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Mail className="mr-2 inline h-4 w-4" />Liberar Gestao Otica e enviar convite</>}</button></div>
      </form>}
      {initialData.fullAccess && <p className="mt-6 flex items-center gap-2 text-xs font-bold text-emerald-100/75"><KeyRound className="h-4 w-4" />O responsavel define a propria senha pelo convite; ela nao e exibida nem armazenada aqui.</p>}
    </section>

    <section className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[.05] p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-200">Recuperacao da instalacao</p><h2 className="mt-2 text-xl font-black text-white">Reemitir QR, codigo e PIN</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-cyan-100/70">Use quando a Torre for formatada, substituida ou as credenciais de instalacao forem perdidas. A nova emissao revoga ativacoes pendentes anteriores e gera um novo PIN provisório.</p></div><form action={reissue} className="flex flex-wrap items-end gap-3"><label className="text-xs font-bold text-cyan-100">Validade<select name="validForHours" defaultValue="168" className="ml-2 rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-sm text-white"><option value="24">24 h</option><option value="168">7 dias</option><option value="720">30 dias</option></select></label><button disabled={reissuing} className="h-10 rounded-xl bg-cyan-300 px-4 text-xs font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50">{reissuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="mr-2 inline h-4 w-4" />Reemitir</>}</button></form></div></section>

    {activation && <section className="rounded-3xl border border-amber-300/25 bg-slate-900 p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-amber-300">Nova instalacao pronta</p><h2 className="mt-2 text-xl font-black text-white">{activation.storeName}</h2></div><span className="text-xs font-bold text-amber-100">Expira em {formatDate(activation.expiresAt)}</span></div><div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]"><div className="rounded-3xl bg-white p-4"><QRCodeSVG value={activation.qrPayload} size={240} level="H" marginSize={1} className="h-auto w-full" /></div><div className="space-y-3"><Credential label="Codigo alternativo" value={activation.fallbackCode} copied={copied === 'code'} onCopy={() => copy('code', activation.fallbackCode)} /><Credential label="PIN administrativo provisório" value={activation.adminPin} copied={copied === 'pin'} onCopy={() => copy('pin', activation.adminPin)} /><div className="flex flex-wrap gap-3"><a href={shareUrl(activation)} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white">Abrir tela do QR</a><button type="button" onClick={() => shareWhatsApp(activation)} className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-black text-emerald-950"><MessageCircle className="mr-2 inline h-4 w-4" />Enviar pelo WhatsApp</button></div></div></div></section>}

    <section className="rounded-3xl border border-violet-300/15 bg-violet-300/[.05] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-violet-200">Acesso administrativo local</p>
          <h2 className="mt-2 text-xl font-black text-white">Recuperar PIN da Torre</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100/70">
            Use quando o PIN local foi esquecido. Este codigo nao reinstala nem
            desvincula a Torre e nao apaga clientes, sessoes ou configuracoes.
          </p>
        </div>
        <form action={recoverPin} className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-bold text-violet-100">
            Validade
            <select name="validForHours" defaultValue="24" className="ml-2 rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-sm text-white">
              <option value="24">24 h</option>
              <option value="168">7 dias</option>
              <option value="720">30 dias</option>
            </select>
          </label>
          <button disabled={recoveringPin} className="h-10 rounded-xl bg-violet-300 px-4 text-xs font-black text-violet-950 hover:bg-violet-200 disabled:opacity-50">
            {recoveringPin
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><KeyRound className="mr-2 inline h-4 w-4" />Gerar recuperacao</>}
          </button>
        </form>
      </div>
    </section>

    {pinRecovery && (
      <section className="rounded-3xl border border-violet-300/25 bg-slate-900 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-violet-300">Recuperacao de uso unico</p>
            <h2 className="mt-2 text-xl font-black text-white">{pinRecovery.storeName}</h2>
          </div>
          <span className="text-xs font-bold text-violet-100">Expira em {formatDate(pinRecovery.expiresAt)}</span>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
          <div className="rounded-3xl bg-white p-4">
            <QRCodeSVG value={pinRecovery.qrPayload} size={240} level="H" marginSize={1} className="h-auto w-full" />
          </div>
          <div className="space-y-3">
            <Credential
              label="Codigo alternativo de recuperacao"
              value={pinRecovery.fallbackCode}
              copied={copied === 'pin-recovery'}
              onCopy={() => copy('pin-recovery', pinRecovery.fallbackCode)}
            />
            <p className="rounded-xl border border-violet-300/15 bg-violet-300/[.06] p-4 text-sm leading-6 text-violet-100">
              Na Torre, escolha <strong>Esqueci o PIN</strong>, leia este QR ou
              informe o codigo e cadastre o novo PIN. O codigo deixa de funcionar
              imediatamente apos a recuperacao.
            </p>
          </div>
        </div>
      </section>
    )}

    <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 sm:p-8"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-slate-400" /><h2 className="text-xl font-black text-white">Historico de ativacoes</h2></div><div className="mt-5 space-y-3">{!initialData.activations.length && <p className="text-sm text-slate-500">Nenhuma ativacao registrada.</p>}{initialData.activations.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm"><span className="font-bold text-white">{item.status === 'pending' ? 'Aguardando leitura' : item.status === 'consumed' ? 'Torre ativada' : item.status === 'revoked' ? 'Revogada' : 'Expirada'}</span><span className="text-slate-500">Criada em {formatDate(item.createdAt)}</span></div>)}</div></section>
  </div>
}

function Credential({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy(): void }) {
  return <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4"><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{label}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><code className="text-xl font-black tracking-[.16em] text-white">{value}</code><button type="button" onClick={onCopy} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white">{copied ? <Check className="mr-1 inline h-4 w-4 text-emerald-300" /> : <Copy className="mr-1 inline h-4 w-4" />}{copied ? 'Copiado' : 'Copiar'}</button></div></div>
}
