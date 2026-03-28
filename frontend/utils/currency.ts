/**
 * Simple Currency Conversion Utility
 * In a real-world scenario, this would fetch from an external API (like fixer.io or exchangeratesapi.io)
 * For now, we use a cached/fallback mechanism with common rates.
 */

// Basic exchange rates (Base: USD) - Updated manually or via a cron if needed
const FALLBACK_RATES: Record<string, number> = {
    'USD': 1.0,
    'EUR': 0.92,
    'GBP': 0.79,
    'TRY': 32.25,
    'CAD': 1.35,
    'AUD': 1.52
};

/**
 * Converts an amount from one currency to another.
 * @param amount - The value to convert
 * @param from - Source currency code (e.g. 'USD')
 * @param to - Target currency code (e.g. 'TRY')
 */
export function convertCurrency(amount: number, from: string = 'USD', to: string = 'USD'): number {
    if (!from || !to || from === to) return amount;

    const fromRate = FALLBACK_RATES[from.toUpperCase()];
    const toRate = FALLBACK_RATES[to.toUpperCase()];

    if (!fromRate || !toRate) {
        console.warn(`[Currency] Missing rate for ${from} or ${to}. Returning original amount.`);
        return amount;
    }

    // Convert to USD base first, then to target
    const amountInUsd = amount / fromRate;
    return amountInUsd * toRate;
}

/**
 * Formats a number as a currency string for display
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(amount);
    } catch (e) {
        return `${amount} ${currency}`;
    }
}
