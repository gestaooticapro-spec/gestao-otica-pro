'use client'

import { useState, useRef } from 'react'
import { X, Search, User, ArrowRight, Loader2, ArrowDownUp, ShieldCheck } from 'lucide-react'
import { searchCustomersByName, transferirTitularidadeVenda, type CustomerSearchResult } from '@/lib/actions/vendas.actions'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import { toast } from 'sonner'

interface Props {
  isOpen: boolean
  onClose: () => void
  vendaId: number
  storeId: number
  currentCustomerId: number
  onSuccess: () => Promise<void>
}

export default function TransferVendaModal({ isOpen, onClose, vendaId, storeId, currentCustomerId, onSuccess }: Props) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [customers, setCustomers] = useState<CustomerSearchResult[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null)
  const [justificativa, setJustificativa] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fluxo de autenticação por PIN
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const justificativaRef = useRef<HTMLTextAreaElement>(null)

  if (!isOpen) return null

  const handleSearch = async () => {
    if (searchTerm.trim().length < 3) return
    setIsSearching(true)
    setError(null)
    const result = await searchCustomersByName(searchTerm, storeId)
    if (result.success && result.data) {
      setCustomers(result.data.filter(c => c.id !== currentCustomerId))
    } else {
      setError(result.message || 'Erro ao buscar cliente')
    }
    setIsSearching(false)
  }

  const handleSelectCustomer = (c: CustomerSearchResult) => {
    setSelectedCustomer(c)
    setCustomers([])
    setSearchTerm('')
    // Pequeno timeout para garantir que o textarea esteja renderizado/focado
    setTimeout(() => justificativaRef.current?.focus(), 100)
  }

  // Ao clicar em "Confirmar", abre o EmployeeAuthModal primeiro
  const handleRequestTransfer = () => {
    if (!selectedCustomer) {
      setError('Selecione um cliente para prosseguir.')
      return
    }
    setError(null)
    setIsAuthOpen(true)
  }

  // Quando o funcionário se autenticar com PIN, executa a transferência
  const handleAuthSuccess = async (employee: { id: number; full_name: string; role: string }) => {
    if (!selectedCustomer) return
    setIsTransferring(true)
    setError(null)

    const res = await transferirTitularidadeVenda(
      vendaId,
      storeId,
      selectedCustomer.id,
      justificativa,
      employee.id,
      employee.full_name
    )

    if (res.success) {
      toast.success(res.message)
      await onSuccess()
      // Reset state
      setSearchTerm('')
      setCustomers([])
      setSelectedCustomer(null)
      setJustificativa('')
      onClose()
    } else {
      setError(res.message)
      toast.error(res.message)
    }
    setIsTransferring(false)
  }

  return (
    <>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={onClose}>
        <div
          className="relative w-full max-w-lg bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Glow decorativo */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 blur-[60px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 blur-[40px] rounded-full pointer-events-none" />

          {/* Header */}
          <div className="relative z-10 px-5 py-4 border-b border-white/10 flex justify-between items-center bg-amber-500/5">
            <h3 className="font-black text-amber-300 flex items-center gap-2.5 text-sm uppercase tracking-wider">
              <ArrowDownUp className="h-4 w-4" />
              Transferir Titularidade
            </h3>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="relative z-10 p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">

            {/* Aviso */}
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200/90 p-3 rounded-xl text-xs font-medium leading-relaxed">
              <strong className="text-amber-300">⚠ Atenção:</strong> Ao transferir, prestações do crediário e OSs passarão para o novo titular. Nomes dos dependentes dentro das OSs devem ser corrigidos manualmente.
            </div>

            {/* Área de Seleção ou Card de Escolha */}
            {!selectedCustomer ? (
              <div className="space-y-4">
                {/* Busca */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Buscar Novo Titular</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/30 backdrop-blur-md transition-all"
                      placeholder="Nome ou CPF (mínimo 3 letras)"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    />
                    <button
                      onClick={handleSearch}
                      disabled={isSearching || searchTerm.length < 3}
                      className="bg-white/5 border border-white/10 px-4 rounded-xl flex items-center justify-center hover:bg-white/10 disabled:opacity-30 text-slate-300 transition-all"
                    >
                      {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Resultados */}
                {customers.length > 0 && (
                  <div className="border border-white/10 rounded-xl overflow-hidden max-h-44 overflow-y-auto custom-scrollbar bg-black/20">
                    {customers.map(c => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className="p-3 border-b border-white/5 cursor-pointer flex justify-between items-center text-sm transition-all hover:bg-white/5"
                      >
                        <div>
                          <div className="font-bold text-white">{c.full_name}</div>
                          <div className="text-[10px] text-slate-500">CPF: {c.cpf || '—'} | Fone: {c.fone_movel || '—'}</div>
                        </div>
                        <ArrowRight className="text-slate-500 h-4 w-4 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Card de Cliente Selecionado */
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex justify-between items-center animate-in slide-in-from-top-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-amber-500 uppercase tracking-widest leading-none mb-1">Novo Titular Escolhido</div>
                    <div className="font-bold text-white text-base">{selectedCustomer.full_name}</div>
                    <div className="text-[10px] text-slate-400">CPF: {selectedCustomer.cpf || '—'}</div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-widest px-3 py-1.5 border border-white/5 hover:bg-white/5 rounded-lg transition-all"
                >
                  Alterar
                </button>
              </div>
            )}

            {/* Justificativa */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Motivo da Transferência (Opcional)</label>
              <textarea
                ref={justificativaRef}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-600 max-h-24 min-h-[60px] focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all resize-none backdrop-blur-md"
                placeholder="Ex: Compra em nome da mãe, transferida para o filho (Fábio)..."
                value={justificativa}
                onChange={e => setJustificativa(e.target.value)}
              />
            </div>

            {/* Erro */}
            {error && (
              <div className="text-xs text-red-400 font-black text-center p-2.5 bg-red-500/10 rounded-xl border border-red-500/20 uppercase tracking-widest">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="relative z-10 p-4 bg-black/30 border-t border-white/10 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
            >
              Cancelar
            </button>

            <button
              onClick={handleRequestTransfer}
              disabled={!selectedCustomer || isTransferring}
              className="px-6 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all disabled:opacity-30 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
            >
              {isTransferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Autenticar e Transferir
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Autenticação por PIN (segundo layer) */}
      <EmployeeAuthModal
        storeId={storeId}
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={handleAuthSuccess}
        title="Autorizar Transferência"
        description="Insira o PIN do vendedor responsável por esta venda."
      />
    </>
  )
}
