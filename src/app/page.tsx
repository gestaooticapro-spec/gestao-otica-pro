// Caminho: src/app/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
// Importa o helper do admin, que usa o Service Role Client
import { getProfileByAdmin } from '@/lib/supabase/admin' 
import { getStoreModulesForStore } from '@/lib/store-modules.server'

export default async function HomePage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    // CORREÇÃO: Cast 'as any' para garantir acesso às propriedades role e store_id
    const profile = await getProfileByAdmin(user.id) as any;

    if (profile?.role === 'admin') {
      const adminStoreId = profile.store_id || 1; 
      redirect(`/dashboard/loja/${adminStoreId}`) 

    } else if (profile?.role === 'manager') {
       if (profile.store_id) {
           redirect(`/dashboard/loja/${profile.store_id}`)
       } else {
           redirect('/dashboard/manager') 
       }
      
    } else if (profile?.role === 'store_operator' && profile.store_id) {
      redirect(`/dashboard/loja/${profile.store_id}`) 
      
    } else if (profile?.role === 'vendedor' && profile.store_id) {
      // Vendedor vai direto para o PDV ou para a home da loja
      const modules = await getStoreModulesForStore(profile.store_id)
      redirect(modules.quickSale ? `/dashboard/loja/${profile.store_id}/pdv-express` : `/dashboard/loja/${profile.store_id}`)
      
    } else {
      // Se for um usuário logado sem perfil válido, desloga
      await supabase.auth.signOut();
      redirect('/login?error=invalid_profile') 
    }
  }

  // Se não houver usuário, vai para o login
  redirect('/login')
}
