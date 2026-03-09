/**
 * Etsy Open API Client
 * Replaces the Etsy-related n8n nodes
 *
 * API Key from env: ETSY_API_KEY
 */

const ETSY_BASE = 'https://openapi.etsy.com/v3/application';

function getApiKey(): string {
    return process.env.ETSY_API_KEY || '0y4c7v5r8ijsp7zvvtrg8fbu:cs8c7xrvx6';
}

async function etsyFetch(endpoint: string, accessToken: string, options: RequestInit = {}) {
    const url = `${ETSY_BASE}${endpoint}`;

    const res = await fetch(url, {
        ...options,
        headers: {
            'x-api-key': getApiKey(),
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Etsy API error (${res.status}): ${errorText}`);
    }

    return res.json();
}

/**
 * Exchange Authorization Code for Access Token (OAuth 2.0 PKCE)
 */
export async function exchangeToken(code: string, verifier: string, redirectUri: string) {
    const clientId = process.env.ETSY_CLIENT_ID;
    if (!clientId) throw new Error('ETSY_CLIENT_ID is not configured');

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('client_id', clientId);
    params.append('code_verifier', verifier);

    const res = await fetch('https://api.etsy.com/v3/public/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Etsy Token Exchange error (${res.status}): ${errorText}`);
    }

    return res.json();
}

/**
 * Refresh Access Token
 */
export async function refreshToken(refreshToken: string) {
    const clientId = process.env.ETSY_CLIENT_ID;
    if (!clientId) throw new Error('ETSY_CLIENT_ID is not configured');

    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    params.append('client_id', clientId);

    const res = await fetch('https://api.etsy.com/v3/public/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Etsy Token Refresh error (${res.status}): ${errorText}`);
    }

    return res.json();
}

/**
 * Get Authenticated User's Shop Details
 */
export async function getMe(accessToken: string) {
    // Extract user ID from token (Etsy tokens contain user ID before the first dot)
    const userId = accessToken.split('.')[0];
    return etsyFetch(`/users/${userId}/shops`, accessToken);
}

/**
 * Get listing counts for a shop across all possible states
 */
export async function getListingCounts(shopId: string | number, accessToken: string) {
    const states = ['active', 'draft', 'expired', 'sold_out', 'inactive'];
    const counts: Record<string, number> = {};

    await Promise.all(states.map(async (state) => {
        try {
            const res = await etsyFetch(`/shops/${shopId}/listings?state=${state}&limit=1`, accessToken);
            counts[state] = res.count || 0;
        } catch (err) {
            console.error(`[Etsy] Failed to fetch counts for state ${state}:`, err);
            counts[state] = 0;
        }
    }));

    return counts;
}
/**
 * Fetch all listings for a shop filtered by state
 * Includes recursive pagination
 */
export async function getListingsByState(
    shopId: string | number,
    accessToken: string,
    state: string = 'active',
    offset: number = 0,
    limit: number = 100
): Promise<any> {
    const url = `/shops/${shopId}/listings?state=${state}&limit=${limit}&offset=${offset}&includes=Images`;
    const data = await etsyFetch(url, accessToken);

    // If we have more pages, fetch them too? 
    // Usually better to let the caller handle pagination or do it recursively here.
    // Let's do it recursively for convenience in the import flow.
    const results = data.results || [];
    if (results.length === limit && data.count > offset + limit) {
        const nextData = await getListingsByState(shopId, accessToken, state, offset + limit, limit);
        return {
            ...data,
            results: [...results, ...nextData.results],
            count: data.count
        };
    }

    return data;
}

/**
 * Get current inventory for a listing
 * Replaces: "Etsy Mevcut Stok (GET)" node
 */
export async function getInventory(listingId: string | number, accessToken: string) {
    return etsyFetch(`/listings/${listingId}/inventory`, accessToken);
}

/**
 * Update inventory for a listing (stock/price/variants)
 * Replaces: "Etsy Stok Güncelle (PUT)" node
 */
export async function updateInventory(
    listingId: string | number,
    accessToken: string,
    inventoryPayload: any
) {
    return etsyFetch(`/listings/${listingId}/inventory`, accessToken, {
        method: 'PUT',
        body: JSON.stringify(inventoryPayload)
    });
}

/**
 * Create a new Etsy listing
 * Replaces: POST /shops/{id}/listings
 */
export async function createListing(
    shopId: string | number,
    accessToken: string,
    listingPayload: any
) {
    return etsyFetch(`/shops/${shopId}/listings`, accessToken, {
        method: 'POST',
        body: JSON.stringify(listingPayload)
    });
}

/**
 * Upload an image to an Etsy listing
 * Replaces: POST /shops/{id}/listings/{listing_id}/images
 *
 * Note: multipart/form-data — we override Content-Type
 */
export async function uploadImage(
    shopId: string | number,
    listingId: string | number,
    accessToken: string,
    imageBuffer: Buffer,
    filename: string = 'image.jpg'
) {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' });
    formData.append('image', blob, filename);

    const url = `${ETSY_BASE}/shops/${shopId}/listings/${listingId}/images`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'x-api-key': getApiKey(),
            'Authorization': `Bearer ${accessToken}`,
            // Let fetch set Content-Type with boundary for multipart
        },
        body: formData
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Etsy image upload error (${res.status}): ${errorText}`);
    }

    return res.json();
}

/**
 * Set variation images for a listing
 * Replaces: PUT /shops/{id}/listings/{listing_id}/variation-images
 */
export async function setVariationImages(
    shopId: string | number,
    listingId: string | number,
    accessToken: string,
    variationImages: { property_id: number; value_id: number; image_id: number }[]
) {
    return etsyFetch(`/shops/${shopId}/listings/${listingId}/variation-images`, accessToken, {
        method: 'PUT',
        body: JSON.stringify({ variation_images: variationImages })
    });
}

/**
 * Create shipping profile (or get existing)
 * Replaces: "HTTP Request10" node
 */
export async function getOrCreateShippingProfile(
    shopId: string | number,
    accessToken: string
): Promise<number | null> {
    // First try to get existing profiles
    try {
        const existing = await etsyFetch(`/shops/${shopId}/shipping-profiles`, accessToken);
        if (existing.results && existing.results.length > 0) {
            return existing.results[0].shipping_profile_id;
        }
    } catch { }

    // Create a new one
    try {
        const created = await etsyFetch(`/shops/${shopId}/shipping-profiles`, accessToken, {
            method: 'POST',
            body: JSON.stringify({
                title: 'MercSync Default Profile',
                min_processing_time: 1,
                max_processing_time: 2,
                processing_time_unit: 'business_days',
                origin_country_iso: 'US',
                origin_postal_code: '10001',
                destination_country_iso: 'US',
                primary_cost: 0,
                secondary_cost: 0,
                min_delivery_days: 3,
                max_delivery_days: 7
            })
        });
        return created.shipping_profile_id;
    } catch (e) {
        console.error('[Etsy] Failed to create shipping profile:', e);
        return null;
    }
}

/**
 * Create readiness state definition (or get existing)
 * Replaces: "HTTP Request11" node
 */
export async function getOrCreateReadinessState(
    shopId: string | number,
    accessToken: string
): Promise<number | null> {
    // Try to get existing
    try {
        const existing = await etsyFetch(`/shops/${shopId}/readiness-state-definitions`, accessToken);
        if (existing.results && existing.results.length > 0) {
            return existing.results[0].readiness_state_id;
        }
    } catch { }

    // Create a new one
    try {
        const created = await etsyFetch(`/shops/${shopId}/readiness-state-definitions`, accessToken, {
            method: 'POST',
            body: JSON.stringify({
                readiness_state: 'ready_to_ship',
                min_processing_time: 1,
                max_processing_time: 3,
                processing_time_unit: 'days'
            })
        });
        return created.readiness_state_id;
    } catch (e) {
        console.error('[Etsy] Failed to create readiness state:', e);
        return null;
    }
}

/**
 * Download an image from a URL and return as Buffer
 */
export async function downloadImage(imageUrl: string): Promise<Buffer | null> {
    try {
        const res = await fetch(imageUrl);
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch {
        return null;
    }
}

/**
 * Build Etsy listing payload from Shopify product data
 * Replaces: "Code in JavaScript" in Clone to Etsy workflow
 * @param cloneVariants - Optional: pre-built variant data from clone modal
 */
export function buildListingPayload(
    shopifyProduct: any,
    dbStocks: { shopify_variant_id: string; stock_quantity: number }[],
    shippingProfileId: number | null,
    readinessStateId: number | null,
    cloneVariants?: { title: string; sku: string; price: number; stock: number }[],
    overrides?: { title?: string; description?: string }
): { listingPayload: any; inventoryPayload: any } {
    // Build stock map from DB
    const stockMap: Record<string, number> = {};
    dbStocks.forEach(row => {
        if (row.shopify_variant_id) {
            stockMap[row.shopify_variant_id.toString()] = row.stock_quantity;
        }
    });

    // Detect product type
    const isDigital = shopifyProduct.product_type === 'giftcard' ||
        shopifyProduct.variants?.some((v: any) => v.requires_shipping === false);
    const etsyType = isDigital ? 'download' : 'physical';

    // Use clone variants if provided, otherwise use Shopify product variants
    const useCloneVariants = cloneVariants && cloneVariants.length > 0;
    const variants = useCloneVariants ? cloneVariants : (shopifyProduct.variants || []);

    const activeProperties: number[] = [];
    const optionName = shopifyProduct.options?.[0]?.name || 'Variation';

    // If there are multiple variants, USE property 513 (Etsy "Variation 1")
    if (variants.length > 1) {
        activeProperties.push(513);
    }

    // Build inventory products
    let totalStock = 0;
    const etsyProducts = variants.map((variant: any) => {
        let actualStock: number;
        if (useCloneVariants) {
            // Use stock directly from clone payload
            actualStock = isDigital ? 999 : Math.max(1, variant.stock || 1);
        } else {
            // Use stock from DB map
            actualStock = isDigital ? 999 : Math.max(1, stockMap[variant.id?.toString()] || 1);
        }
        totalStock += actualStock;

        const offering: any = {
            price: parseFloat(variant.price),
            quantity: actualStock,
            is_enabled: true
        };
        if (etsyType === 'physical' && readinessStateId) {
            offering.readiness_state_id = readinessStateId;
        }

        return {
            sku: variant.sku || (variant.id ? `SKU-${variant.id}` : `SKU-${Date.now()}`),
            property_values: activeProperties.length > 0 ? [{
                property_id: 513,
                property_name: optionName === 'Title' ? 'Variation' : optionName,
                values: [variant.option1 || variant.title || 'Default']
            }] : [],
            offerings: [offering]
        };
    });

    // Build listing payload
    const listingPayload: any = {
        quantity: Math.min(999, Math.max(1, totalStock)),
        title: (overrides?.title || shopifyProduct.title || 'Default Title').substring(0, 140),
        description: (overrides?.description || shopifyProduct.body_html || 'No description')
            .replace(/(<([^>]+)>)/gi, '')
            .substring(0, 500),
        price: parseFloat(shopifyProduct.variants[0].price),
        who_made: 'i_did',
        when_made: '2020_2026',
        taxonomy_id: 1,
        type: etsyType,
        is_supply: false,
        state: 'draft'
    };

    if (etsyType === 'physical') {
        if (shippingProfileId) listingPayload.shipping_profile_id = shippingProfileId;
        if (readinessStateId) listingPayload.readiness_state_id = readinessStateId;
    }

    const inventoryPayload = {
        products: etsyProducts,
        price_on_property: activeProperties,
        quantity_on_property: activeProperties,
        sku_on_property: activeProperties
    };

    return { listingPayload, inventoryPayload };
}

/**
 * Build stock update payload for an existing listing
 * Merges new stock values into the current inventory
 * Replaces: "Stok Verilerini Birleştir" node
 */
export function mergeStockUpdate(
    currentInventory: any,
    variantUpdates: { item_id: string; new_stock: number }[]
): any {
    const updateMap: Record<string, number> = {};
    variantUpdates.forEach(u => {
        updateMap[u.item_id] = u.new_stock;
    });

    const cleanProducts = (currentInventory.products || []).map((product: any) => {
        const variantId = product.product_id.toString();

        // Apply new stock if this variant is in the update list
        let newQuantity = product.offerings[0].quantity;
        if (updateMap[variantId] !== undefined) {
            // Etsy doesn't allow 0 quantity
            newQuantity = Math.max(1, updateMap[variantId]);
        }

        // Clean property_values
        const cleanProps = (product.property_values || []).map((prop: any) => {
            const p: any = {
                property_id: prop.property_id,
                value_ids: prop.value_ids,
                property_name: prop.property_name,
                values: prop.values
            };
            if (prop.scale_id !== null) p.scale_id = prop.scale_id;
            return p;
        });

        // Clean offerings
        const cleanOfferings = (product.offerings || []).map((off: any) => {
            let priceVal = off.price;
            if (typeof priceVal === 'object' && priceVal.amount !== undefined) {
                priceVal = priceVal.amount / priceVal.divisor;
            }

            return {
                price: priceVal,
                quantity: newQuantity,
                is_enabled: off.is_enabled,
                readiness_state_id: off.readiness_state_id
            };
        });

        return {
            sku: product.sku || '',
            property_values: cleanProps,
            offerings: cleanOfferings
        };
    });

    return {
        products: cleanProducts,
        price_on_property: currentInventory.price_on_property || [],
        quantity_on_property: currentInventory.quantity_on_property || [],
        sku_on_property: currentInventory.sku_on_property || []
    };
}
