require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('staging_shopify_products').select('title, stock_quantity, location_inventory_map').limit(3);
  console.log(JSON.stringify(data, null, 2));
}
run();
