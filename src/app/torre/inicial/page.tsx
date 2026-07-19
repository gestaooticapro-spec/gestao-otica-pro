'use client'

import {
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Keyboard,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  TowerControl,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import TowerActivationQrScanner from '@/components/tower/TowerActivationQrScanner'
import {
  normalizeTowerFallbackCode,
  TOWER_FALLBACK_CODE_PATTERN,
  type TowerActivationMethod,
  type TowerActivationValidationResponse,
} from '@/lib/tower/device-activation-contract'
import {
  normalizeTowerAssetFallbackCode,
  normalizeTowerAssetPublicCode,
  TOWER_ASSET_FALLBACK_CODE_PATTERN,
  TOWER_ASSET_PUBLIC_CODE_PATTERN,
  type TowerAssetEnrollmentMethod,
} from '@/lib/tower/asset-enrollment-contract'

type ConnectionState = 'checking' | 'online' | 'offline'
type ValidationState = 'idle' | 'validating' | 'validated' | 'error'
type PairingState = 'idle' | 'pairing' | 'paired' | 'error'

type ValidatedActivation = {
  method: TowerActivationMethod
  credential: string
}

type PairedDevice = {
  deviceId: string
  assetId: string
  publicCode: string
  storeId: number
  deviceLabel: string
  pairedAt: string
  sessionProtected: boolean
  credentialVerified: boolean
}

type AssetIdentity = {
  assetId: string
  publicCode: string
  enrolledAt: string
}

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function TowerInitialPage() {
  const [connection, setConnection] = useState<ConnectionState>('checking')
  const [activationMethod, setActivationMethod] = useState<TowerActivationMethod | null>(null)
  const [fallbackCode, setFallbackCode] = useState('')
  const [networkMessage, setNetworkMessage] = useState('')
  const [validationState, setValidationState] = useState<ValidationState>('idle')
  const [validationMessage, setValidationMessage] = useState('')
  const [activationExpiresAt, setActivationExpiresAt] = useState('')
  const [validatedActivation, setValidatedActivation] = useState<ValidatedActivation | null>(null)
  const [pairingState, setPairingState] = useState<PairingState>('idle')
  const [pairingMessage, setPairingMessage] = useState('')
  const [pairedDevice, setPairedDevice] = useState<PairedDevice | null>(null)
  const [assetIdentity, setAssetIdentity] = useState<AssetIdentity | null>(null)
  const [assetMethod, setAssetMethod] = useState<TowerAssetEnrollmentMethod | null>(null)
  const [assetPublicCode, setAssetPublicCode] = useState('')
  const [assetFallbackCode, setAssetFallbackCode] = useState('')
  const [assetEnrollmentBusy, setAssetEnrollmentBusy] = useState(false)
  const [assetEnrollmentMessage, setAssetEnrollmentMessage] = useState('')

  const checkConnection = useCallback(async () => {
    setConnection('checking')
    setNetworkMessage('')

    try {
      const desktopStatus = await window.towerDesktop?.getNetworkStatus()
      const online = desktopStatus?.online ?? navigator.onLine
      setConnection(online ? 'online' : 'offline')
    } catch {
      setConnection(navigator.onLine ? 'online' : 'offline')
    }
  }, [])

  useEffect(() => {
    void checkConnection()

    const handleOnline = () => setConnection('online')
    const handleOffline = () => setConnection('offline')
    const handleFocus = () => void checkConnection()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', handleFocus)
    }
  }, [checkConnection])

  useEffect(() => {
    let cancelled = false

    async function restoreProtectedSession() {
      const desktop = window.towerDesktop
      if (!desktop) return

      try {
        const restored = await desktop.getDeviceSessionStatus()
        if (cancelled || !restored.success || !restored.paired || !restored.session) return

        const session = restored.session
        if (cancelled) return

        setPairedDevice({
          deviceId: session.deviceId,
          assetId: session.assetId,
          publicCode: session.publicCode,
          storeId: session.storeId,
          deviceLabel: session.deviceLabel,
          pairedAt: session.pairedAt,
          sessionProtected: restored.protectedByOs,
          credentialVerified: Boolean(restored.credentialVerified),
        })
        setPairingState('paired')
        setPairingMessage(
          navigator.onLine && !restored.credentialVerified
            ? 'A credencial foi restaurada, mas o servidor ainda nao confirmou que este dispositivo continua ativo.'
            : '',
        )
      } catch {
        if (!cancelled) {
          setPairingMessage('Nao foi possivel restaurar a sessao protegida deste equipamento.')
        }
      }
    }

    void restoreProtectedSession()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function restorePhysicalIdentity() {
      if (!window.towerDesktop || pairedDevice) return
      const restored = await window.towerDesktop.getAssetIdentityStatus()
      if (!cancelled && restored.success && restored.enrolled && restored.identity) {
        setAssetIdentity(restored.identity)
      } else if (!cancelled && restored.revoked) {
        setAssetEnrollmentMessage('A identidade física foi aposentada ou revogada. Procure a administração da plataforma.')
      }
    }
    void restorePhysicalIdentity()
    return () => { cancelled = true }
  }, [pairedDevice])

  async function enrollAsset(method: TowerAssetEnrollmentMethod, credential: string) {
    setAssetEnrollmentBusy(true)
    setAssetEnrollmentMessage('')
    try {
      const desktop = window.towerDesktop
      if (!desktop) {
        setAssetEnrollmentMessage('O registro físico só pode ser concluído no aplicativo Electron da Torre.')
        return
      }
      const result = await desktop.enrollAsset({
        method,
        publicCode: assetPublicCode,
        credential,
      })
      if (!result.success || !result.identity) {
        setAssetEnrollmentMessage(result.message || 'Nao foi possivel registrar a identidade fisica.')
        return
      }
      setAssetIdentity(result.identity)
      setAssetMethod(null)
      setAssetEnrollmentMessage('Identidade fisica registrada e protegida pelo Windows.')
    } catch {
      setAssetEnrollmentMessage('Nao foi possivel registrar a identidade fisica. Verifique a internet.')
    } finally {
      setAssetEnrollmentBusy(false)
    }
  }

  async function openNetworkSettings() {
    setNetworkMessage('')

    if (!window.towerDesktop) {
      setNetworkMessage('Abra as configurações de rede do computador e conecte ao Wi-Fi.')
      return
    }

    const result = await window.towerDesktop.openNetworkSettings()
    if (!result.success) {
      setNetworkMessage(result.message || 'Não foi possível abrir as configurações de rede.')
    }
  }

  function selectActivationMethod(method: TowerActivationMethod | null) {
    setActivationMethod(method)
    setValidationState('idle')
    setValidationMessage('')
    setValidatedActivation(null)
    setPairingState('idle')
    setPairingMessage('')
  }

  async function validateActivation(method: TowerActivationMethod, credential: string) {
    setValidationState('validating')
    setValidationMessage('')

    try {
      const response = await fetch('/api/tower/device/validate-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ method, credential }),
      })
      const result = await response.json() as TowerActivationValidationResponse

      if (!result.success) {
        setValidationState('error')
        setValidationMessage(result.message)
        return
      }

      setActivationExpiresAt(result.expiresAt)
      setValidatedActivation({ method, credential })
      setValidationState('validated')
      setValidationMessage('Ativação reconhecida com segurança.')
    } catch {
      setValidationState('error')
      setValidationMessage('Não foi possível falar com o servidor. Verifique a internet e tente novamente.')
    }
  }

  function submitFallbackCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!TOWER_FALLBACK_CODE_PATTERN.test(fallbackCode)) return
    void validateActivation('code', fallbackCode)
  }

  async function pairDevice() {
    if (!validatedActivation || !assetIdentity) return

    setPairingState('pairing')
    setPairingMessage('')

    try {
      const desktop = window.towerDesktop
      if (!desktop) {
        setPairingState('error')
        setPairingMessage('O pareamento só pode ser concluído no aplicativo Electron da Torre.')
        return
      }
      const result = await desktop.pairDevice(validatedActivation)
      if (!result.success || !result.session) {
        setPairingState('error')
        setPairingMessage(result.message || 'Nao foi possivel concluir o pareamento.')
        return
      }
      const session = result.session

      setValidatedActivation(null)
      setPairedDevice({
        deviceId: session.deviceId,
        assetId: session.assetId,
        publicCode: session.publicCode,
        storeId: session.storeId,
        deviceLabel: session.deviceLabel,
        pairedAt: session.pairedAt,
        sessionProtected: Boolean(result.protectedByOs),
        credentialVerified: true,
      })
      setPairingState('paired')
      setPairingMessage(
        result.protectedByOs
          ? ''
          : result.message || 'O servidor pareou a Torre, mas a credencial nao foi protegida localmente.',
      )
    } catch {
      setPairingState('error')
      setPairingMessage('Não foi possível concluir o pareamento. Verifique a internet e tente novamente.')
    }
  }

  const isOnline = connection === 'online'
  const isFallbackCodeComplete = TOWER_FALLBACK_CODE_PATTERN.test(fallbackCode)

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_84%_85%,rgba(245,158,11,0.10),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-6 py-6 sm:px-10 sm:py-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
              <TowerControl className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Gestão Ótica</p>
              <p className="text-lg font-black text-white">Torre</p>
            </div>
          </div>

          <div className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold ${isOnline ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' : connection === 'offline' ? 'border-rose-300/20 bg-rose-300/10 text-rose-200' : 'border-white/10 bg-white/5 text-slate-300'}`}>
            {connection === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {connection === 'checking' ? 'Verificando internet' : isOnline ? 'Internet conectada' : 'Sem internet'}
          </div>
        </header>

        <section className="grid flex-1 content-center gap-8 py-7 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-12">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-amber-200">
              <ShieldCheck className="h-4 w-4" />
              {pairedDevice ? 'Equipamento vinculado' : assetIdentity ? `Torre ${assetIdentity.publicCode}` : 'Identidade de fábrica pendente'}
            </div>
            <h1 className="mt-5 text-4xl font-black leading-[1.06] tracking-tight sm:text-5xl">
              {pairedDevice ? 'Esta Torre está vinculada e protegida.' : assetIdentity ? 'Agora vamos associar esta Torre a uma loja.' : 'Vamos registrar a identidade desta Torre.'}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-400 sm:text-lg">
              {pairedDevice
                ? 'A identidade deste equipamento foi protegida pelo Windows e será restaurada automaticamente nas próximas inicializações.'
                : assetIdentity
                  ? 'A identidade física já está protegida. Use agora o QR Code da loja ou o código alternativo.'
                  : 'Na fábrica, leia o QR temporário de preparação ou informe o código da etiqueta e o código alternativo.'}
            </p>

            <div className="mt-7 rounded-3xl border border-white/10 bg-white/[0.045] p-5 backdrop-blur">
              <div className="flex items-start gap-4">
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${isOnline ? 'bg-emerald-300/15 text-emerald-200' : 'bg-slate-800 text-slate-300'}`}>
                  {isOnline ? <CheckCircle2 className="h-6 w-6" /> : <Wifi className="h-6 w-6" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-white">{isOnline ? 'Conexão pronta' : 'Conecte à internet para continuar'}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    {isOnline ? 'A Torre já pode receber os dados de ativação.' : 'Use Wi-Fi ou conecte um cabo de rede. Ethernet será reconhecida automaticamente.'}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {!isOnline && (
                      <button type="button" onClick={() => void openNetworkSettings()} className="min-h-12 rounded-xl bg-cyan-300 px-5 text-sm font-black text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
                        Conectar à internet
                      </button>
                    )}
                    <button type="button" onClick={() => void checkConnection()} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
                      <RefreshCw className="h-4 w-4" />
                      Verificar novamente
                    </button>
                  </div>
                  {networkMessage && <p className="mt-3 text-sm font-semibold text-amber-200">{networkMessage}</p>}
                </div>
              </div>
            </div>
          </div>

          <div className={`rounded-[2rem] border bg-slate-900/75 p-5 shadow-2xl shadow-black/35 backdrop-blur sm:p-7 ${isOnline ? 'border-cyan-300/20' : 'border-white/10'}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Ativação segura</p>
                <h2 className="mt-2 text-2xl font-black">{pairingState === 'paired' ? 'Dispositivo pareado' : !assetIdentity ? 'Identificar equipamento' : validationState === 'validated' ? 'Ativação reconhecida' : 'Como deseja ativar?'}</h2>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-bold text-slate-400">{pairingState === 'paired' ? 'PAIRED_SETUP' : !assetIdentity ? 'FACTORY_SETUP' : validationState === 'validated' ? 'PAIRING' : 'READY_FOR_STORE'}</span>
            </div>

            {!pairedDevice && !assetIdentity && (
              <div className="mt-6">
                {!assetMethod && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <button type="button" disabled={!isOnline} onClick={() => setAssetMethod('qr')} className="min-h-40 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-5 text-left disabled:opacity-40">
                      <QrCode className="h-8 w-8 text-cyan-300" />
                      <span className="mt-5 block text-lg font-black">Ler QR temporário do Admin</span>
                      <span className="mt-2 block text-sm leading-5 text-slate-400">Não é o QR permanente da etiqueta. Use o QR de preparação gerado em Admin &gt; Torres &gt; Equipamentos.</span>
                    </button>
                    <button type="button" disabled={!isOnline} onClick={() => setAssetMethod('code')} className="min-h-40 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5 text-left disabled:opacity-40">
                      <Keyboard className="h-8 w-8 text-amber-300" />
                      <span className="mt-5 block text-lg font-black">Informar códigos</span>
                      <span className="mt-2 block text-sm leading-5 text-slate-400">Digite o ID da etiqueta e o código temporário de preparação.</span>
                    </button>
                  </div>
                )}
                {assetMethod === 'qr' && (
                  <div>
                    <button type="button" onClick={() => setAssetMethod(null)} className="mb-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-slate-400"><ArrowLeft className="h-4 w-4" />Voltar</button>
                    <TowerActivationQrScanner onDecoded={(payload) => void enrollAsset('qr', payload)} onCancel={() => setAssetMethod(null)} />
                  </div>
                )}
                {assetMethod === 'code' && (
                  <form onSubmit={(event) => { event.preventDefault(); void enrollAsset('code', assetFallbackCode) }} className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
                    <button type="button" onClick={() => setAssetMethod(null)} className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-slate-400"><ArrowLeft className="h-4 w-4" />Voltar</button>
                    <label className="block text-xs font-black uppercase tracking-wide text-amber-200">ID impresso na Torre</label>
                    <input value={assetPublicCode} onChange={(event) => setAssetPublicCode(normalizeTowerAssetPublicCode(event.target.value))} placeholder="MBT-2026-000001" className="mt-2 min-h-14 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-center font-mono text-xl font-black" />
                    <label className="mt-4 block text-xs font-black uppercase tracking-wide text-amber-200">Código temporário</label>
                    <input value={assetFallbackCode} onChange={(event) => setAssetFallbackCode(normalizeTowerAssetFallbackCode(event.target.value))} placeholder="ABCD-EFGH" className="mt-2 min-h-14 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-center font-mono text-xl font-black tracking-widest" />
                    <button disabled={assetEnrollmentBusy || !TOWER_ASSET_PUBLIC_CODE_PATTERN.test(assetPublicCode) || !TOWER_ASSET_FALLBACK_CODE_PATTERN.test(assetFallbackCode)} className="mt-4 min-h-14 w-full rounded-xl bg-amber-300 text-sm font-black text-slate-950 disabled:opacity-40">{assetEnrollmentBusy ? 'Registrando...' : 'Registrar identidade física'}</button>
                  </form>
                )}
                {assetEnrollmentMessage && <p className="mt-4 text-center text-sm font-bold text-amber-200">{assetEnrollmentMessage}</p>}
              </div>
            )}

            {pairingState === 'paired' && pairedDevice && (
              <div className="mt-6 rounded-3xl border border-emerald-300/25 bg-emerald-300/[0.09] p-7 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-300/15 text-emerald-200">
                  <Cpu className="h-9 w-9" />
                </div>
                <p className="mt-5 font-mono text-sm font-black text-emerald-200">{pairedDevice.publicCode}</p>
                <p className="mt-2 text-xl font-black text-white">Esta Torre pertence agora à loja #{pairedDevice.storeId}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{pairedDevice.deviceLabel} foi registrado como o equipamento ativo da loja.</p>
                <div className="mt-5 grid gap-2 text-left text-xs font-bold sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-3 text-slate-300">Credencial limitada: <span className={pairedDevice.credentialVerified ? 'text-emerald-200' : 'text-amber-200'}>{pairedDevice.credentialVerified ? 'verificada' : 'verificação pendente'}</span></div>
                  <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-3 text-slate-300">Sessão local: <span className={pairedDevice.sessionProtected ? 'text-emerald-200' : 'text-amber-200'}>{pairedDevice.sessionProtected ? 'protegida pelo Windows' : 'não protegida'}</span></div>
                </div>
                {pairingMessage && <p className="mt-4 text-sm font-bold leading-6 text-amber-200">{pairingMessage}</p>}
                <p className="mt-5 text-xs font-bold text-emerald-200">Credencial persistente pronta. Próxima etapa: verificações locais e preparação para operação.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Link href="/torre/configuracao" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-cyan-300 px-5 text-sm font-black text-slate-950 transition hover:bg-cyan-200">Abrir configuração local</Link>
                  <Link href={`/torre/${pairedDevice.storeId}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-black text-white transition hover:bg-white/10">Testar experiências</Link>
                </div>
              </div>
            )}

            {assetIdentity && validationState === 'validated' && pairingState !== 'paired' && (
              <div className="mt-6 rounded-3xl border border-emerald-300/20 bg-emerald-300/[0.08] p-7 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-300/15 text-emerald-200">
                  <CheckCircle2 className="h-9 w-9" />
                </div>
                <p className="mt-5 text-xl font-black text-white">Dados de ativação confirmados</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">A Torre está pronta para ser vinculada ao equipamento no próximo passo.</p>
                {activationExpiresAt && <p className="mt-4 text-xs font-bold text-emerald-200">Ativação válida até {formatExpiry(activationExpiresAt)}</p>}
                {pairingState === 'idle' && (
                  <button type="button" onClick={() => void pairDevice()} className="mt-6 min-h-14 w-full rounded-xl bg-emerald-300 px-5 text-sm font-black text-emerald-950 transition hover:bg-emerald-200">
                    Vincular esta Torre à loja
                  </button>
                )}
                {pairingState === 'pairing' && (
                  <div className="mt-6 flex min-h-14 items-center justify-center gap-3 rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-sm font-black text-emerald-100">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Pareando dispositivo...
                  </div>
                )}
                {pairingState === 'error' && (
                  <div className="mt-5 rounded-xl border border-rose-300/20 bg-rose-300/10 p-4">
                    <p className="text-sm font-bold leading-6 text-rose-100">{pairingMessage}</p>
                    <button type="button" onClick={() => void pairDevice()} className="mt-3 min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-black text-white hover:bg-white/10">Tentar parear novamente</button>
                  </div>
                )}
              </div>
            )}

            {assetIdentity && validationState === 'validating' && (
              <div className="mt-6 grid min-h-64 place-items-center rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.06] text-center">
                <div>
                  <Loader2 className="mx-auto h-10 w-10 animate-spin text-cyan-300" />
                  <p className="mt-4 font-black text-white">Validando ativação...</p>
                  <p className="mt-2 text-sm text-slate-400">Aguarde enquanto conferimos os dados no servidor.</p>
                </div>
              </div>
            )}

            {assetIdentity && validationState === 'error' && (
              <div className="mt-6 grid min-h-64 place-items-center rounded-3xl border border-rose-300/20 bg-rose-300/[0.06] px-6 text-center">
                <div>
                  <ShieldCheck className="mx-auto h-10 w-10 text-rose-300" />
                  <p className="mt-4 font-black text-white">Não foi possível validar</p>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-300">{validationMessage}</p>
                  <button type="button" onClick={() => setValidationState('idle')} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-black text-white hover:bg-white/10">
                    <RefreshCw className="h-4 w-4" />
                    Tentar novamente
                  </button>
                </div>
              </div>
            )}

            {assetIdentity && validationState === 'idle' && !activationMethod && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <button type="button" disabled={!isOnline} onClick={() => selectActivationMethod('qr')} className="group min-h-40 rounded-2xl border border-white/10 bg-white/[0.045] p-5 text-left transition enabled:hover:border-cyan-300/35 enabled:hover:bg-cyan-300/[0.07] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50">
                  <QrCode className="h-8 w-8 text-cyan-300" />
                  <span className="mt-5 block text-lg font-black">Ler QR Code</span>
                  <span className="mt-2 block text-sm leading-5 text-slate-400">Use a câmera da Torre para ler a ativação mostrada no celular ou computador.</span>
                </button>

                <button type="button" disabled={!isOnline} onClick={() => selectActivationMethod('code')} className="group min-h-40 rounded-2xl border border-white/10 bg-white/[0.045] p-5 text-left transition enabled:hover:border-amber-300/35 enabled:hover:bg-amber-300/[0.07] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50">
                  <Keyboard className="h-8 w-8 text-amber-300" />
                  <span className="mt-5 block text-lg font-black">Não consigo ler o QR Code</span>
                  <span className="mt-2 block text-sm leading-5 text-slate-400">Informe manualmente o código alternativo de oito caracteres.</span>
                </button>
              </div>
            )}

            {assetIdentity && validationState === 'idle' && activationMethod === 'qr' && (
              <div className="mt-5">
                <button type="button" onClick={() => selectActivationMethod(null)} className="mb-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-slate-400 hover:text-white">
                  <ArrowLeft className="h-4 w-4" />
                  Escolher outro método
                </button>
                <TowerActivationQrScanner
                  onDecoded={(payload) => void validateActivation('qr', payload)}
                  onCancel={() => selectActivationMethod(null)}
                />
              </div>
            )}

            {assetIdentity && validationState === 'idle' && activationMethod === 'code' && (
              <form onSubmit={submitFallbackCode} className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
                <button type="button" onClick={() => selectActivationMethod(null)} className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-slate-400 hover:text-white">
                  <ArrowLeft className="h-4 w-4" />
                  Escolher outro método
                </button>
                <label htmlFor="tower-fallback-code" className="block text-xs font-black uppercase tracking-[0.14em] text-amber-200">Código alternativo</label>
                <input id="tower-fallback-code" value={fallbackCode} onChange={(event) => setFallbackCode(normalizeTowerFallbackCode(event.target.value))} inputMode="text" autoComplete="off" spellCheck={false} autoFocus placeholder="ABCD-EFGH" className="mt-3 min-h-16 w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 text-center font-mono text-2xl font-black uppercase tracking-[0.2em] text-white outline-none placeholder:text-slate-700 focus:border-amber-300/50" />
                <button type="submit" disabled={!isFallbackCodeComplete || !isOnline} className="mt-4 min-h-14 w-full rounded-xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition enabled:hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40">
                  Validar código
                </button>
                <p className="mt-3 text-center text-xs font-semibold text-slate-400">Use o código no formato ABCD-EFGH recebido na configuração da loja.</p>
              </form>
            )}

            {!isOnline && connection !== 'checking' && validationState === 'idle' && (
              <p className="mt-5 text-center text-sm font-semibold text-slate-500">As opções de ativação serão liberadas quando a internet estiver conectada.</p>
            )}
          </div>
        </section>

        <footer className="flex items-center justify-center gap-2 text-center text-xs font-semibold text-slate-600">
          <ShieldCheck className="h-4 w-4" />
          {pairedDevice ? `${pairedDevice.publicCode} · dispositivo ${pairedDevice.deviceId.slice(0, 8)} pareado; credencial protegida pelo sistema operacional.` : assetIdentity ? `${assetIdentity.publicCode} identificada; nenhuma loja vinculada.` : 'Nenhuma identidade física ou loja está vinculada a este equipamento.'}
        </footer>
      </div>
    </main>
  )
}
