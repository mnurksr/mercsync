
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('MISSING_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY is not defined. Please add it to your .env.local file. This is DIFFERENT from the ANON key.')
    }

    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )
}
