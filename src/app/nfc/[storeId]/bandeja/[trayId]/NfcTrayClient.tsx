'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import {
  TrayContextResult,
  advanceOsStatus,
  createNfcTray,
  linkOsToTray,
} from '@/lib/actions/nfc.actions'

export function NfcTrayClient({
  initialResult,
  trayId,
  storeId,
}: {
  initialResult: TrayContextResult
  trayId: string
  storeId: number
}) {
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMode, setSuccessMode] = useState<string | null>(null)
  const [osInput, setOsInput] = useState('')

  const handleAction = async (
    actionFn: () => Promise<{ success: boolean; message?: string }>,
    successText: string
  ) => {
    setLoading(true)
    setErrorMsg('')

    try {
      const res = await actionFn()
      if (res.success) {
        setSuccessMode(successText)
      } else {
        setErrorMsg(res.message || 'Erro desconhecido.')
        // A tela pode ter sido aberta antes de a OS ser transferida ou
        // desvinculada em outro dispositivo. Recarrega o contexto atual.
        if (res.message === 'Nenhuma OS vinculada a esta bandeja.') {
          window.location.reload()
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Falha inesperada.'
      setErrorMsg('Erro de conexão: ' + message)
    } finally {
      setLoading(false)
    }
  }

  if (successMode) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-6 animate-in fade-in zoom-in duration-300">
        <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
          <CheckCircle2 size={48} strokeWidth={2.5} />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 text-center px-4 leading-tight">
          {successMode}
        </h2>
      </div>
    )
  }

  if (!initialResult.success && !initialResult.nextAction) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-4">
        <p className="text-red-600 font-medium text-center text-lg">
          {initialResult.message}
        </p>
        {initialResult.requireAuth && (
          <Link
            href="/login"
            className="w-full bg-blue-600 text-white text-center font-bold text-lg py-4 rounded-2xl shadow-lg"
          >
            ENTRAR NO SISTEMA
          </Link>
        )}
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-6 py-3 bg-gray-100 rounded-xl font-medium"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (initialResult.nextAction === 'CRIAR_BANDEJA') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-gray-800">Envelope novo</h2>
          <p className="text-gray-500">ID: {trayId}</p>
          <p className="text-sm text-gray-600 mt-4 px-2">
            Este envelope ainda não existe no sistema. Como administrador,
            deseja cadastrá-lo agora?
          </p>
        </div>

        {errorMsg && <p className="text-red-500 font-medium text-center">{errorMsg}</p>}

        <button
          disabled={loading}
          onClick={() =>
            handleAction(
              () => createNfcTray(trayId, storeId),
              'Envelope cadastrado. Pronto para uso.'
            )
          }
          className="w-full bg-blue-600 text-white font-bold text-lg py-5 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'CADASTRAR ENVELOPE'}
        </button>
      </div>
    )
  }

  if (initialResult.nextAction === 'VINCULAR_OS') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800">Envelope vazio</h2>
          <p className="text-gray-500 mt-2">
            Vincule uma Ordem de Serviço para iniciar o rastreamento.
          </p>
        </div>

        {errorMsg && <p className="text-red-500 font-medium text-center">{errorMsg}</p>}

        {initialResult.requireAuth ? (
          <div className="w-full space-y-4 mt-8">
            <p className="text-sm text-gray-600 text-center">
              {initialResult.message ?? 'Entre no sistema para vincular a OS.'}
            </p>
            <Link
              href="/login"
              className="w-full block bg-blue-600 text-white text-center font-bold text-lg py-5 rounded-2xl shadow-lg"
            >
              ENTRAR NO SISTEMA
            </Link>
          </div>
        ) : (
          <div className="w-full space-y-4 mt-8">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Número da OS
              </label>
              <input
                type="number"
                value={osInput}
                onChange={(e) => setOsInput(e.target.value)}
                placeholder="Ex: 1222"
                className="w-full text-center text-3xl font-bold py-4 border-2 border-gray-200 rounded-2xl focus:border-blue-500 focus:ring-0"
              />
            </div>
            <button
              disabled={loading || !osInput}
              onClick={() =>
                handleAction(
                  () => linkOsToTray(trayId, storeId, parseInt(osInput, 10)),
                  `Envelope vinculado à OS ${osInput}`
                )
              }
              className="w-full bg-blue-600 text-white font-bold text-lg py-5 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center"
            >
              {loading ? <Loader2 className="animate-spin" /> : 'VINCULAR OS'}
            </button>
          </div>
        )}
      </div>
    )
  }

  const osContext = initialResult.os

  if (initialResult.nextAction === 'LENTE_CHEGOU') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-8">
        <h2 className="text-2xl font-bold text-center text-gray-800 leading-snug">
          OS {osContext?.id} - Confirma que a lente chegou do laboratório?
        </h2>

        {errorMsg && <p className="text-red-500 font-medium text-center">{errorMsg}</p>}

        <div className="grid grid-cols-2 gap-4 w-full">
          <button
            disabled={loading}
            onClick={() =>
              handleAction(
                () => advanceOsStatus(trayId, storeId, 'LENTE_CHEGOU'),
                `OS ${osContext?.id} - Lente chegou`
              )
            }
            className="bg-green-600 text-white font-bold text-xl py-6 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'SIM'}
          </button>
          <button
            disabled={loading}
            onClick={() => setErrorMsg('Operação cancelada. Pode fechar a tela.')}
            className="bg-gray-200 text-gray-800 font-bold text-xl py-6 rounded-2xl shadow active:scale-95 transition-transform disabled:opacity-50"
          >
            NÃO
          </button>
        </div>
      </div>
    )
  }

  if (initialResult.nextAction === 'MONTAGEM_CONCLUIDA') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-8">
        <h2 className="text-2xl font-bold text-center text-gray-800 leading-snug">
          OS {osContext?.id} - Confirma que o óculos ficou pronto?
        </h2>

        {errorMsg && <p className="text-red-500 font-medium text-center">{errorMsg}</p>}

        <div className="grid grid-cols-2 gap-4 w-full">
          <button
            disabled={loading}
            onClick={() =>
              handleAction(
                () => advanceOsStatus(trayId, storeId, 'MONTAGEM_CONCLUIDA'),
                `OS ${osContext?.id} - óculos pronto`
              )
            }
            className="bg-green-600 text-white font-bold text-xl py-6 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'SIM'}
          </button>
          <button
            disabled={loading}
            onClick={() => setErrorMsg('Operação cancelada. Pode fechar a tela.')}
            className="bg-gray-200 text-gray-800 font-bold text-xl py-6 rounded-2xl shadow active:scale-95 transition-transform disabled:opacity-50"
          >
            NÃO
          </button>
        </div>
      </div>
    )
  }

  if (initialResult.nextAction === 'PRONTO') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-8">
        <h2 className="text-2xl font-bold text-center text-gray-800 leading-snug">
          OS {osContext?.id} - óculos pronto
        </h2>

        {errorMsg && <p className="text-red-500 font-medium text-center">{errorMsg}</p>}

        <button
          disabled={loading}
          onClick={() =>
            handleAction(
              () => advanceOsStatus(trayId, storeId, 'DESVINCULAR_BANDEJA'),
              'Envelope esvaziado'
            )
          }
          className="mt-8 text-red-500 font-semibold underline decoration-red-200 underline-offset-4"
        >
          {loading ? 'Esvaziando...' : 'Esvaziar envelope (reutilizar)'}
        </button>
      </div>
    )
  }

  return null
}
