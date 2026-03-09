/**
 * Shopify Admin API Client
 * Replaces the Shopify-related n8n nodes
 */

const SHOPIFY_API_VERSION = '2024-01';

type ShopifyCredentials = {
    shopDomain: string;
    accessToken: string;
};

async function shopifyFetch(creds: ShopifyCredentials, endpoint: string, options: RequestInit = {}) {
    const url = `https://${creds.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}`;

    const res = await fetch(url, {
        ...options,
        headers: {
            'X-Shopify-Access-Token': creds.accessToken,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Shopify API error (${res.status}): ${errorText}`);
    }

    return res.json();
}

/**
 * Exchange Authorization Code for Access Token
 */
export async function exchangeToken(shopDomain: string, code: string) {
    const clientId = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Shopify credentials (API Key or Secret) are missing in environment');
    }

    const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code: code
        })
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Shopify Token Exchange error (${res.status}): ${errorText}`);
    }

    return res.json();
}

/**
 * Get listing counts for a shop (active, draft, archived)
 */
export async function getListingCounts(creds: ShopifyCredentials) {
    const statuses = ['active', 'draft', 'archived'];
    const counts: Record<string, number> = {};

    await Promise.all(statuses.map(async (status) => {
        try {
            const res = await shopifyFetch(creds, `products/count.json?status=${status}`);
            counts[status] = res.count || 0;
        } catch (err) {
            console.error(`[Shopify] Failed to fetch counts for ${status}:`, err);
            counts[status] = 0;
        }
    }));

    return counts;
}

/**
 * Register all required webhooks for a shop
 */
export async function registerWebhooks(creds: ShopifyCredentials, callbackBaseUrl: string) {
    const topics = [
        'app/uninstalled',
        'shop/update',
        'products/create',
        'products/update',
        'products/delete',
        'orders/create',
        'orders/updated',
        'orders/cancelled',
        'orders/edited',
        'refunds/create',
        'inventory_levels/update'
    ];

    const webhookUrl = `${callbackBaseUrl}/api/webhooks/shopify/main`;

    const requests = topics.map(async (topic) => {
        try {
            return await shopifyFetch(creds, 'webhooks.json', {
                method: 'POST',
                body: JSON.stringify({
                    webhook: {
                        topic,
                        address: webhookUrl,
                        format: 'json'
                    }
                })
            });
        } catch (err) {
            console.warn(`[Shopify] Webhook registration failed for topic ${topic}:`, err);
            return { topic, status: 'failed', error: err };
        }
    });

    return Promise.all(requests);
}

/**
 * Set inventory level for a specific item at a location
 * Replaces: POST /inventory_levels/set.json
 */
export async function setInventoryLevel(
    creds: ShopifyCredentials,
    locationId: string | number,
    inventoryItemId: string | number,
    available: number
) {
    return shopifyFetch(creds, 'inventory_levels/set.json', {
        method: 'POST',
        body: JSON.stringify({
            location_id: Number(locationId),
            inventory_item_id: Number(inventoryItemId),
            available: available
        })
    });
}

/**
 * Enables inventory tracking for an inventory item
 * PUT /inventory_items/{id}.json
 */
export async function enableInventoryTracking(
    creds: ShopifyCredentials,
    inventoryItemId: string | number
) {
    return shopifyFetch(creds, `inventory_items/${inventoryItemId}.json`, {
        method: 'PUT',
        body: JSON.stringify({
            inventory_item: {
                id: Number(inventoryItemId),
                tracked: true
            }
        })
    });
}

/**
 * Create a new product on Shopify
 * Replaces: POST /products.json
 */
export async function createProduct(
    creds: ShopifyCredentials,
    productPayload: any
) {
    return shopifyFetch(creds, 'products.json', {
        method: 'POST',
        body: JSON.stringify({ product: productPayload })
    });
}

/**
 * Get a product from Shopify by ID
 * Replaces: GET /products/{id}.json
 */
export async function getProduct(
    creds: ShopifyCredentials,
    productId: string | number
) {
    return shopifyFetch(creds, `products/${productId}.json`);
}

/**
 * Add a variant to an existing Shopify product
 * Used for variant injection into matched products
 * POST /products/{id}/variants.json
 */
export async function addVariantToProduct(
    creds: ShopifyCredentials,
    productId: string | number,
    variantPayload: any
) {
    return shopifyFetch(creds, `products/${productId}/variants.json`, {
        method: 'POST',
        body: JSON.stringify({ variant: variantPayload })
    });
}

/**
 * Get all locations for a shop
 */
export async function getLocations(creds: ShopifyCredentials) {
    return shopifyFetch(creds, 'locations.json');
}

/**
 * Get products with optional status and pagination
 * Uses cursor-based pagination via page_info
 */
export async function getProducts(
    creds: ShopifyCredentials,
    options: { status?: string; limit?: number; page_info?: string } = {}
) {
    const params = new URLSearchParams();
    if (options.page_info) {
        // When using page_info, other parameters (except limit) must not be provided
        params.append('page_info', options.page_info);
        if (options.limit) params.append('limit', options.limit.toString());
    } else {
        if (options.status) params.append('status', options.status);
        if (options.limit) params.append('limit', options.limit.toString());
    }

    const endpoint = `products.json?${params.toString()}`;

    // We use a custom fetch here to get the Link header for pagination
    const url = `https://${creds.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}`;
    const res = await fetch(url, {
        headers: {
            'X-Shopify-Access-Token': creds.accessToken,
            'Content-Type': 'application/json',
        },
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Shopify API error (${res.status}): ${errorText}`);
    }

    const body = await res.json();
    const linkHeader = res.headers.get('Link');

    return {
        products: body.products,
        nextPageInfo: parseNextPageInfo(linkHeader)
    };
}

/**
 * Get inventory levels for specific locations
 */
export async function getInventoryLevels(
    creds: ShopifyCredentials,
    locationIds: string | number | (string | number)[]
) {
    const ids = Array.isArray(locationIds) ? locationIds.join(',') : locationIds;
    return shopifyFetch(creds, `inventory_levels.json?location_ids=${ids}`);
}

/**
 * Helper to parse the 'Link' header for Shopify pagination
 */
function parseNextPageInfo(linkHeader: string | null): string | null {
    if (!linkHeader) return null;

    const links = linkHeader.split(',');
    for (const link of links) {
        if (link.includes('rel="next"')) {
            const match = link.match(/page_info=([^>&]+)/);
            if (match) return match[1];
        }
    }
    return null;
}

/**
 * Build a Shopify product payload from Etsy source data
 * Replaces: "Code in JavaScript1" in Clone to Shopify workflow
 * @param cloneVariants - Optional: pre-built variant data from clone modal (title/sku/price/stock)
 */
export function buildProductPayload(
    sourceProduct: any,
    dbRows: any[],
    cloneVariants?: { title: string; sku: string; price: number; stock: number }[]
): { product: any; originalStocks: number[] } {
    // ALWAYS collect images from ALL source rows
    const allImages = new Set<string>();
    dbRows.forEach(row => {
        if (row.image_url) {
            row.image_url.split(',').forEach((img: string) => allImages.add(img.trim()));
        }
    });

    const images = Array.from(allImages)
        .filter(url => url !== '')
        .map(url => ({ src: url }));

    // Build variants — use clone payload data if provided, otherwise use dbRows
    let variants: any[];
    let originalStocks: number[];

    if (cloneVariants && cloneVariants.length > 0) {
        variants = cloneVariants.map(v => ({
            option1: v.title || 'Default Title',
            price: v.price ? v.price.toString() : '0.00',
            sku: v.sku || '',
            inventory_management: 'shopify',
            requires_shipping: true
        }));
        originalStocks = cloneVariants.map(v => v.stock || 0);
    } else {
        variants = dbRows.map(row => ({
            option1: row.variant_title || 'Default Title',
            price: row.price ? row.price.toString() : '0.00',
            sku: row.sku || '',
            inventory_management: 'shopify',
            requires_shipping: true
        }));
        originalStocks = dbRows.map(row => row.stock_quantity || 0);
    }

    return {
        product: {
            title: sourceProduct.product_title || sourceProduct.name,
            body_html: sourceProduct.description || '',
            status: 'draft',
            vendor: 'Etsy Klonu',
            images,
            variants
        },
        originalStocks
    };
}
