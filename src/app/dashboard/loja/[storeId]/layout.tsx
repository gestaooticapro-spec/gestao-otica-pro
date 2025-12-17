// Caminho: src/app/dashboard/loja/[storeId]/layout.tsx

import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import SideNav from '@/components/SideNav';
import { getProfileByAdmin } from '@/lib/supabase/admin'; 
import { createAdminClient } from '@/lib/supabase/admin'; 
import CashGuard from '@/components/financeiro/CashGuard'; // <--- 1. Importação do Guardião

type Role = 'admin' | 'manager' | 'store_operator' | 'vendedor' | 'tecnico';

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { storeId: string };
}) {
  const supabase = createClient();
  const storeIdParam = parseInt(params.storeId as string, 10);

  if (isNaN(storeIdParam)) return notFound();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/login');

  // Busca perfil usando admin client para garantir leitura correta
  const profile = await getProfileByAdmin(user.id) as any; 

  if (!profile || !profile.role) {
      return redirect('/login?error=profile_incomplete');
  }
  
  const { store_id, role } = profile;
  const userRole = role as Role;

  // Validação de Segurança: O usuário pertence a esta loja?
  const isAuthorized = userRole === 'admin' || store_id === storeIdParam;

  if (!isAuthorized) {
    return redirect('/dashboard/manager?error=access_denied');
  }

  // Busca o nome da loja para exibir no Menu
  const supabaseAdmin = createAdminClient();
  const { data: storeData } = await (supabaseAdmin
    .from('stores') as any)
    .select('name')
    .eq('id', storeIdParam)
    .single();
    
  const storeName = storeData?.name || 'Ótica';

  return (
    <div className="flex w-full h-screen overflow-hidden"> 
      
      {/* 2. O GUARDIÃO DO CAIXA */}
      {/* Ele roda em segundo plano verificando se o caixa está aberto.
          Se estiver fechado, ele bloqueia a tela (com opção de pular). */}
      <CashGuard storeId={storeIdParam} />

      <div className="flex-shrink-0 relative z-40">
          <SideNav 
            userRole={userRole} 
            storeId={storeIdParam} 
            storeName={storeName} 
          />
      </div>

      <main className="flex-1 overflow-hidden bg-gray-100 relative">
        {children}
      </main>
    </div>
  );
}