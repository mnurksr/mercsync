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
        request.nextUrl.pathname.startsWith('/dashboard/mapper') ||
        request.nextUrl.pathname.startsWith('/setup');

    const shop = request.nextUrl.searchParams.get('shop');

    // NATIVE SESSIONLESS AUTHENTICATION BRIDGE
    // Store the shop domain in a secure cookie to allow embedded users to browse the dashboard 
    // seamlessly without requiring a Supabase Auth session.
    let mercsyncShopCookie = request.cookies.get('mercsync_shop')?.value;

    if (shop) {
        // Shopify iframe always provides ?shop=xyz
        mercsyncShopCookie = shop;
        response.cookies.set('mercsync_shop', shop, {
            path: '/',
            maxAge: 60 * 60 * 24 * 30, // 30 days
            sameSite: 'none',
            secure: true
        });
    }

    // 1. Akıllı Yönlendirme
    // Eğer istek kök dizine (/) geliyorsa ve URL'de ?shop= varsa (Shopify içinden geliyorsa), 
    // Landing Page'i hiç render etmeden doğrudan /dashboard rotasına yönlendir.
    if (request.nextUrl.pathname === '/' && shop) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
    }

    // Determine if user has ANY form of access: either a traditional Supabase session, OR our Shopify cookie
    const hasAccess = session || mercsyncShopCookie;

    if (!hasAccess && !isPublicRoute) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // If user is signed in (or has shop cookie) and visits login or root, redirect to dashboard
    if (hasAccess && (request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname === '/')) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
    }

    return response
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
