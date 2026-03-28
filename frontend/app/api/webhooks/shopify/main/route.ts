import { NextRequest, NextResponse } from 'next/server';
import { validateWebhookHMAC } from '../../../auth/shopify/utils';
import { createAdminClient } from '@/utils/supabase/admin';
import { handleInventoryUpdate } from '../inventory-sync';
import { handlePriceUpdate } from '../../../sync/price-sync';

export async function POST(req: NextRequest) {
    const supabase = createAdminClient();
    try {
        const hmac = req.headers.get('x-shopify-hmac-sha256');
        const topic = req.headers.get('x-shopify-topic');
        const shop = req.headers.get('x-shopify-shop-domain');

        if (!hmac || !topic || !shop) {
            return new Response('Missing headers', { status: 400 });
        }

        const rawBody = await req.text();
        const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

        if (!clientSecret) {
            console.error('[Shopify Webhook] SHOPIFY_CLIENT_SECRET not configured');
            return new Response('Secret not configured', { status: 500 });
        }

        const isValid = validateWebhookHMAC(rawBody, hmac, clientSecret);
        if (!isValid) {
            console.warn('[Shopify Webhook] HMAC validation failed');
            return new Response('Unauthorized', { status: 401 });
        }

        const payload = JSON.parse(rawBody);
        console.log(`[Shopify Webhook] Received topic ${topic} from ${shop}`);

        // Handle specific topics
        switch (topic) {
            case 'app/uninstalled':
                console.log(`[Shopify Webhook] App uninstalled for ${shop}`);
                await supabase
                    .from('shops')
                    .update({ is_active: false, shopify_connected: false })
                    .eq('shop_domain', shop);
                break;

            case 'shop/update':
                // Update shop details if needed
                break;

            case 'products/create':
            case 'products/update':
                console.log(`[Shopify Webhook] Product ${topic} for ${shop}: ${payload.id}`);
                
                // Fire-and-forget: Sync price if enabled
                handlePriceUpdate(payload, shop, supabase).then((result: any) => {
                    console.log(`[Shopify Webhook] Price sync result: ${result.status} — ${result.message}`);
                }).catch((err: any) => {
                    console.error(`[Shopify Webhook] Price sync error:`, err);
                });
                break;

            case 'products/delete':
                console.log(`[Shopify Webhook] Product deleted for ${shop}: ${payload.id}`);
                break;

            case 'orders/create':
            case 'orders/updated':
                console.log(`[Shopify Webhook] Order ${topic} for ${shop}: ${payload.id}`);
                break;

            case 'inventory_levels/update':
                console.log(`[Shopify Webhook] Inventory update for ${shop}: item=${payload.inventory_item_id}, location=${payload.location_id}, available=${payload.available}`);
                
                // Fire-and-forget: don't block webhook response
                handleInventoryUpdate(payload, shop, supabase).then(result => {
                    console.log(`[Shopify Webhook] Inventory sync result: ${result.status} — ${result.message}`);
                }).catch(err => {
                    console.error(`[Shopify Webhook] Inventory sync error:`, err);
                });
                break;

            default:
                console.log(`[Shopify Webhook] Unhandled topic: ${topic}`);
        }

        // Always respond 200 quickly — Shopify retries if we're too slow
        return new Response('OK', { status: 200 });
    } catch (err: any) {
        console.error('[Shopify Webhook] Internal Error:', err);
        return new Response('Server Error', { status: 500 });
    }
}
