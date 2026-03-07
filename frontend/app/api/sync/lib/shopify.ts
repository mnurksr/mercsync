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
