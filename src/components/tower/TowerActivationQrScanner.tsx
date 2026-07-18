'use client'

import { Camera, Loader2, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'

type Props = {
  onDecoded: (payload: string) => void
  onCancel: () => void
}

type ScannerState = 'starting' | 'scanning' | 'error'

export default function TowerActivationQrScanner({ onDecoded, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onDecodedRef = useRef(onDecoded)
  const controlsRef = useRef<IScannerControls | null>(null)
  const decodedRef = useRef(false)
  const [scannerState, setScannerState] = useState<ScannerState>('starting')
  const [scannerError, setScannerError] = useState('')
  const [restartKey, setRestartKey] = useState(0)

  useEffect(() => {
    onDecodedRef.current = onDecoded
  }, [onDecoded])

  useEffect(() => {
    let disposed = false
    decodedRef.current = false
    setScannerState('starting')
    setScannerError('')

    async function startScanner() {
      try {
        const { BrowserCodeReader, BrowserQRCodeReader } = await import('@zxing/browser')
        const devices = await BrowserCodeReader.listVideoInputDevices()
        if (disposed) return

        if (!devices.length) {
          setScannerState('error')
          setScannerError('Nenhuma camera foi encontrada neste equipamento.')
          return
        }

        const preferredDevice = devices.find((device) =>
          /back|rear|environment|traseira/i.test(device.label),
        ) || devices[0]

        const reader = new BrowserQRCodeReader()
        const controls = await reader.decodeFromVideoDevice(
          preferredDevice.deviceId,
          videoRef.current || undefined,
          (result) => {
            if (!result || decodedRef.current || disposed) return

            decodedRef.current = true
            controlsRef.current?.stop()
            onDecodedRef.current(result.getText())
          },
        )

        if (disposed) {
          controls.stop()
          return
        }

        controlsRef.current = controls
        setScannerState('scanning')
      } catch (error) {
        if (disposed) return

        console.error('[Torre] Falha ao iniciar leitor de QR Code:', error)
        setScannerState('error')
        setScannerError(
          'Nao foi possivel acessar a camera. Verifique a permissao do Windows e tente novamente.',
        )
      }
    }

    void startScanner()

    return () => {
      disposed = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [restartKey])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-300/20 bg-black">
      <video ref={videoRef} muted playsInline className="h-64 w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-40 w-40 rounded-3xl border-2 border-cyan-200 shadow-[0_0_0_999px_rgba(2,6,23,0.45)]" />
      </div>

      {scannerState === 'starting' && (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/90 text-center">
          <div>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
            <p className="mt-3 text-sm font-bold text-slate-200">Preparando a camera...</p>
          </div>
        </div>
      )}

      {scannerState === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/95 px-6 text-center">
          <div>
            <Camera className="mx-auto h-9 w-9 text-amber-300" />
            <p className="mt-3 text-sm font-bold leading-6 text-slate-200">{scannerError}</p>
            <button type="button" onClick={() => setRestartKey((value) => value + 1)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-black text-white hover:bg-white/10">
              <RotateCcw className="h-4 w-4" />
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      <button type="button" onClick={onCancel} aria-label="Fechar camera" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-slate-950/80 text-white backdrop-blur hover:bg-slate-900">
        <X className="h-5 w-5" />
      </button>

      {scannerState === 'scanning' && (
        <p className="absolute inset-x-4 bottom-3 rounded-xl bg-slate-950/80 px-3 py-2 text-center text-xs font-bold text-cyan-100 backdrop-blur">
          Posicione o QR Code dentro do quadrado
        </p>
      )}
    </div>
  )
}
