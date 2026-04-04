const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  let { data, error } = await supabase.from('stores').select('id, name, settings');
  if (error) {
    console.error("Error fetching stores:", error);
    return;
  }
  console.log("Current stores:");
  console.log(JSON.stringify(data, null, 2));

  // Find ocular store - assume it's id 2 from previous discussion or name contains 'ocular'
  const ocularStore = data.find(s => s.id === 2 || s.name.toLowerCase().includes('ocular'));
  
  if (ocularStore) {
    console.log(`Found Ocular store: ${ocularStore.name} (ID: ${ocularStore.id})`);
    
    // Update settings
    const currentSettings = ocularStore.settings || {};
    const newSettings = { ...currentSettings, logo: 'logoocular.png' };
    
    console.log(`Updating settings to:`, newSettings);
    
    const { data: updateData, error: updateError } = await supabase
      .from('stores')
      .update({ settings: newSettings })
      .eq('id', ocularStore.id)
      .select();
      
    if (updateError) {
      console.error("Error updating store:", updateError);
    } else {
      console.log("Update successful!", updateData);
    }
  } else {
    console.log("Could not find ocular store.");
  }
}
run();
