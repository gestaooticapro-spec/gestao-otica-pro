// Caminho: src/app/dashboard/loja/[storeId]/layout.tsx

import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import SideNav from '@/components/SideNav';
import { getProfileByAdmin } from '@/lib/supabase/admin'; 
import { createAdminClient } from '@/lib/supabase/admin'; 

type Role = 'admin' | 'manager' | 'store_operator' | 'vendedor';

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

  // CORREÇÃO: Cast 'as any' para garantir flexibilidade nas propriedades do perfil
  const profile = await getProfileByAdmin(user.id) as any; 

  if (!profile || !profile.role) {
      return redirect('/login?error=profile_incomplete');
  }
  
  const { store_id, role } = profile;
  const userRole = role as Role;

  const isAuthorized = userRole === 'admin' || store_id === storeIdParam;

  if (!isAuthorized) {
    return redirect('/dashboard/manager?error=access_denied');
  }

  // --- NOVO: BUSCA O NOME DA LOJA ---
  const supabaseAdmin = createAdminClient();
  
  // CORREÇÃO: Cast 'as any' na tabela stores
  const { data: storeData } = await (supabaseAdmin
    .from('stores') as any)
    .select('name')
    .eq('id', storeIdParam)
    .single();
    
  const storeName = storeData?.name || 'Ótica';
  // ----------------------------------

  return (
    <div className="flex w-full"> 
      <div className="flex-shrink-0 relative z-40">
        <div className="sticky top-16 h-[calc(100vh-64px)]">
            <SideNav 
              userRole={userRole} 
              storeId={storeIdParam} 
              storeName={storeName} 
            />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-6 bg-gray-100 h-[calc(100vh-64px)]">
        {children}
      </main>
    </div>
  );
}