# SHOPIAUTO OAUTH WORKFLOWS - DEPLOYMENT GUIDE

## 📋 Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Variables Setup](#environment-variables-setup)
3. [Database Migrations](#database-migrations)
4. [Workflow Import Order](#workflow-import-order)
5. [Testing Guide](#testing-guide)
6. [Production Deployment](#production-deployment)

---

## Pre-Deployment Checklist

### ✅ Required Accounts & Registrations

| Platform | Requirement | Cost | Status |
|----------|------------|------|--------|
| **Shopify** | Partner Account | FREE | [ ] |
| **Etsy** | Developer Account | FREE | [ ] |
| **TikTok Shop** | Partner Center (KYC) | FREE | [ ] |
| **Amazon** | Professional Seller + Dev Profile | $39.99/mo | [ ] |

### ✅ Technical Prerequisites

- [ ] n8n instance deployed and accessible
- [ ] PostgreSQL/Supabase database configured
- [ ] Redis instance available (for state storage - optional but recommended)
- [ ] SSL certificate installed (HTTPS required for callbacks)
- [ ] Domain/subdomain configured for n8n webhooks

---

## Environment Variables Setup

### Where to Configure

**In n8n:**
1. Navigate to Settings → Environment Variables
2. Add each variable below
3. Save and restart n8n

**Alternative (Docker):**
Add to `docker-compose.yml` or `.env` file

### Required Variables

```bash
# ===== SHOPIFY =====
SHOPIFY_CLIENT_ID=your_shopify_api_key
SHOPIFY_CLIENT_SECRET=your_shopify_api_secret
SHOPIFY_REDIRECT_URI=https://your-n8n-domain.com/webhook/auth/shopify/callback

# ===== ETSY =====
ETSY_CLIENT_ID=your_etsy_keystring
ETSY_REDIRECT_URI=https://your-n8n-domain.com/webhook/auth/etsy/callback

# ===== TIKTOK SHOP =====
TIKTOK_APP_KEY=your_tiktok_app_key
TIKTOK_APP_SECRET=your_tiktok_app_secret

# ===== AMAZON SP-API =====
AMAZON_APPLICATION_ID=your_amazon_app_id
AMAZON_CLIENT_ID=amzn1.application-oa2-client.xxxxx
AMAZON_CLIENT_SECRET=amzn1.oa2-cs.v1.xxxxx
AMAZON_REDIRECT_URI=https://your-n8n-domain.com/webhook/auth/amazon/callback

# AWS IAM (for SP-API requests)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_ROLE_ARN=arn:aws:iam::123456789012:role/YourSPAPIRole

# ===== GENERAL =====
FRONTEND_URL=https://your-frontend-domain.com
```

### How to Get Credentials

#### Shopify
1. Go to https://partners.shopify.com/
2. Create Partner Account (free)
3. Apps → Create App → Custom App
4. Copy API Key (Client ID) and API Secret Key (Client Secret)
5. Set Redirect URL: `https://your-n8n-domain.com/webhook/auth/shopify/callback`

#### Etsy
1. Go to https://www.etsy.com/developers/
2. Sign in with Etsy account
3. Register Your App
4. Copy Keystring (Client ID)
5. Set Redirect URI: `https://your-n8n-domain.com/webhook/auth/etsy/callback`
6. Request permissions: `listings_r`, `transactions_r`, `email_r`

#### TikTok Shop
1. Go to https://partner.tiktokshop.com/
2. Complete KYC verification (ID upload required)
3. Create Developer App
4. Copy App Key and App Secret
5. TikTok redirects to your callback automatically

#### Amazon SP-API
1. Create Professional Seller Account ($39.99/month)
2. Go to https://developer-docs.amazon.com/sp-api/
3. Register as Developer
4. Create App → Draft App
5. Copy LWA Client ID and Client Secret
6. Set OAuth Redirect URI
7. **Separately:** Set up AWS IAM (see Amazon workflow doc)

---

## Database Migrations

Run these SQL migrations in **order** before importing workflows:

### Migration 1: Add OAuth Columns

```sql
-- Run in Supabase SQL Editor or psql

-- Shopify (already exists in base schema)
-- No changes needed

-- Etsy
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS etsy_connected boolean default false,
ADD COLUMN IF NOT EXISTS etsy_access_token text,
ADD COLUMN IF NOT EXISTS etsy_refresh_token text,
ADD COLUMN IF NOT EXISTS etsy_shop_id text,
ADD COLUMN IF NOT EXISTS etsy_token_expires_at timestamptz;

-- TikTok Shop
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS tiktok_connected boolean default false,
ADD COLUMN IF NOT EXISTS tiktok_access_token text,
ADD COLUMN IF NOT EXISTS tiktok_refresh_token text,
ADD COLUMN IF NOT EXISTS tiktok_shop_id text,
ADD COLUMN IF NOT EXISTS tiktok_shop_cipher text,  -- CRITICAL!
ADD COLUMN IF NOT EXISTS tiktok_open_id text,
ADD COLUMN IF NOT EXISTS tiktok_access_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS tiktok_refresh_expires_at timestamptz;

-- Amazon SP-API
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS amazon_connected boolean default false,
ADD COLUMN IF NOT EXISTS amazon_seller_id text,
ADD COLUMN IF NOT EXISTS amazon_refresh_token text,
ADD COLUMN IF NOT EXISTS amazon_marketplace_id text default 'A33AVAJ2PDY3EV',
ADD COLUMN IF NOT EXISTS amazon_region text default 'eu-west-1',
ADD COLUMN IF NOT EXISTS amazon_aws_access_key_id text,
ADD COLUMN IF NOT EXISTS amazon_aws_secret_access_key text,
ADD COLUMN IF NOT EXISTS amazon_aws_role_arn text;

-- General
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS last_token_refresh_at timestamptz,
ADD COLUMN IF NOT EXISTS token_refresh_failed_at timestamptz,
ADD COLUMN IF NOT EXISTS token_refresh_error text;
```

### Migration 2: Create Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_shops_etsy_id ON shops(etsy_shop_id);
CREATE INDEX IF NOT EXISTS idx_shops_tiktok_id ON shops(tiktok_shop_id);
CREATE INDEX IF NOT EXISTS idx_shops_amazon_seller ON shops(amazon_seller_id);
```

### Migration 3: Enable Row Level Security (if needed)

```sql
-- Update RLS policies to include new columns
-- (Existing policies from 0003_rls_security.sql should work)
```

---

## Workflow Import Order

Import workflows in this order to avoid dependency issues:

### 1. Shopify OAuth (✅ Lowest Risk)
- File: `shopify_oauth_fixed.md`
- Test first - easiest to debug
- Use Shopify development store for testing

### 2. Etsy OAuth (⚠️ Medium Risk)
- File: `etsy_oauth_fixed.md`
- Requires PKCE implementation
- Test with your own Etsy shop

### 3. TikTok Shop OAuth (⚠️ Medium-High Risk)
- File: `tiktok_oauth_fixed.md`
- Requires sandbox setup
- Must fetch shop_cipher

### 4. Amazon SP-API OAuth (❌ Highest Complexity)
- File: `amazon_oauth_fixed.md`
- Requires AWS IAM setup (manual)
- Most expensive ($39.99/month)

---

## Testing Guide

### Testing Environment Setup

1. **Create Test Data in Supabase**
```sql
-- Create a test user in auth.users (if using Supabase Auth)
-- Or manually insert owner_id for testing

INSERT INTO shops (owner_id, shop_domain, is_active)
VALUES ('test-user-123', 'test-store.myshopify.com', false)
ON CONFLICT DO NOTHING;
```

2. **Test Webhook URLs**
- Start URL: `https://your-n8n.com/webhook/auth/{platform}/start?user_id=test-user-123`
- Callback URL: Configured in platform settings

### Platform-Specific Testing

#### Shopify Testing
```bash
# Test start flow
curl "https://your-n8n.com/webhook/auth/shopify/start?user_id=test-user-123&shop=your-dev-store.myshopify.com"

# Expected: Redirect to Shopify OAuth page
# After authorization: Redirect back to callback
# Expected: Database updated with access_token
```

**Verify:**
```sql
SELECT shop_domain, access_token, is_active 
FROM shops 
WHERE owner_id = 'test-user-123';
```

#### Etsy Testing
```bash
# Test start flow
curl "https://your-n8n.com/webhook/auth/etsy/start?user_id=test-user-123"

# Expected: Redirect to Etsy OAuth with PKCE challenge
```

**Verify PKCE:**
- Check browser DevTools → Network
- Look for `code_challenge` and `code_challenge_method=S256` in URL

#### TikTok Shop Testing
```bash
# Test start flow
curl "https://your-n8n.com/webhook/auth/tiktok/start?user_id=test-user-123"

# Expected: Redirect to TikTok Shop authorization
```

**Critical Verification:**
```sql
SELECT tiktok_shop_cipher FROM shops WHERE owner_id = 'test-user-123';
-- This MUST NOT be null!
```

#### Amazon Testing
```bash
# Test start flow
curl "https://your-n8n.com/webhook/auth/amazon/start?user_id=test-user-123"

# Expected: Redirect to Amazon Seller Central
```

**Verify AWS Setup:**
```sql
SELECT 
  amazon_seller_id,
  amazon_refresh_token IS NOT NULL as has_refresh_token,
  amazon_aws_access_key_id IS NOT NULL as has_aws_key
FROM shops 
WHERE owner_id = 'test-user-123';

-- All three should return TRUE
```

---

## Production Deployment

### Pre-Production Checklist

- [ ] All environment variables configured (no hardcoded values)
- [ ] Database migrations completed
- [ ] SSL certificate valid
- [ ] Webhook URLs whitelisted in platform settings
- [ ] Error logging configured
- [ ] Rate limiting configured (Redis)
- [ ] Token encryption enabled (Supabase Vault or pg_crypto)

### Security Hardening

#### 1. Encrypt Sensitive Tokens

```sql
-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Update storage to use encryption
-- Example for Shopify access token:
UPDATE shops
SET access_token = pgp_sym_encrypt(
  access_token, 
  current_setting('app.encryption_key')
)
WHERE access_token IS NOT NULL;

-- Decrypt when reading:
SELECT 
  pgp_sym_decrypt(access_token::bytea, current_setting('app.encryption_key')) as token
FROM shops;
```

#### 2. Implement State Validation with Redis

```javascript
// In n8n Code node (Start flow):
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

// Store state
await redis.set(`oauth_state:${state}`, nonce, 'EX', 600); // 10 min expiry

// In callback flow:
const storedNonce = await redis.get(`oauth_state:${state}`);
if (!storedNonce) {
  throw new Error('Invalid or expired state');
}
await redis.del(`oauth_state:${state}`);
```

#### 3. Add Rate Limiting

```javascript
// In n8n webhook nodes, add rate limit check:
const redis = new Redis(process.env.REDIS_URL);
const key = `rate_limit:oauth:${ip_address}`;
const count = await redis.incr(key);

if (count === 1) {
  await redis.expire(key, 3600); // 1 hour window
}

if (count > 10) {
  throw new Error('Rate limit exceeded');
}
```

### Monitoring Setup

#### 1. Add Error Logging

```sql
-- Create error log table
CREATE TABLE oauth_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  error_message text,
  error_stack text,
  request_payload jsonb,
  owner_id text,
  created_at timestamptz DEFAULT NOW()
);
```

```javascript
// In n8n error handler:
await db.query(`
  INSERT INTO oauth_errors (platform, error_message, error_stack, owner_id)
  VALUES ($1, $2, $3, $4)
`, [platform, error.message, error.stack, owner_id]);
```

#### 2. Add Success Metrics

```sql
CREATE TABLE oauth_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  event_type text NOT NULL, -- 'start', 'callback', 'success', 'failure'
  owner_id text,
  duration_ms integer,
  created_at timestamptz DEFAULT NOW()
);
```

### Production Environment Variables

Update these for production:

```bash
# Remove version=beta from Amazon
AMAZON_AUTH_URL=https://sellercentral.amazon.com/apps/authorize/consent

# Use production frontend URL
FRONTEND_URL=https://shopiauto.com

# Enable strict HTTPS
WEBHOOK_PROTOCOL=https

# Add encryption key
ENCRYPTION_KEY=your-strong-encryption-key-here
```

### Post-Deployment Verification

Run these queries to verify setup:

```sql
-- Check for any missing required columns
SELECT 
  COUNT(*) FILTER (WHERE etsy_connected) as etsy_count,
  COUNT(*) FILTER (WHERE tiktok_connected) as tiktok_count,
  COUNT(*) FILTER (WHERE amazon_connected) as amazon_count,
  COUNT(*) FILTER (WHERE access_token IS NOT NULL) as shopify_count
FROM shops;

-- Verify indexes exist
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE tablename = 'shops'
ORDER BY indexname;

-- Check for unencrypted tokens (if encryption enabled)
SELECT owner_id, 
  access_token IS NOT NULL as has_shopify,
  etsy_access_token IS NOT NULL as has_etsy
FROM shops
LIMIT 5;
```

---

## Troubleshooting Common Issues

### Issue: "HMAC Validation Failed" (Shopify)
**Cause:** Client secret mismatch or parameter sorting error
**Fix:** Verify `SHOPIFY_CLIENT_SECRET` environment variable matches Shopify Partner Dashboard

### Issue: "Invalid code_verifier" (Etsy)
**Cause:** PKCE implementation error
**Fix:** Verify code_challenge is SHA-256 hash in base64url format

### Issue: "Shop cipher not found" (TikTok)
**Cause:** Shop info API call failed
**Fix:** Check TikTok Shop API signature calculation and permissions

### Issue: "Access Denied" (Amazon)
**Cause:** Missing AWS IAM credentials or incorrect role ARN
**Fix:** Verify AWS IAM setup, ensure role has correct permissions

### Issue: "State parameter invalid"
**Cause:** State expired or not found in Redis
**Fix:** Check Redis connection, increase state expiration time

---

## Rollback Plan

If issues occur in production:

1. **Disable Workflows**
   - In n8n: Deactivate problematic workflows
   - This prevents new OAuth attempts

2. **Restore Database**
```sql
-- Backup before deployment:
pg_dump -U postgres -d shopiauto > backup_pre_oauth.sql

-- Restore if needed:
psql -U postgres -d shopiauto < backup_pre_oauth.sql
```

3. **Revert Environment Variables**
   - Keep old credentials accessible
   - Gradually switch back

4. **Notify Users**
   - If OAuth connections broken, inform users
   - Provide re-authorization link

---

## Success Criteria

Deployment is successful when:

- [ ] All 4 platform workflows imported without errors
- [ ] Environment variables configured and verified
- [ ] Database migrations applied successfully
- [ ] At least one test OAuth flow completed per platform
- [ ] Tokens stored correctly in database
- [ ] No hardcoded credentials in workflows
- [ ] Error logging functional
- [ ] Production URLs configured
- [ ] SSL certificates valid
- [ ] Rate limiting active

---

## Next Steps After Deployment

1. **Implement Token Refresh Workflows**
   - Shopify: Access tokens don't expire (skip)
   - Etsy: Refresh every 50 minutes
   - TikTok: Refresh before expiration (14 days)
   - Amazon: Generate access tokens on-demand

2. **Build Webhook Receivers**
   - Order created/updated
   - Product inventory changed
   - Fulfillment status updates

3. **Implement Sync Workflows**
   - Inventory sync (multi-channel)
   - Order ingestion
   - Product catalog sync

4. **Set Up Monitoring**
   - Token expiration alerts
   - API error rate monitoring
   - Sync failure notifications

---

**Document Version:** 1.0  
**Last Updated:** January 25, 2026  
**Prepared By:** Senior Solutions Architect
