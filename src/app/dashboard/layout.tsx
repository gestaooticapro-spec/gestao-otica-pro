// Caminho: src/app/dashboard/layout.tsx
import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Header from '@/components/header';
import { getProfileByAdmin } from '@/lib/supabase/admin';
import FullscreenToggleButton from '@/components/FullscreenToggleButton';

type Role = 'admin' | 'manager' | 'store_operator' | 'vendedor' | 'tecnico';
type ProfileWithRole = { role?: string | null };

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  // 1. Checagem de autenticação
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return redirect('/login');
  }

  // 2. Buscar o profile para verificar o role
  const profile = (await getProfileByAdmin(user.id)) as ProfileWithRole | null;
  const userRole = profile?.role as Role | undefined;

  // 3. Para store_operator e manager, renderiza sem header (fullscreen)
  if (userRole === 'store_operator' || userRole === 'manager') {
    return (
      <div className="min-h-screen">
        <FullscreenToggleButton className="right-20 top-6" />
        {children}
      </div>
    );
  }

  // 4. Para outros roles, renderiza com header normal
  return (
    <div className="min-h-screen bg-slate-950">
      <FullscreenToggleButton className="right-20 top-20" />
      <Header />

      {/* Container Principal: Header é compensado por pt-16 */}
      <div className="flex flex-1 pt-16">
        {children}
      </div>
    </div>
  );
}
