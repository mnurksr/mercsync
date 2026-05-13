/**
 * POST /api/promo/validate
 * 
 * Validates a promo code and returns the associated benefits.
 * Checks: exists, not expired, usage limit not exceeded, active.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(req: NextRequest) {
    try {
        const { code } = await req.json();

        if (!code || typeof code !== 'string') {
            return NextResponse.json(
                { valid: false, error: 'Promo code is required' },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();
        const normalizedCode = code.trim().toUpperCase();

        const { data: promo, error } = await supabase
            .from('promo_codes')
            .select('*')
            .eq('code', normalizedCode)
            .eq('is_active', true)
            .maybeSingle();

        if (error) {
            console.error('[Promo] DB error:', error);
            return NextResponse.json(
                { valid: false, error: 'Failed to validate code' },
                { status: 500 }
            );
        }

        if (!promo) {
            return NextResponse.json({ valid: false, error: 'Invalid promo code' });
        }

        // Check expiry
        if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
            return NextResponse.json({ valid: false, error: 'This promo code has expired' });
        }

        // Check usage limit
        if (promo.max_uses && promo.current_uses >= promo.max_uses) {
            return NextResponse.json({ valid: false, error: 'This promo code has reached its usage limit' });
        }

        return NextResponse.json({
            valid: true,
            code: promo.code,
            trial_days: promo.trial_days,
            label: promo.label || `${promo.trial_days}-day free trial`,
        });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        console.error('[Promo] Error:', err);
        return NextResponse.json(
            { valid: false, error: message },
            { status: 500 }
        );
    }
}
