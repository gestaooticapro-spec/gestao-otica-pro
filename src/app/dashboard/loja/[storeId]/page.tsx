// ARQUIVO: src/app/dashboard/loja/[storeId]/page.tsx

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAdmin, createAdminClient } from '@/lib/supabase/admin'

// Importação das Actions de Dados
import { getManagerKPIs, getAdminKPIs } from '@/lib/actions/dashboard.actions'
import { getAlertasOperacionais, getAniversariantes, getVencimentosProximos } from '@/lib/actions/consultas.actions'

// Importação dos Painéis Visuais
import { ManagerDashboard, AdminDashboard } from '@/components/dashboard/DashboardViews'
import ActionMenuDashboard from '@/components/dashboard/ActionMenuDashboard'

export default async function StoreHomePage({ params }: { params: { storeId: string } }) {
  const storeId = parseInt(params.storeId, 10)
  if (isNaN(storeId)) return notFound()

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirect('/login')

  const profile = await getProfileByAdmin(user.id) as any
  if (!profile) return redirect('/login')

  // Busca nome da loja
  const supabaseAdmin = createAdminClient()
  const { data: store } = await (supabaseAdmin.from('stores') as any)
    .select('name')
    .eq('id', storeId)
    .single()
    
  const storeName = store?.name || `Loja ${storeId}`

  // 1. ADMIN (Dono da Rede)
  if (profile.role === 'admin') {
      const kpis = await getAdminKPIs()
      return (
          <div className="p-6 max-w-7xl mx-auto">
              <h1 className="text-2xl font-bold text-slate-800 mb-6">Visão Geral da Rede (Admin)</h1>
              <AdminDashboard data={kpis} />
          </div>
      )
  }

  // 2. MANAGER (Gerente)
  if (profile.role === 'manager') {
      const kpis = await getManagerKPIs(storeId)
      return (
          <div className="p-6 max-w-7xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                  <h1 className="text-2xl font-bold text-slate-800">Painel Gerencial</h1>
                  <span className="text-sm font-medium text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full shadow-sm">
                      {storeName}
                  </span>
              </div>
              <ManagerDashboard data={kpis} />
          </div>
      )
  }

  // 3. OPERADOR / VENDEDOR (Dashboard Operacional)
  // Busca em paralelo para ser rápido
  const [alertas, aniversariantes, vencimentos] = await Promise.all([
      getAlertasOperacionais(storeId),
      getAniversariantes(storeId),
      getVencimentosProximos(storeId) // <--- Busca nova
  ])

  return (
      <ActionMenuDashboard 
          storeId={storeId} 
          storeName={storeName} // <--- Passa o nome da loja
          alerts={alertas} 
          birthdays={aniversariantes} 
          vencimentos={vencimentos} // <--- Passa os vencimentos
      />
  )
}