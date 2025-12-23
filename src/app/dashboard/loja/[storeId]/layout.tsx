// Caminho: src/app/dashboard/loja/[storeId]/layout.tsx

import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import SideNav from '@/components/SideNav';
import { getProfileByAdmin } from '@/lib/supabase/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import CashGuard from '@/components/financeiro/CashGuard';

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

  const supabaseAdmin = createAdminClient();
  const { data: storeData } = await (supabaseAdmin
    .from('stores') as any)
    .select('name, settings')
    .eq('id', storeIdParam)
    .single();

  const storeName = storeData?.name || 'Ótica';
  const settings = storeData?.settings as any;
  const logoUrl = settings?.logo ? `/logos/${settings.logo}` : null;

  return (
    // CORREÇÃO 1: Mudamos de 'h-screen' para 'h-full'.
    // Isso faz ele respeitar o 'pt-16' do layout pai e não empurra o conteúdo para cima.
    <div className="flex w-full h-full overflow-hidden bg-gray-100">

      <CashGuard storeId={storeIdParam} />

      <div className="flex-shrink-0 h-full">
        <SideNav
          userRole={userRole}
          storeId={storeIdParam}
          storeName={storeName}
          logoUrl={logoUrl}
        />
      </div>

      {/* CORREÇÃO 2: Mudamos 'overflow-hidden' para 'overflow-y-auto'. 
          Isso garante que a barra de rolagem fique aqui, no conteúdo, e não na janela inteira. */}
      <main className="flex-1 overflow-y-auto bg-gray-100 relative">
        {children}
      </main>
    </div>
  );
}