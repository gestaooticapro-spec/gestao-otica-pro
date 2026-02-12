// Caminho: src/app/dashboard/loja/[storeId]/layout.tsx

import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import SideNav from '@/components/SideNav';
import { getProfileByAdmin } from '@/lib/supabase/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import CashGuard from '@/components/financeiro/CashGuard';
import { ModalsProvider } from '@/lib/contexts/ModalsContext';
import { OperatorLayout } from '@/components/operator-menu';
import DashboardLayoutWrapper from '@/components/dashboard/DashboardLayoutWrapper';

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

  // --- LAYOUT CONDICIONAL POR ROLE ---

  // Se for store_operator, usa o layout de menu por botões
  if (userRole === 'store_operator') {
    return (
      <ModalsProvider storeId={storeIdParam}>
        <OperatorLayout
          storeId={storeIdParam}
          storeName={storeName}
          logoUrl={logoUrl}
        >
          <CashGuard storeId={storeIdParam} />
          {children}
        </OperatorLayout>
      </ModalsProvider>
    );
  }



  // Layout tradicional com sidebar para outros roles
  return (
    <ModalsProvider storeId={storeIdParam}>
      <div className="flex w-full h-full overflow-hidden"> {/* REMOVED bg-gray-100 */}

        {/* WRAPPER ENVOLVE SIDEBAR E MAIN PARA O BACKGROUND */}
        <DashboardLayoutWrapper>

          <CashGuard storeId={storeIdParam} />

          <div className="flex-shrink-0 h-full relative z-20"> {/* z-20 para SideNav ficar acima do bg */}
            <SideNav
              userRole={userRole}
              storeId={storeIdParam}
              storeName={storeName}
              logoUrl={logoUrl}
            />
          </div>

          <main className="flex-1 overflow-y-auto relative z-10 w-full"> {/* REMOVED bg-gray-100 */}
            {children}
          </main>

        </DashboardLayoutWrapper>

      </div>
    </ModalsProvider>
  );
}