import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value,
                        ...options,
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    response.cookies.set({
                        name,
                        value,
                        ...options,
                    })
                },
                remove(name: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    response.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                },
            },
        }
    )

    const { data: { session } } = await supabase.auth.getSession()

    // Protect routes
    const isPublicRoute = request.nextUrl.pathname === '/' ||
        request.nextUrl.pathname.startsWith('/login') ||
        request.nextUrl.pathname.startsWith('/privacy') ||
        request.nextUrl.pathname.startsWith('/terms') ||
        request.nextUrl.pathname.startsWith('/pricing') ||
        request.nextUrl.pathname.startsWith('/dashboard/mapper');

    const shopParam = request.nextUrl.searchParams.get('shop');

    // NATIVE SESSIONLESS AUTHENTICATION BRIDGE
    // Store the shop domain in a secure cookie to allow embedded users to browse the dashboard 
    // seamlessly without requiring a Supabase Auth session.
    const mercsyncShopCookie = request.cookies.get('mercsync_shop')?.value;

    // Do not trust ?shop= by itself for sessionless auth. The mercsync_shop
    // cookie is only set after Shopify OAuth callback HMAC validation.

    // Determine if user has ANY form of access: either a traditional Supabase session, OR our Shopify cookie
    const hasAccess = !!(session || mercsyncShopCookie);

    // CRITICAL: Protect internal routes
    if (!hasAccess && !isPublicRoute) {
        const loginUrl = new URL('/login', request.url);
        // If we were trying to access a shop-specific setup/dashboard, preserve the shop param
        if (shopParam) loginUrl.searchParams.set('shop', shopParam);
        return NextResponse.redirect(loginUrl);
    }

    // AUTH REDIRECT LOGIC
    // We no longer auto-redirect to /dashboard from here. 
    // The specific page layouts (layout.tsx) handle the internal routing 
    // based on setup completion and plan status.

    return response
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
