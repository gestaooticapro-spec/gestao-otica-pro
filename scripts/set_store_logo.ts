
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createAdminClient } from '../src/lib/supabase/admin';

async function main() {
  const storeId = 3;
  const logoFileName = 'otica_prisma.png';
  const bucket = 'store-logos';
  const extension = path.extname(logoFileName).toLowerCase();
  const contentType = extension === '.png' ? 'image/png' : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/webp';
  const logoPath = `stores/${storeId}/logo${extension === '.jpeg' ? '.jpg' : extension}`;

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
  const bytes = await readFile(path.join(process.cwd(), 'public', 'logos', logoFileName));
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(logoPath, bytes, { contentType, upsert: true });

  if (uploadError) {
    console.error('Error uploading store logo:', uploadError);
    return;
  }

  const newSettings = {
    ...currentSettings,
    logo: logoPath
  };

  // 2. Update store
  const { error: updateError } = await (supabase.from('stores') as any)
    .update({ settings: newSettings })
    .eq('id', storeId);

  if (updateError) {
    console.error('Error updating store logo:', updateError);
    return;
  }

  console.log(`Successfully updated logo for store ${storeId} to ${logoPath}`);
}

main();
