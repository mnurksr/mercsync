import { createAdminClient } from './utils/supabase/admin';

async function checkSchema() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('shops')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching shop:', error);
        return;
    }

    console.log('Shop row data:', data);
}

checkSchema();
