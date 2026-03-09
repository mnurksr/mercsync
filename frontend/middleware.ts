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
    let mercsyncShopCookie = request.cookies.get('mercsync_shop')?.value;

    if (shopParam) {
        // Shopify iframe always provides ?shop=xyz
        mercsyncShopCookie = shopParam;
        response.cookies.set('mercsync_shop', shopParam, {
            path: '/',
            maxAge: 60 * 60 * 24 * 30, // 30 days
            sameSite: 'none',
            secure: true
        });
    }

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
    // ONLY auto-redirect from login to dashboard if we are SURE we are in a valid Shopify session context
    // (Meaning we have a shop param AND access). 
    // If a user visits /login directly from the web, we DON'T redirect them, allowing them to start over.
    if (hasAccess && request.nextUrl.pathname.startsWith('/login')) {
        if (shopParam || session) {
            const url = request.nextUrl.clone();
            url.pathname = '/dashboard';
            return NextResponse.redirect(url);
        }
    }

    return response
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
