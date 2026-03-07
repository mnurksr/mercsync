
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

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

/**
 * Native Sessionless Authentication Bridge
 * Automatically determines if the action was called by a traditional Supabase authenticated user
 * or an embedded Shopify user via the 'mercsync_shop' cookie.
 * 
 * In the case of an embedded user, it returns an ADMIN SUPABASE CLIENT to bypass RLS,
 * since the Next.js Supabase Session doesn't exist for them.
 */
export async function getValidatedUserContext() {
    const supabaseSession = await createServerClient();
    const { data: { user } } = await supabaseSession.auth.getUser();

    if (user) {
        // Traditional user
        return { ownerId: user.id, supabase: supabaseSession, isAdmin: false };
    }

    const cookieStore = await cookies();
    const shopCookie = cookieStore.get('mercsync_shop')?.value;

    if (shopCookie) {
        const adminSupabase = createAdminClient();
        const { data } = await adminSupabase
            .from('shops')
            .select('owner_id')
            .eq('shop_domain', shopCookie)
            .maybeSingle();

        if (data?.owner_id) {
            // Embedded Shopify user: MUST use admin client to bypass RLS
            return { ownerId: data.owner_id, supabase: adminSupabase, isAdmin: true, shopDomain: shopCookie };
        }
    }

    // Returns null if unauthorized
    return { ownerId: null, supabase: supabaseSession, isAdmin: false, shopDomain: null };
}
