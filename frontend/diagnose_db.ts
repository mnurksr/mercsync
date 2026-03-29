import { createAdminClient } from './utils/supabase/admin.ts';

async function diagnose() {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('shop_settings').select('*').limit(1);
    
    if (error) {
        console.error('Error fetching settings:', error);
    } else {
        console.log('Settings columns:', Object.keys(data[0] || {}));
    }
}

diagnose();
