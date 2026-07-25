'use client'

import {
  ArrowLeft,
  Camera,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Wifi,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { FormEvent, useEffect, useRef, useState } from 'react'
import TowerCommercialAccessPanel from '@/components/tower/TowerCommercialAccessPanel'

type DeviceSession = {
  deviceId: string
  assetId: string
  publicCode: string
  tenantId: string
  storeId: number
  deviceLabel: string
  pairedAt: string
}

type HardwareDiagnostics = Awaited<ReturnType<NonNullable<Window['towerDesktop']>['getHardwareDiagnostics']>>
type TestState = 'pending' | 'running' | 'passed' | 'failed'

type PinStatus = {
  mustChange: boolean
  failedAttempts: number
  lockedUntil: string | null
}

function approvedAt(timestamp: string | null | undefined) {
  return timestamp ? `Aprovado em ${new Date(timestamp).toLocaleString('pt-BR')}.` : null
}

function StatusBadge({ state }: { state: TestState }) {
  const styles = {
    pending: 'border-amber-300/20 bg-amber-300/10 text-amber-200',
    running: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-200',
    passed: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200',
    failed: 'border-rose-300/20 bg-rose-300/10 text-rose-200',
  }
  const labels = { pending: 'Pendente', running: 'Testando', passed: 'Aprovado', failed: 'Reprovado' }

  return <span className={`rounded-full border px-3 py-1 text-xs font-black ${styles[state]}`}>{labels[state]}</span>
}

export default function TowerSetupPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<DeviceSession | null>(null)
  const [diagnostics, setDiagnostics] = useState<HardwareDiagnostics | null>(null)
  const [cameraState, setCameraState] = useState<TestState>('pending')
  const [cameraMessage, setCameraMessage] = useState('Teste ainda não executado neste equipamento.')
  const [touchConfirmed, setTouchConfirmed] = useState(false)
  const [touchMessage, setTouchMessage] = useState('Toque no botão usando a tela touch do equipamento.')
  const [displayState, setDisplayState] = useState<TestState>('pending')
  const [displayMessage, setDisplayMessage] = useState('A segunda tela ainda não foi confirmada visualmente.')
  const [pinStatus, setPinStatus] = useState<PinStatus | null>(null)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinMessage, setPinMessage] = useState('')
  const [maintenanceUnlocked, setMaintenanceUnlocked] = useState(false)
  const [showPinChange, setShowPinChange] = useState(false)

  async function loadPinStatus() {
    try {
      const result = await window.towerDesktop?.getAdminPinStatus()
      if (!result) return
      if (result.success) {
        const mustChange = Boolean(result.mustChange)
        setPinStatus({
          mustChange,
          failedAttempts: Number(result.failedAttempts) || 0,
          lockedUntil: typeof result.lockedUntil === 'string' ? result.lockedUntil : null,
        })
        setShowPinChange(mustChange)
      } else {
        setPinMessage(result.message || 'Não foi possível consultar o estado do PIN.')
      }
    } catch {
      setPinMessage('Sem comunicação com o servidor para consultar o PIN.')
    }
  }

  async function refreshHardware() {
    if (!window.towerDesktop) return
    const result = await window.towerDesktop.getHardwareDiagnostics()
    setDiagnostics(result)
    if (result.displays.length < 2) {
      setDisplayState('pending')
      setDisplayMessage('Somente uma tela foi detectada. O teste real continua pendente.')
    }
  }

  async function loadHardwareApprovals() {
    try {
      const result = await window.towerDesktop?.getHardwareApprovalStatus()
      if (!result?.success || !result.data) return
      const approval = result.data
      if (approval.cameraApprovedAt) {
        setCameraState('passed')
        setCameraMessage(approvedAt(approval.cameraApprovedAt) || '')
      }
      if (approval.touchApprovedAt) {
        setTouchConfirmed(true)
        setTouchMessage(approvedAt(approval.touchApprovedAt) || '')
      }
      if (approval.displayApprovedAt) {
        setDisplayState('passed')
        setDisplayMessage(approvedAt(approval.displayApprovedAt) || '')
      }
    } catch {
      // A tela continua utilizavel sem a leitura do historico local.
    }
  }

  async function persistHardwareApproval(test: 'camera' | 'touch' | 'display') {
    const result = await window.towerDesktop?.approveHardwareTest({ test })
    if (!result?.success || !result.data) {
      throw new Error(result?.message || 'Nao foi possivel registrar a aprovacao.')
    }
    return result.data
  }

  useEffect(() => {
    let cancelled = false

    async function initialize() {
      const desktop = window.towerDesktop
      if (!desktop) {
        setLoading(false)
        return
      }

      const restored = await desktop.getDeviceSessionSummary()
      if (cancelled) return
      if (!restored.success || !restored.paired || !restored.session) {
        setLoading(false)
        return
      }

      setSession(restored.session)
      await Promise.all([refreshHardware(), loadPinStatus()])
      await loadHardwareApprovals()
      if (!cancelled) setLoading(false)
    }

    void initialize()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function testCamera() {
    setCameraState('running')
    setCameraMessage('Solicitando acesso à câmera...')
    streamRef.current?.getTracks().forEach((track) => track.stop())

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      const [track] = stream.getVideoTracks()
      const settings = track?.getSettings()
      setCameraState('running')
      setCameraMessage(
        settings?.width && settings?.height
          ? `Imagem recebida em ${settings.width} × ${settings.height}. Falta confirmar visualmente foco e enquadramento.`
          : 'Imagem recebida. Falta confirmar visualmente foco e enquadramento.',
      )
    } catch {
      setCameraState('failed')
      setCameraMessage('A câmera não abriu. Verifique conexão, permissão e driver no equipamento real.')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  function logoutMaintenance() {
    stopCamera()
    void window.towerDesktop?.closeCustomerDisplayTest()
    setMaintenanceUnlocked(false)
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
    setPinMessage('')
  }

  async function confirmCameraImage() {
    if (!streamRef.current) return
    try {
      const approval = await persistHardwareApproval('camera')
      setCameraState('passed')
      setCameraMessage(approvedAt(approval.cameraApprovedAt) || 'Imagem confirmada neste equipamento.')
    } catch (error) {
      setCameraState('failed')
      setCameraMessage(error instanceof Error ? error.message : 'Nao foi possivel salvar a aprovacao da camera.')
    }
  }

  async function confirmTouch(pointerType: string) {
    if (pointerType !== 'touch') {
      setTouchMessage('Foi detectado mouse ou trackpad. Use o dedo na tela touch.')
      return
    }
    try {
      const approval = await persistHardwareApproval('touch')
      setTouchConfirmed(true)
      setTouchMessage(approvedAt(approval.touchApprovedAt) || 'Toque real confirmado neste equipamento.')
    } catch (error) {
      setTouchMessage(error instanceof Error ? error.message : 'Nao foi possivel salvar a aprovacao do touch.')
    }
  }

  async function confirmDisplay() {
    try {
      const approval = await persistHardwareApproval('display')
      setDisplayState('passed')
      setDisplayMessage(approvedAt(approval.displayApprovedAt) || 'Tela do cliente confirmada neste equipamento.')
    } catch (error) {
      setDisplayState('failed')
      setDisplayMessage(error instanceof Error ? error.message : 'Nao foi possivel salvar a aprovacao da tela.')
    }
  }

  async function openCustomerDisplayTest() {
    const desktop = window.towerDesktop
    if (!desktop) return
    setDisplayState('running')
    const result = await desktop.openCustomerDisplayTest()
    if (!result.success) {
      setDisplayState('pending')
      setDisplayMessage(result.message || 'Não foi possível abrir a tela do cliente.')
      return
    }

    const portrait = result.display?.orientation === 'portrait'
    setDisplayState(portrait ? 'running' : 'failed')
    setDisplayMessage(
      portrait
        ? 'Janela aberta na segunda tela em orientação retrato. Falta a confirmação visual no monitor do cliente.'
        : 'A segunda tela foi detectada em paisagem. Ajuste a orientação do Windows para retrato.',
    )
    await refreshHardware()
  }

  async function submitPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || currentPin.length !== 6) return
    const changing = Boolean(pinStatus?.mustChange || showPinChange)

    if (changing && (newPin.length !== 6 || newPin !== confirmPin || newPin === currentPin)) {
      setPinMessage('O novo PIN deve ter seis dígitos, ser diferente e coincidir com a confirmação.')
      return
    }

    setPinBusy(true)
    setPinMessage('')
    try {
      const result = await window.towerDesktop?.submitAdminPin({
        action: changing ? 'change' : 'verify',
        currentPin,
        ...(changing ? { newPin } : {}),
      })
      if (!result) throw new Error('Electron indisponivel')
      setPinMessage(result.message || (result.success ? 'PIN confirmado.' : 'Não foi possível confirmar o PIN.'))
      if (result.success) {
        setMaintenanceUnlocked(true)
        setPinStatus({ mustChange: Boolean(result.mustChange), failedAttempts: 0, lockedUntil: null })
        setCurrentPin('')
        setNewPin('')
        setConfirmPin('')
        setShowPinChange(false)
      } else if (typeof result.failedAttempts === 'number') {
        setPinStatus((current) => ({
          mustChange: current?.mustChange ?? true,
          failedAttempts: result.failedAttempts ?? 0,
          lockedUntil: result.lockedUntil || null,
        }))
      }
    } catch {
      setPinMessage('Sem comunicação com o servidor para validar o PIN.')
    } finally {
      setPinBusy(false)
    }
  }

  if (loading) {
    return <main className="grid min-h-[100dvh] place-items-center bg-slate-950 text-white"><Loader2 className="h-10 w-10 animate-spin text-cyan-300" /></main>
  }

  if (!session) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-slate-950 px-6 text-white">
        <section className="max-w-md rounded-3xl border border-amber-300/20 bg-slate-900 p-8 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-amber-300" />
          <h1 className="mt-5 text-2xl font-black">Torre ainda não pareada</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">A configuração local só é liberada depois que a identidade protegida do dispositivo estiver disponível.</p>
          <Link href="/torre/inicial" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-cyan-300 px-5 font-black text-slate-950">Voltar à ativação</Link>
        </section>
      </main>
    )
  }

  if (!maintenanceUnlocked) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-slate-950 px-5 py-8 text-white">
        <section className="w-full max-w-2xl rounded-3xl border border-violet-300/20 bg-slate-900 p-7 shadow-2xl shadow-black/30">
          <Link href="/torre/inicial" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Voltar</Link>
          <div className="mt-6 flex items-center gap-3 text-violet-200"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-300/10"><KeyRound className="h-6 w-6" /></div><div><p className="text-xs font-black uppercase tracking-[0.14em]">Manutenção protegida</p><h1 className="mt-1 text-2xl font-black text-white">{pinStatus?.mustChange ? 'Troque o PIN provisório' : 'Informe o PIN administrativo'}</h1></div></div>
          <p className="mt-5 text-sm leading-6 text-slate-400">Câmera, telas, rede, calibração e demais controles locais ficam bloqueados até a confirmação do PIN. O acesso será fechado novamente ao sair do aplicativo.</p>
          <form onSubmit={submitPin} className={`mt-7 grid gap-4 ${showPinChange ? 'md:grid-cols-3' : 'max-w-sm'}`}>
            <label className="text-xs font-black uppercase tracking-wide text-slate-400">PIN atual<input value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 6))} type="password" inputMode="numeric" autoComplete="off" autoFocus className="mt-2 min-h-14 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-center text-xl tracking-[0.3em] text-white outline-none focus:border-violet-300/50" /></label>
            {showPinChange && <>
              <label className="text-xs font-black uppercase tracking-wide text-slate-400">Novo PIN<input value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 6))} type="password" inputMode="numeric" autoComplete="new-password" className="mt-2 min-h-14 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-center text-xl tracking-[0.3em] text-white outline-none focus:border-violet-300/50" /></label>
              <label className="text-xs font-black uppercase tracking-wide text-slate-400">Confirmar novo PIN<input value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 6))} type="password" inputMode="numeric" autoComplete="new-password" className="mt-2 min-h-14 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-center text-xl tracking-[0.3em] text-white outline-none focus:border-violet-300/50" /></label>
            </>}
            <div className={showPinChange ? 'md:col-span-3' : 'flex flex-wrap gap-2'}>
              <button type="submit" disabled={pinBusy || currentPin.length !== 6} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-violet-300 px-5 text-sm font-black text-violet-950 disabled:opacity-40">{pinBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{showPinChange ? 'Trocar PIN e entrar' : 'Entrar na manutenção'}</button>
              {!showPinChange && !pinStatus?.mustChange && <button type="button" onClick={() => { setShowPinChange(true); setPinMessage('') }} className="inline-flex min-h-12 items-center rounded-xl border border-violet-300/30 bg-violet-300/10 px-4 text-sm font-black text-violet-100 transition hover:bg-violet-300/20">Trocar PIN</button>}
              {pinMessage && <p className="mt-4 basis-full text-sm font-bold text-amber-200">{pinMessage}</p>}{pinStatus?.lockedUntil && <p className="mt-2 basis-full text-xs text-rose-200">Bloqueado até {new Date(pinStatus.lockedUntil).toLocaleString('pt-BR')}.</p>}
            </div>
          </form>
          <p className="mt-6 text-xs leading-5 text-slate-500">Depois de cinco tentativas incorretas, o acesso fica bloqueado por quinze minutos.</p>
        </section>
      </main>
    )
  }

  const touchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints
  const networkState: TestState = diagnostics?.online ? 'passed' : 'failed'
  const touchState: TestState = touchConfirmed ? 'passed' : 'pending'
  const secondDisplay = diagnostics?.displays.find((display) => !display.primary)

  return (
    <main className="min-h-[100dvh] bg-slate-950 px-5 py-6 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/torre/inicial" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Voltar</Link>
            <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-cyan-300">PAIRED_SETUP · Loja #{session.storeId}</p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Preparação e manutenção da Torre</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Execute os diagnósticos no equipamento real. O sistema não marca câmera, touch ou segunda tela como aprovados sem evidência local.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/torre/${session.storeId}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-black text-slate-950 hover:bg-cyan-200"><PlayCircle className="h-4 w-4" />Testar experiências</Link>
            <button type="button" onClick={() => void refreshHardware()} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-black hover:bg-white/10"><RefreshCw className="h-4 w-4" />Atualizar hardware</button>
            <button type="button" onClick={logoutMaintenance} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 text-sm font-black text-rose-100 hover:bg-rose-300/20"><LogOut className="h-4 w-4" />Encerrar acesso</button>
          </div>
        </header>

        <TowerCommercialAccessPanel />

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><div className="flex items-center justify-between"><Wifi className="h-6 w-6 text-cyan-300" /><StatusBadge state={networkState} /></div><h2 className="mt-4 font-black">Rede</h2><p className="mt-2 text-sm text-slate-400">{diagnostics?.online ? 'Conexão detectada pelo Electron.' : 'Sem conexão detectada.'}</p></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><div className="flex items-center justify-between"><Smartphone className="h-6 w-6 text-violet-300" /><StatusBadge state={touchState} /></div><h2 className="mt-4 font-black">Tela touch</h2><p className="mt-2 text-sm text-slate-400">{touchPoints > 0 ? `${touchPoints} ponto(s) suportado(s). ${touchMessage}` : 'Nenhum touch anunciado neste computador; teste físico pendente.'}</p><button type="button" onPointerDown={(event) => { void confirmTouch(event.pointerType) }} className="mt-4 min-h-11 w-full rounded-xl border border-violet-300/20 bg-violet-300/10 px-3 text-xs font-black text-violet-100">Toque aqui com o dedo</button></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><div className="flex items-center justify-between"><Monitor className="h-6 w-6 text-amber-300" /><StatusBadge state={displayState} /></div><h2 className="mt-4 font-black">Duas telas</h2><p className="mt-2 text-sm text-slate-400">{diagnostics ? `${diagnostics.displays.length} monitor(es) detectado(s).` : 'Aguardando leitura.'}</p></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><div className="flex items-center justify-between"><ShieldCheck className="h-6 w-6 text-emerald-300" /><StatusBadge state="passed" /></div><h2 className="mt-4 font-black">Identidade local</h2><p className="mt-2 text-sm text-slate-400">Credencial protegida pelo sistema operacional.</p></article>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-slate-900/75 p-6">
            <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-300">Câmera e captura</p><h2 className="mt-2 text-xl font-black">Teste de imagem</h2></div><StatusBadge state={cameraState} /></div>
            <div className="mt-5 aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black"><video ref={videoRef} muted playsInline className="h-full w-full object-cover" /></div>
            <p className="mt-4 min-h-10 text-sm leading-6 text-slate-400">{cameraMessage}</p>
            <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void testCamera()} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-cyan-300 px-5 text-sm font-black text-slate-950"><Camera className="h-4 w-4" />Testar câmera</button><button type="button" disabled={!streamRef.current} onClick={() => void confirmCameraImage()} className="min-h-12 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 text-sm font-black text-emerald-100 disabled:opacity-35">Confirmar imagem correta</button><button type="button" onClick={stopCamera} className="min-h-12 rounded-xl border border-white/10 px-4 text-sm font-black">Parar imagem</button></div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/75 p-6">
            <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-amber-300">Tela do cliente</p><h2 className="mt-2 text-xl font-black">Orientação retrato</h2></div><StatusBadge state={displayState} /></div>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-slate-300">
              {secondDisplay ? <><p className="font-black text-white">{secondDisplay.label}</p><p className="mt-2">{secondDisplay.bounds.width} × {secondDisplay.bounds.height} · escala {secondDisplay.scaleFactor} · {secondDisplay.orientation === 'portrait' ? 'retrato' : 'paisagem'}</p></> : <p>Nenhuma segunda tela conectada neste computador.</p>}
            </div>
            <p className="mt-4 min-h-10 text-sm leading-6 text-slate-400">{displayMessage}</p>
            <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void openCustomerDisplayTest()} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-amber-300 px-5 text-sm font-black text-slate-950"><Monitor className="h-4 w-4" />Abrir teste na segunda tela</button><button type="button" disabled={displayState !== 'running'} onClick={() => void confirmDisplay()} className="min-h-12 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 text-sm font-black text-emerald-100 disabled:opacity-35">Confirmar tela correta</button><button type="button" onClick={() => void window.towerDesktop?.closeCustomerDisplayTest()} className="min-h-12 rounded-xl border border-white/10 px-4 text-sm font-black">Fechar teste</button></div>
          </article>
        </section>

        <section className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5 text-sm leading-6 text-amber-100"><div className="flex items-start gap-3"><XCircle className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>Homologação ainda pendente:</strong> brilho, calibração dimensional, câmera real, toque, reinicialização e comportamento das duas telas precisam ser confirmados presencialmente antes do estado READY. O botão “Testar experiências” libera somente a validação de software em PAIRED_SETUP.</p></div></section>
      </div>
    </main>
  )
}
