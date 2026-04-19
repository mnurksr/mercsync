/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { validateWebhookHMAC } from '../../../auth/shopify/utils';
import { createAdminClient } from '@/utils/supabase/admin';
import { redactShopData } from '../cleanup';

/**
 * Shopify Mandatory GDPR Webhooks
 * 
 * These endpoints are REQUIRED by Shopify for app submission.
 * Shopify sends these webhooks when:
 *   - A customer requests their data (customers/data_request)
 *   - A customer requests data deletion (customers/redact)  
 *   - A shop owner uninstalls the app or closes their store (shop/redact)
 * 
 * See: https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks
 */

async function validateRequest(req: NextRequest): Promise<{ valid: boolean; payload: any; topic: string | null }> {
    const hmac = req.headers.get('x-shopify-hmac-sha256');
    const topic = req.headers.get('x-shopify-topic');
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    if (!hmac || !clientSecret) {
        return { valid: false, payload: null, topic: null };
    }

    const rawBody = await req.text();
    const isValid = validateWebhookHMAC(rawBody, hmac, clientSecret);
    
    if (!isValid) {
        return { valid: false, payload: null, topic: null };
    }

    return { valid: true, payload: JSON.parse(rawBody), topic };
}

/**
 * POST /api/webhooks/shopify/gdpr
 * 
 * Handles all 3 mandatory GDPR webhook topics:
 * - customers/data_request
 * - customers/redact
 * - shop/redact
 */
export async function POST(req: NextRequest) {
    try {
        const { valid, payload, topic } = await validateRequest(req);

        if (!valid) {
            console.warn('[GDPR Webhook] HMAC validation failed or missing secret');
            return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
        }

        const shopDomain = payload?.shop_domain || '';
        console.log(`[GDPR Webhook] Received topic=${topic} shop=${shopDomain}`);

        const supabase = createAdminClient();

        switch (topic) {
            /**
             * customers/data_request
             * A customer has requested their data. Since MercSync only deals with
             * product inventory data and does NOT store customer personal data
             * (no names, emails, addresses, payment info), we acknowledge the
             * request and return an empty response.
             */
            case 'customers/data_request': {
                console.log(`[GDPR] Data request for shop=${shopDomain}, customer=${payload?.customer?.id}`);
                // MercSync does not store any customer PII.
                // We acknowledge the request per Shopify's requirements.
                return NextResponse.json({ 
                    message: 'MercSync does not store customer personal data. No data to export.' 
                }, { status: 200 });
            }

            /**
             * customers/redact
             * A customer has requested erasure of their data. Since MercSync
             * does not store customer PII, we simply acknowledge.
             */
            case 'customers/redact': {
                console.log(`[GDPR] Customer redact for shop=${shopDomain}, customer=${payload?.customer?.id}`);
                // No customer data stored — nothing to delete.
                return NextResponse.json({ 
                    message: 'MercSync does not store customer personal data. No data to redact.' 
                }, { status: 200 });
            }

            /**
             * shop/redact
             * Triggered 48 hours after a merchant uninstalls the app.
             * We must delete ALL data associated with this shop domain.
             */
            case 'shop/redact': {
                console.log(`[GDPR] Shop redact for shop=${shopDomain}. Deleting all associated data.`);

                const result = await redactShopData(supabase, shopDomain, '[GDPR]');
                if (!result.ok) {
                    return NextResponse.json(
                        { error: 'Shop data redaction failed', details: result.errors },
                        { status: 500 }
                    );
                }

                return NextResponse.json({ 
                    message: 'Shop data has been redacted successfully.' 
                }, { status: 200 });
            }

            default:
                console.log(`[GDPR Webhook] Unknown topic: ${topic}`);
                return NextResponse.json({ message: 'Unknown topic' }, { status: 200 });
        }
    } catch (err: any) {
        console.error('[GDPR Webhook] Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
