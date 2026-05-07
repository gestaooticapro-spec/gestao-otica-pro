import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import SideNav from '@/components/SideNav';
import { getProfileByAdmin } from '@/lib/supabase/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { ModalsProvider } from '@/lib/contexts/ModalsContext';
import { OperatorLayout } from '@/components/operator-menu';
import DashboardLayoutWrapper from '@/components/dashboard/DashboardLayoutWrapper';
import ManagerLayout from '@/components/manager-menu/ManagerLayout';
import { TabletRedirect } from '@/components/tablet/TabletRedirect';

type Role = 'admin' | 'manager' | 'store_operator' | 'vendedor' | 'tecnico';
type StoreProfile = {
  role?: string | null;
  store_id?: number | null;
};
type StoreDataShape = {
  name?: string | null;
  settings?: unknown;
};
type StoreSettings = {
  logo?: string;
  pre_sale_analysis_enabled?: boolean;
};

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return redirect('/login');

  const profile = (await getProfileByAdmin(user.id)) as StoreProfile | null;

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
  const { data: rawStoreData } = await supabaseAdmin
    .from('stores')
    .select('name, settings')
    .eq('id', storeIdParam)
    .single();
  const storeData = rawStoreData as StoreDataShape | null;

  const storeName = storeData?.name || 'Otica';
  const settings = storeData?.settings;
  const typedSettings = (settings as StoreSettings | null) || null;
  let logoFile: string | null = null;
  const preSaleAnalysisEnabled = typedSettings?.pre_sale_analysis_enabled === true;

  if (settings && typeof settings === 'object' && 'logo' in settings) {
    const maybeLogo = (settings as { logo?: unknown }).logo;
    if (typeof maybeLogo === 'string' && maybeLogo.length > 0) {
      logoFile = maybeLogo;
    }
  }

  const logoUrl = logoFile ? `/logos/${logoFile}` : null;

  if (userRole === 'store_operator') {
    return (
      <ModalsProvider storeId={storeIdParam}>
        <TabletRedirect storeId={storeIdParam} />
        <OperatorLayout storeId={storeIdParam} storeName={storeName} logoUrl={logoUrl} preSaleAnalysisEnabled={preSaleAnalysisEnabled}>
          {children}
        </OperatorLayout>
      </ModalsProvider>
    );
  }

  if (userRole === 'manager') {
    return (
      <ModalsProvider storeId={storeIdParam}>
        <TabletRedirect storeId={storeIdParam} />
        <ManagerLayout storeId={storeIdParam} storeName={storeName} logoUrl={logoUrl}>
          {children}
        </ManagerLayout>
      </ModalsProvider>
    );
  }

  return (
    <ModalsProvider storeId={storeIdParam}>
      <TabletRedirect storeId={storeIdParam} />
      <div className="flex w-full h-full overflow-hidden">
        <DashboardLayoutWrapper>
          <div className="flex-shrink-0 h-full relative z-20">
            <SideNav userRole={userRole} storeId={storeIdParam} storeName={storeName} logoUrl={logoUrl} />
          </div>

          <main className="flex-1 overflow-y-auto relative z-10 w-full">{children}</main>
        </DashboardLayoutWrapper>
      </div>
    </ModalsProvider>
  );
}
