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
            const errorText = await response.text();
            console.error('Webhook proxy error:', response.status, response.statusText, errorText);
            return NextResponse.json(
                {
                    error: `Webhook failed with status: ${response.status}`,
                    details: errorText.slice(0, 500) // Limit error length
                },
                { status: response.status }
            );
        }

        const data = await response.json().catch(async () => {
            // If valid JSON isn't returned, generic success if 2xx
            const text = await response.text();
            return { success: true, message: "Request accepted", raw: text.slice(0, 100) };
        });
        return NextResponse.json(data);

    } catch (error) {
        console.error('Proxy internal error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
