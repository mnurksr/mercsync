require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await supabaseAdmin.from('staging_shopify_products').select('title, shopify_product_id, variant_title, stock_quantity, location_inventory_map');
  const d = data.find(x => x.title === 'The Collection Snowboard: Hydrogen' || x.title === 'Selling Plans Ski Wax')
  if(d) {
     console.log(JSON.stringify(d, null, 2));
  } else {
     console.log("Bulunamadı.");
  }
}
run();
