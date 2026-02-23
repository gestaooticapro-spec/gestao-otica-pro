import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getProfileByAdmin } from '@/lib/supabase/admin';

type ManagerProfile = {
  role?: string | null;
  store_id?: number | null;
};

export default async function ManagerDashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect('/login');
  }

  const profile = (await getProfileByAdmin(user.id)) as ManagerProfile | null;

  if (!profile || profile.role !== 'manager' || !profile.store_id) {
    return redirect('/dashboard');
  }

  return redirect(`/dashboard/loja/${profile.store_id}`);
}
