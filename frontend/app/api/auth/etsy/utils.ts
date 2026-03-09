import CryptoJS from 'crypto-js';

/**
 * Etsy OAuth 2.0 PKCE Utilities
 */

/**
 * Generates a PKCE code_verifier and code_challenge
 * - verifier: 128 characters, base64url
 * - challenge: SHA256(verifier) as base64url
 */
export function generatePKCE() {
    // Generate 96 random bytes -> 128 base64url characters
    const verifierBytes = CryptoJS.lib.WordArray.random(96);
    const verifier = verifierBytes.toString(CryptoJS.enc.Base64)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    const challengeHash = CryptoJS.SHA256(verifier);
    const challenge = challengeHash.toString(CryptoJS.enc.Base64)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    return { verifier, challenge };
}

/**
 * Encodes the state variable to pass userId, verifier, and returnUrl safely
 */
export function encodeState(userId: string, verifier: string, returnUrl?: string) {
    const payload = {
        owner_id: userId,
        verifier: verifier,
        timestamp: Date.now(),
        return_url: returnUrl
    };

    // Use base64url encoding for the state string
    const json = JSON.stringify(payload);
    return Buffer.from(json).toString('base64')
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
