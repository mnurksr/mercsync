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

    // 1. Akıllı Yönlendirme & Tanıtım Sayfasını Gizleme
    // Eğer istek kök dizine (/) geliyorsa ve URL'de ?shop= varsa (Shopify içinden geliyorsa), 
    // Landing Page'i hiç render etmeden doğrudan /dashboard rotasına yönlendir.
    if (request.nextUrl.pathname === '/' && shop) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
    }

    if (!session) {
        // If they are in the Shopify iframe but lost their session (or it's their first load)
        // Automatically bounce them to OAuth to seamlessly log them in, UNLESS they are already on the callback
        if (shop && !request.nextUrl.pathname.startsWith('/auth/shopify/callback')) {
            const returnUrl = encodeURIComponent(request.url);
            return NextResponse.redirect(`https://api.mercsync.com/webhook/auth/shopify/start?shop=${shop}&return_url=${returnUrl}`);
        }

        // If not in iframe and trying to access a protected route, go to manual login
        if (!isPublicRoute) {
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    // If user is signed in and visits login or root (and bypassed the shop check), redirect to dashboard
    if (session && (request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname === '/')) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
    }

    return response
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
