-- Promo Codes Table
-- Used for TikTok/social media outreach campaigns with personalized trial offers

CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    trial_days INTEGER NOT NULL DEFAULT 30,
    label TEXT,              -- e.g. "TikTok Welcome Offer"
    max_uses INTEGER,        -- NULL = unlimited
    current_uses INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,  -- NULL = never expires
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast code lookup
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);

-- RPC function to atomically increment usage counter
CREATE OR REPLACE FUNCTION increment_promo_usage(promo_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE promo_codes
    SET current_uses = current_uses + 1,
        updated_at = now()
    WHERE id = promo_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed some initial promo codes for TikTok outreach
INSERT INTO promo_codes (code, trial_days, label, max_uses) VALUES
    ('WELCOME30', 30, 'TikTok Welcome - 30 day trial', NULL),
    ('VIP60', 60, 'VIP Outreach - 60 day trial', 10),
    ('MERCSYNC14', 14, 'General promo - 14 day trial', NULL)
ON CONFLICT (code) DO NOTHING;
