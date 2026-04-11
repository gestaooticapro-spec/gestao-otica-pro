
import { createAdminClient } from '../src/lib/supabase/admin';

async function main() {
  const supabase = createAdminClient();

  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, name, tenant_id');

  if (error) {
    console.error('Error fetching stores:', error);
    return;
  }

  console.log('Stores found:');
  console.table(stores);

  const { data: tenants, error: tenantError } = await supabase
    .from('tenants')
    .select('id, name');

  if (tenantError) {
    console.error('Error fetching tenants:', tenantError);
    return;
  }

  console.log('Tenants found:');
  console.table(tenants);
}

main();
