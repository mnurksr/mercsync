import crypto from 'crypto';

/**
 * Shopify OAuth Utilities
 */

/**
 * Validates the HMAC signature from Shopify
 * @param params - The query parameters from the callback URL
 * @param secret - The Shopify Client Secret
 */
export function validateHMAC(params: Record<string, string>, secret: string): boolean {
    const hmac = params.hmac;
    if (!hmac) return false;

    // 1. Remove hmac
    const filteredParams = { ...params };
    delete filteredParams.hmac;

    // 2. Sort and join
    const message = Object.keys(filteredParams)
        .sort()
        .map(key => `${key}=${filteredParams[key]}`)
        .join('&');

    // 3. Calculate HMAC
    const calculatedHmac = crypto
        .createHmac('sha256', secret)
        .update(message)
        .digest('hex');

    // 4. Compare
    return calculatedHmac === hmac;
}

/**
 * Encodes the state variable
 */
export function encodeState(userId: string, nonce: string, returnUrl?: string) {
    const payload = {
        user_id: userId,
        nonce: nonce,
        timestamp: Date.now(),
        return_url: returnUrl
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

/**
 * Decodes the state variable
 */
export function decodeState(state: string) {
    try {
        const pad = '='.repeat((4 - (state.length % 4)) % 4);
        const b64 = (state + pad).replace(/-/g, '+').replace(/_/g, '/');
        const json = Buffer.from(b64, 'base64').toString('utf8');
        return JSON.parse(json);
    } catch (e) {
        throw new Error('Invalid state parameter');
    }
}
