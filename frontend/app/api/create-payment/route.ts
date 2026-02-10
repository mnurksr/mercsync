import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { user_id, product_id } = body;

        console.log('[API/create-payment] Received request for:', { user_id, product_id });

        const webhookUrl = 'https://api.mercsync.com/webhook/generate-payment-link';

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id, product_id }),
        });

        console.log('[API/create-payment] Webhook status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[API/create-payment] Webhook error:', errorText);
            return NextResponse.json(
                { error: `Webhook failed with status: ${response.status}`, details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        console.log('[API/create-payment] Webhook data:', JSON.stringify(data, null, 2));

        // Helper function to recursively find a payment URL in any structure
        const findPaymentUrl = (obj: any): string | null => {
            if (!obj) return null;

            // Arrays: check each element
            if (Array.isArray(obj)) {
                for (const item of obj) {
                    const url = findPaymentUrl(item);
                    if (url) return url;
                }
                return null;
            }

            // Strings: checks if strictly the URL (unlikely for root object but possible)
            if (typeof obj === 'string' && (obj.startsWith('http') || obj.startsWith('/'))) {
                return obj;
            }

            // Objects: Check specific keys first, then recursive search
            if (typeof obj === 'object') {
                // Priority keys
                if (obj.checkout_url) return obj.checkout_url;
                if (obj.url) return obj.url;
                if (obj.payment_link) return obj.payment_link;

                // Recursive search in keys
                for (const key in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
                        const val = obj[key];
                        // Avoid recursing into purely metadata-like strings/numbers if we can helps it,
                        // but complex objects need search.
                        if (typeof val === 'object' || Array.isArray(val)) {
                            const found = findPaymentUrl(val);
                            if (found) return found;
                        }
                    }
                }
            }

            return null;
        };

        const redirectUrl = findPaymentUrl(data);

        if (!redirectUrl) {
            console.error('[API/create-payment] No redirect URL found in response');
            return NextResponse.json(
                { error: 'No redirect URL found in webhook response', data },
                { status: 500 }
            );
        }

        return NextResponse.json({ url: redirectUrl });

    } catch (error) {
        console.error('[API/create-payment] Internal Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
