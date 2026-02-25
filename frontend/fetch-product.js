require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await supabaseAdmin.from('staging_shopify_products').select('title, shopify_product_id, variant_title, stock_quantity, location_inventory_map').limit(5);
  console.log(JSON.stringify(data, null, 2));
}
run();
