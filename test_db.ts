import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data, error } = await supabase.from('staging_etsy_products').select('*').limit(1)
  console.log('Etsy Staging:', data)
  const { data: sData } = await supabase.from('staging_shopify_products').select('*').limit(1)
  console.log('Shopify Staging:', sData)
}

run()
