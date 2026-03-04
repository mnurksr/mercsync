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
 * Build a Shopify product payload from Etsy source data
 * Replaces: "Code in JavaScript1" in Clone to Shopify workflow
 */
export function buildProductPayload(
    sourceProduct: any,
    dbRows: any[]
): { product: any; originalStocks: number[] } {
    // Collect all unique images
    const allImages = new Set<string>();
    dbRows.forEach(row => {
        if (row.image_url) {
            row.image_url.split(',').forEach((img: string) => allImages.add(img.trim()));
        }
    });

    const images = Array.from(allImages)
        .filter(url => url !== '')
        .map(url => ({ src: url }));

    // Build variants
    const variants = dbRows.map(row => ({
        option1: row.variant_title || 'Default Title',
        price: row.price ? row.price.toString() : '0.00',
        sku: row.sku || '',
        inventory_management: 'shopify',
        requires_shipping: true
    }));

    const originalStocks = dbRows.map(row => row.stock_quantity || 0);

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
