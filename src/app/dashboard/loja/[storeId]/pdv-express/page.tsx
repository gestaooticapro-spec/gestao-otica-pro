'use client'

import { useState, useEffect } from 'react'
import { getEmployees } from '@/lib/actions/employee.actions'
import PdvExpressInterface from '@/components/vendas/PdvExpressInterface'
import { Zap } from 'lucide-react'
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle'

export default function PdvExpressPage({ params }: { params: { storeId: string } }) {
  const storeId = parseInt(params.storeId, 10)
  const [employees, setEmployees] = useState<any[]>([])
  const { preference, isLoaded } = useBackgroundPreference()

  useEffect(() => {
    async function loadEmployees() {
      try {
        const data = await getEmployees(storeId)
        setEmployees(data || [])
      } catch (error) {
        console.error('Erro ao carregar funcionários:', error)
        setEmployees([])
      }
    }
    loadEmployees()
  }, [storeId])

  if (!isLoaded) {
    return (
      <div className="relative flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden">
        <div className="flex items-center justify-center h-full">
          <div className="text-slate-400">Carregando...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden font-sans">
      {/* Background Image */}
      <div className={`absolute inset-0 z-0 transition-opacity duration-1000 pointer-events-none ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0 bg-[url('/tela1.jpg')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
      </div>

      {/* Header */}
      <div className="relative z-10 bg-white/5 backdrop-blur-md border-b border-white/10 px-6 py-4 flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight uppercase">PDV Express</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Venda Rápida (Balcão)</p>
          </div>
        </div>

        <BackgroundToggle />
      </div>

      {/* Área de Trabalho */}
      <div className="relative z-10 flex-1 p-4 lg:p-6 overflow-hidden">
        <PdvExpressInterface
          storeId={storeId}
          employees={employees}
        />
      </div>
    </div>
  )
}
