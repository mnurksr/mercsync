import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Forward to the actual webhook
        const response = await fetch('https://api.mercsync.com/webhook/confirmed-matches', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            console.error('Webhook proxy error:', response.status, response.statusText);
            return NextResponse.json(
                { error: `Webhook failed with status: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json().catch(() => ({ success: true })); // Handle non-JSON responses gracefully
        return NextResponse.json(data);

    } catch (error) {
        console.error('Proxy internal error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
