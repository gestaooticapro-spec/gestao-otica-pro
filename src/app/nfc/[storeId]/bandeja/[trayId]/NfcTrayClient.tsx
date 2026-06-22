'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TrayContextResult, createNfcTray, linkOsToTray, advanceOsStatus } from '@/lib/actions/nfc.actions'
import { Loader2, CheckCircle2 } from 'lucide-react'

export function NfcTrayClient({
  initialResult,
  trayId,
  storeId
}: {
  initialResult: TrayContextResult
  trayId: string
  storeId: number
}) {
  // Estados de UI
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMode, setSuccessMode] = useState<string | null>(null) // Para exibir mensagens diretas após a ação
  
  // Estado para o input de OS manual
  const [osInput, setOsInput] = useState('')

  const handleAction = async (actionFn: () => Promise<{success: boolean, message?: string}>, successText: string) => {
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await actionFn()
      if (res.success) {
        setSuccessMode(successText)
        // Redirecionamento nativo pelo router para revalidar estado pode ser opcional aqui,
        // já que o successMode toma conta da tela inteira (conforme solicitado pelo usuário).
      } else {
        setErrorMsg(res.message || 'Erro desconhecido.')
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Falha inesperada.'
      setErrorMsg('Erro de conexão: ' + message)
    } finally {
      setLoading(false)
    }
  }

  // 1. Tela de Sucesso Isolada (Fim da linha)
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

  // 2. Tratamento de Erro Inicial
  if (!initialResult.success && !initialResult.nextAction) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-4">
        <p className="text-red-600 font-medium text-center text-lg">{initialResult.message}</p>
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
          Tentar Novamente
        </button>
      </div>
    )
  }

  // --- RENDERIZAÇÃO CONTEXTUAL ---

  if (initialResult.nextAction === 'CRIAR_BANDEJA') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-gray-800">Bandeja Nova</h2>
          <p className="text-gray-500">ID: {trayId}</p>
          <p className="text-sm text-gray-600 mt-4 px-2">
            Esta bandeja ainda não existe no sistema. Como administrador, deseja cadastrá-la agora?
          </p>
        </div>
        
        {errorMsg && <p className="text-red-500 font-medium text-center">{errorMsg}</p>}
        
        <button
          disabled={loading}
          onClick={() => handleAction(() => createNfcTray(trayId, storeId), 'Bandeja cadastrada. Pronta para uso.')}
          className="w-full bg-blue-600 text-white font-bold text-lg py-5 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'CADASTRAR BANDEJA'}
        </button>
      </div>
    )
  }

  if (initialResult.nextAction === 'VINCULAR_OS') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800">Bandeja Vazia</h2>
          <p className="text-gray-500 mt-2">Vincule uma Ordem de Serviço para iniciar o rastreamento.</p>
        </div>

        {errorMsg && <p className="text-red-500 font-medium text-center">{errorMsg}</p>}

        <div className="w-full space-y-4 mt-8">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Número da OS</label>
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
            onClick={() => handleAction(() => linkOsToTray(trayId, storeId, parseInt(osInput, 10)), `Bandeja vinculada à OS ${osInput}`)}
            className="w-full bg-blue-600 text-white font-bold text-lg py-5 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'VINCULAR OS'}
          </button>
        </div>
      </div>
    )
  }

  // Ações de andamento da OS (Lente Chegou, Montagem, Pronto)
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
            onClick={() => handleAction(() => advanceOsStatus(trayId, storeId, 'LENTE_CHEGOU'), `OS ${osContext?.id} - Lente chegou`)}
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
            onClick={() => handleAction(() => advanceOsStatus(trayId, storeId, 'MONTAGEM_CONCLUIDA'), `OS ${osContext?.id} - óculos pronto`)}
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

  // Estado PRONTO (óculos já estava montado antes, ou seja, leitura de conferência)
  if (initialResult.nextAction === 'PRONTO') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-8">
        <h2 className="text-2xl font-bold text-center text-gray-800 leading-snug">
          OS {osContext?.id} - óculos pronto
        </h2>
        
        {errorMsg && <p className="text-red-500 font-medium text-center">{errorMsg}</p>}

        {/* Botão sutil para esvaziar a bandeja caso o fluxo chegue ao fim real (entrega pro cliente) */}
        <button
          disabled={loading}
          onClick={() => handleAction(() => advanceOsStatus(trayId, storeId, 'DESVINCULAR_BANDEJA'), `Bandeja Esvaziada`)}
          className="mt-8 text-red-500 font-semibold underline decoration-red-200 underline-offset-4"
        >
          {loading ? 'Esvaziando...' : 'Esvaziar Bandeja (Reutilizar)'}
        </button>
      </div>
    )
  }

  return null
}
