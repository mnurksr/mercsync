export type InventoryState =
    | 'in_sync'
    | 'mismatch'
    | 'action_required'
    | 'shopify_only'
    | 'etsy_only'
    | 'digital'
    | 'unlinked';

export function classifyInventoryState(input: {
    isDigital?: boolean | null;
    shopifyVariantId?: string | null;
    etsyVariantId?: string | null;
    masterStock?: number | null;
    shopifyStock?: number | null;
    etsyStock?: number | null;
}): InventoryState {
    if (input.isDigital) return 'digital';

    if (!input.shopifyVariantId || !input.etsyVariantId) {
        if (input.shopifyVariantId && !input.etsyVariantId) return 'shopify_only';
        if (input.etsyVariantId && !input.shopifyVariantId) return 'etsy_only';
        return 'unlinked';
    }

    const masterStock = Number(input.masterStock || 0);
    const shopifyStock = Number(input.shopifyStock || 0);
    const etsyStock = Number(input.etsyStock || 0);
    const shopifyMatchesMaster = shopifyStock === masterStock;
    const etsyMatchesMaster = etsyStock === masterStock;

    if (masterStock <= 0) return 'action_required';
    if (shopifyMatchesMaster && etsyMatchesMaster) return 'in_sync';
    if (shopifyMatchesMaster !== etsyMatchesMaster) return 'mismatch';
    return 'action_required';
}
