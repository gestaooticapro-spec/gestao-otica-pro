
import { createAdminClient } from '../src/lib/supabase/admin';

async function main() {
  const storeId = 3;
  const logoFileName = 'otica_prisma.png';

  const supabase = createAdminClient();

  // 1. Get current settings
  const { data: store, error: fetchError } = await (supabase.from('stores') as any)
    .select('settings')
    .eq('id', storeId)
    .single();

  if (fetchError) {
    console.error('Error fetching store:', fetchError);
    return;
  }

  const currentSettings = ((store as any)?.settings || {}) as Record<string, any>;
  const newSettings = {
    ...currentSettings,
    logo: logoFileName
  };

  // 2. Update store
  const { error: updateError } = await (supabase.from('stores') as any)
    .update({ settings: newSettings })
    .eq('id', storeId);

  if (updateError) {
    console.error('Error updating store logo:', updateError);
    return;
  }

  console.log(`Successfully updated logo for store ${storeId} to ${logoFileName}`);
}

main();
