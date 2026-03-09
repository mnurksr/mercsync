import { NextRequest, NextResponse } from 'next/server';

/**
 * Native CSV Parser (Simple implementation)
 */
function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const results: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
        });
        results.push(row);
    }
    return results;
}

/**
 * Normalizes string for matching
 */
function normalize(str: string): string {
    return (str || '').toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Calculates similarity score (0-100)
 */
function getSimilarity(s1: string, s2: string): number {
    const n1 = normalize(s1);
    const n2 = normalize(s2);
    if (!n1 || !n2) return 0;
    if (n1 === n2) return 100;

    const words1 = n1.split(' ').filter(w => w.length >= 3);
    const words2 = n2.split(' ').filter(w => w.length >= 3);

    if (words1.length === 0 || words2.length === 0) return 0;

    let matches = 0;
    for (const w1 of words1) {
        if (words2.includes(w1)) matches++;
    }

    return (matches * 200) / (words1.length + words2.length);
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const shopifyFile = formData.get('shopify_csv') as File;
        const etsyFile = formData.get('etsy_csv') as File;

        if (!shopifyFile || !etsyFile) {
            return NextResponse.json({ error: 'Shopify and Etsy CSV files are required' }, { status: 400 });
        }

        const shopifyText = await shopifyFile.text();
        const etsyText = await etsyFile.text();

        const shopifyRows = parseCSV(shopifyText);
        const etsyRows = parseCSV(etsyText);

        console.log(`[Mapper] Parsing finished. Shopify: ${shopifyRows.length}, Etsy: ${etsyRows.length}`);

        // Simplified Matching Logic
        const matched: any[] = [];
        const unmatched_shopify: any[] = [];
        const unmatched_etsy: any[] = [...etsyRows];

        for (const sRow of shopifyRows) {
            const sTitle = sRow['Title'] || sRow['Name'] || '';
            const sSku = sRow['Variant SKU'] || sRow['SKU'] || '';

            let bestMatchIdx = -1;
            let bestScore = 0;

            // 1. Try SKU Match first
            if (sSku && sSku !== 'NO-SKU') {
                const idx = unmatched_etsy.findIndex(e => (e['SKU'] || e['Variant SKU']) === sSku);
                if (idx !== -1) {
                    bestMatchIdx = idx;
                    bestScore = 1000;
                }
            }

            // 2. Try Title match
            if (bestMatchIdx === -1) {
                for (let i = 0; i < unmatched_etsy.length; i++) {
                    const eRow = unmatched_etsy[i];
                    const eTitle = eRow['Title'] || eRow['Name'] || '';
                    const score = getSimilarity(sTitle, eTitle);

                    if (score > bestScore && score > 70) {
                        bestScore = score;
                        bestMatchIdx = i;
                    }
                }
            }

            if (bestMatchIdx !== -1) {
                const eRow = unmatched_etsy.splice(bestMatchIdx, 1)[0];
                matched.push({
                    shopify: {
                        title: sTitle,
                        sku: sSku,
                        price: sRow['Variant Price'] || sRow['Price'] || '0',
                        stock: sRow['Variant Inventory Qty'] || '0'
                    },
                    etsy: {
                        title: eRow['Title'] || eRow['Name'] || '',
                        sku: eRow['SKU'] || eRow['Variant SKU'] || '',
                        price: eRow['Price'] || '0',
                        stock: eRow['Quantity'] || '0'
                    },
                    score: bestScore
                });
            } else {
                unmatched_shopify.push({
                    title: sTitle,
                    sku: sSku,
                    price: sRow['Variant Price'] || sRow['Price'] || '0',
                    stock: sRow['Variant Inventory Qty'] || '0'
                });
            }
        }

        const summary = {
            total_shopify: shopifyRows.length,
            total_etsy: etsyRows.length,
            matched_count: matched.length,
            unmatched_shopify_count: unmatched_shopify.length,
            unmatched_etsy_count: unmatched_etsy.length,
            match_rate: shopifyRows.length > 0 ? (matched.length / shopifyRows.length * 100).toFixed(1) + '%' : '0%'
        };

        return NextResponse.json({
            matched,
            unmatched_shopify,
            unmatched_etsy: unmatched_etsy.map(e => ({
                title: e['Title'] || e['Name'] || '',
                sku: e['SKU'] || e['Variant SKU'] || '',
                price: e['Price'] || '0',
                stock: e['Quantity'] || '0'
            })),
            summary
        });

    } catch (err: any) {
        console.error('[Mapper] Fatal Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
