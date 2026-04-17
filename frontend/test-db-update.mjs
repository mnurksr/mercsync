import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({path: '.env.local'});
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
    const shopDomain = 'shopiauto-test.myshopify.com';
    const { data: shop } = await supabase.from('shops').select('id').eq('shop_domain', shopDomain).single();
    if (!shop) throw new Error("Shop missing");

    // find one shopify_product_id
    const {data: st} = await supabase.from('staging_shopify_products').select('shopify_product_id').limit(1).single();
    const pid = st.shopify_product_id;

    console.log("Updating pid: ", pid, " for shop: ", shop.id);

    const { error: err1, data } = await supabase
        .from('staging_shopify_products')
        .update({
            product_title: 'TEST TITLE',
            status: 'draft',
            updated_at: new Date().toISOString()
        })
        .eq('shop_id', shop.id)
        .eq('shopify_product_id', pid)
        .select();
        
    console.log("Err:", err1);
    console.log("Updated rows:", data?.length);
}
test();
