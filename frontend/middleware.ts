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
            const authUrl = `https://api.mercsync.com/webhook/auth/shopify/start?shop=${shop}&return_url=${returnUrl}`;

            // Shopify App Bridge V4 ile Güvenli Yönlendirme
            // Hem XHR interceptleri hem de doküman yüklemeleri (Iframe) için gerekli başlıkları ekliyor ve
            // App Bridge kütüphanesini yükleyerek güvenli bir `open(url, '_top')` işlemi çalıştırıyoruz.
            const html = `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <base target="_top">
                    <!-- Shopify App Bridge v4 CDN (Requires API Key to initialize) -->
                    <meta name="shopify-api-key" content="${process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || 'a3ba5196aa260a2b8eec8da2662c1cf6'}" />
                    <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
                    
                    <script type="text/javascript">
                        document.addEventListener("DOMContentLoaded", function() {
                            // Give App Bridge a moment to attach
                            setTimeout(function() {
                                if (window.shopify) {
                                    window.open("${authUrl}", "_top");
                                } else {
                                    // Fallbacks if App Bridge CDN fails to load
                                    if (window.parent) {
                                        window.parent.location.href = "${authUrl}";
                                    } else {
                                        window.top.location.href = "${authUrl}";
                                    }
                                }
                            }, 300);
                        });
                    </script>
                    <style>
                        body {
                            margin: 0;
                            height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            background-color: #fafafa;
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                            color: #333;
                        }
                        .loader-container {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            gap: 16px;
                        }
                        .spinner {
                            width: 32px;
                            height: 32px;
                            border: 3px solid rgba(0, 0, 0, 0.1);
                            border-radius: 50%;
                            border-top-color: #000;
                            animation: spin 1s ease-in-out infinite;
                        }
                        @keyframes spin {
                            to { transform: rotate(360deg); }
                        }
                        p {
                            margin: 0;
                            font-size: 15px;
                            font-weight: 500;
                            color: #555;
                            letter-spacing: -0.2px;
                        }
                    </style>
                </head>
                <body>
                    <div class="loader-container">
                        <div class="spinner"></div>
                        <p>Authenticating workspace...</p>
                    </div>
                </body>
            </html>
            `;

            return new NextResponse(html, {
                status: 200,
                headers: {
                    'Content-Type': 'text/html',
                    'X-Shopify-API-Request-Failure-Reauthorize': '1',
                    'X-Shopify-API-Request-Failure-Reauthorize-Url': authUrl
                },
            });
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
