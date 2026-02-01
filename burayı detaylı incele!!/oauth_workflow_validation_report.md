# OAuth Workflow Validation Report
## ShopiAuto Multi-Platform Authentication Analysis

**Date:** January 25, 2026  
**Analyst:** Senior Solutions Architect  
**Status:** Pre-Production Review

---

## Executive Summary

This document provides a detailed technical validation of the OAuth 2.0 workflows implemented in n8n for four e-commerce platforms: Shopify, Amazon SP-API, TikTok Shop, and Etsy. Each workflow has been cross-referenced against official platform documentation to identify potential issues before deployment.

**Overall Risk Assessment:**
- ✅ **Shopify**: LOW RISK - Implementation appears correct
- ⚠️ **Amazon**: MEDIUM-HIGH RISK - Multiple critical issues identified
- ⚠️ **TikTok Shop**: HIGH RISK - Wrong API endpoints, critical structural issues
- ❌ **Etsy**: CRITICAL RISK - Missing PKCE implementation, will fail authentication

---

## 1. Shopify OAuth Workflow Analysis

### Status: ✅ **PRODUCTION READY** (with minor recommendations)

### Implementation Review

**Start Flow (`/auth/shopify/start`):**
```javascript
// Current implementation generates redirect correctly
// No code shown but redirect to Shopify OAuth is standard
```

**Callback Flow (`/auth/shopify/callback`):**

**✅ CORRECT ASPECTS:**
1. Token exchange endpoint is correct: `https://{shop_domain}/admin/oauth/access_token`
2. Method POST with `application/x-www-form-urlencoded` is correct
3. Required parameters present: `client_id`, `client_secret`, `code`
4. Database upsert logic with `ON CONFLICT` is appropriate
5. State parameter handling via base64url encoding is secure
6. Redirect after success is implemented

**⚠️ ISSUES & RECOMMENDATIONS:**

### **Issue 1: Missing HMAC Validation** (MEDIUM SEVERITY)
**Problem:** The callback does not verify the HMAC signature that Shopify sends with the authorization code.

**Documentation Reference:** [Shopify OAuth Security](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant)

**Impact:** Potential CSRF vulnerability - an attacker could forge callback requests.

**Fix Required:**
```javascript
// Add HMAC validation before token exchange
const crypto = require('crypto');

const query = $json.query;
const hmac = query.hmac;
delete query.hmac;

// Sort params alphabetically and build query string
const sortedParams = Object.keys(query).sort().map(key => `${key}=${query[key]}`).join('&');

// Calculate HMAC
const hash = crypto
  .createHmac('sha256', 'SHOPIFY_CLIENT_SECRET_PLACEHOLDER') // client_secret
  .update(sortedParams)
  .digest('hex');

if (hash !== hmac) {
  throw new Error('HMAC validation failed');
}
```

### **Issue 2: State Validation Not Enforced** (MEDIUM SEVERITY)
**Problem:** While state is generated and passed, the callback doesn't validate it against a stored value.

**Fix Required:**
- Store state in Redis/session when generating
- Validate in callback before proceeding

### **Issue 3: Hardcoded Credentials** (HIGH SEVERITY - SECURITY)
**Problem:** `client_id` and `client_secret` are hardcoded in the workflow.

**Fix Required:**
- Move to environment variables or Supabase Vault
- Never commit these to version control

### **Issue 4: Missing Scope Verification** (LOW SEVERITY)
**Problem:** Should verify returned scopes match requested scopes.

**Fix:** Add scope check after token exchange:
```javascript
const grantedScopes = $json.scope.split(',');
const requestedScopes = ['read_products', 'write_products']; // your scopes
if (!requestedScopes.every(s => grantedScopes.includes(s))) {
  throw new Error('Not all requested scopes were granted');
}
```

### **Recommendation Summary for Shopify:**
1. ✅ Core flow is correct
2. ⚠️ Add HMAC validation immediately
3. ⚠️ Implement proper state validation
4. ❌ Remove hardcoded credentials before production
5. ℹ️ Consider adding scope verification

---

## 2. Amazon SP-API OAuth Workflow Analysis

### Status: ⚠️ **NEEDS MAJOR REVISION BEFORE TESTING**

### Critical Documentation Insights

According to Amazon SP-API documentation, the authorization flow has **TWO separate steps** with **DIFFERENT token endpoints**:

1. **Authorization Code Exchange** (what you're implementing)
2. **Access Token Request** (missing from your workflow)

### Implementation Review

**Start Flow (`/auth/amazon/start`):**

**❌ CRITICAL ISSUE 1: Missing Application ID**
```javascript
// Current:
application_id: 'BURAYA_APP_ID_GELECEK' // Placeholder!

// Required:
// You must get actual Application ID from Amazon Developer Console
```

**❌ CRITICAL ISSUE 2: Incorrect Authorization URL Format**

**Current Implementation:**
```
https://sellercentral.amazon.com/apps/authorize/consent?application_id={app_id}&state={state}&version=beta
```

**Correct Format (per documentation):**
```
https://sellercentral.amazon.com/apps/authorize/consent
```

**Note:** The `version=beta` parameter is ONLY for testing draft applications. For production, this must be removed. This is correctly noted in your research report.

**Callback Flow (`/auth/amazon/callback`):**

**❌ CRITICAL ISSUE 3: Wrong Token Endpoint**

**Your Implementation:**
```javascript
POST https://api.amazon.com/auth/o2/token
```

**This is CORRECT** ✅ for the first step (exchanging authorization code for refresh token).

**❌ BUT MISSING STEP 2:**  
Amazon requires a **second step** to get the actual access token used for API calls:

```javascript
// Step 2 (MISSING):
POST https://api.amazon.com/auth/o2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={the_refresh_token_from_step_1}
&client_id={your_client_id}
&client_secret={your_client_secret}
```

**❌ CRITICAL ISSUE 4: Missing AWS IAM Credentials**

The research report explicitly states:

> "Every HTTP request to the SP-API must include the access_token in the header AND be signed using AWS IAM credentials (Access Key and Secret Key)"

**Your database schema (`0011_amazon_schema_sync.sql`) stores:**
- ✅ `amazon_access_token`
- ✅ `amazon_refresh_token`  
- ✅ `amazon_region`

**But MISSING:**
- ❌ AWS Access Key ID
- ❌ AWS Secret Access Key
- ❌ AWS Role ARN

**These are REQUIRED** for every SP-API request. Without them, you cannot make API calls even with a valid access token.

**❌ CRITICAL ISSUE 5: Database Update Query Issues**

```sql
UPDATE public.shops
SET 
  amazon_connected = true,
  is_active = true,
  amazon_seller_id = '{{ $node["Prepare Input"].json["seller_id"] }}',
  amazon_refresh_token = '{{ $node["Exchange Code"].json["refresh_token"] }}',
  amazon_access_token = '{{ $node["Exchange Code"].json["access_token"] }}',
  amazon_token_expires_at = NOW() + INTERVAL '1 hour',
  ...
```

**Problems:**
1. Access tokens from LWA expire in **1 hour**, but you're storing them. You should **ONLY** store the refresh token and generate access tokens on-demand.
2. The `seller_id` should come from `selling_partner_id` in the callback, not `seller_id`.

**Callback Parameters (per documentation):**
```javascript
// Amazon sends these to your redirect URI:
{
  "spapi_oauth_code": "...",     // Authorization code
  "state": "...",                // Your state string
  "selling_partner_id": "..."    // The seller's ID
}
```

**⚠️ ISSUE 6: Hardcoded Credentials Again**
```javascript
client_id: "amzn1.application-oa2-client.2eed5b37c83843f28d4a95286016e5",
client_secret: "amzn1.oa2-cs.v1.9643b2f1facb6e9b1f4bf4f392fb689f66c5a5e70bd3f7acf5ab12a89c79ed04"
```

These must be environment variables.

### **Corrected Amazon Workflow Structure:**

```javascript
// Start Flow:
1. Generate state with owner_id
2. Build correct authorization URL:
   https://sellercentral.amazon.com/apps/authorize/consent
   ?application_id={YOUR_ACTUAL_APP_ID}
   &state={base64_encoded_state}
   &version=beta  // REMOVE in production

// Callback Flow:
1. Receive: spapi_oauth_code, selling_partner_id, state
2. Validate state
3. Exchange code for refresh_token:
   POST https://api.amazon.com/auth/o2/token
   {
     grant_type: 'authorization_code',
     code: spapi_oauth_code,
     client_id: process.env.AMAZON_CLIENT_ID,
     client_secret: process.env.AMAZON_CLIENT_SECRET
   }
   → Returns: { access_token, refresh_token, expires_in }
   
4. Get access token (for immediate use):
   POST https://api.amazon.com/auth/o2/token
   {
     grant_type: 'refresh_token',
     refresh_token: {from_step_3},
     client_id: process.env.AMAZON_CLIENT_ID,
     client_secret: process.env.AMAZON_CLIENT_SECRET
   }

5. Store in database:
   - amazon_seller_id = selling_partner_id
   - amazon_refresh_token = refresh_token (encrypted!)
   - amazon_marketplace_id = 'A33AVAJ2PDY3EV' (Turkey/Europe)
   - amazon_region = 'eu-west-1'
   - DO NOT store access_token (generate on-demand)

6. SEPARATELY: Configure AWS IAM
   - This cannot be done via OAuth
   - Must be manually configured in AWS Console
   - Store AWS credentials separately (encrypted!)
```

### **Amazon Recommendation Summary:**
1. ❌ Complete rewrite required
2. ❌ Add missing second token exchange step
3. ❌ Remove access_token storage (use refresh_token pattern)
4. ❌ Add AWS IAM credential management (separate process)
5. ⚠️ Replace placeholders with actual Application ID
6. ❌ Fix callback parameter parsing (spapi_oauth_code, selling_partner_id)
7. ❌ Add proper state validation
8. ❌ Move credentials to environment variables

---

## 3. TikTok Shop OAuth Workflow Analysis

### Status: ❌ **CRITICAL - WRONG API PLATFORM**

### **CRITICAL ERROR: Using Wrong TikTok API**

Your workflow is using the **TikTok Developer API** (for social login/content) instead of the **TikTok Shop Seller API**.

**Your Implementation:**
```javascript
GET https://services.tiktokshop.com/open/authorize?app_key=...

POST https://auth.tiktok-shops.com/api/v2/token/get
```

**❌ THIS IS WRONG** - These endpoints are for **TikTok Shop** but the token exchange endpoint is incorrect.

### **Correct TikTok Shop Seller Authorization Flow:**

According to TikTok Shop Partner Center documentation, the flow is:

**Step 1: Authorization (CORRECT in your workflow):**
```
https://services.tiktokshop.com/open/authorize
?app_key={YOUR_APP_KEY}
&state={YOUR_STATE}
```

**Step 2: Token Exchange (WRONG in your workflow):**

**Your current endpoint:**
```
POST https://auth.tiktok-shops.com/api/v2/token/get
```

**Correct endpoint:**
```
POST https://auth.tiktokshop.com/api/v2/token/get
```
**OR (for Global API):**
```
POST https://open-api.tiktokglobalshop.com/authorization/202309/token
```

### **Issues with Current Implementation:**

**❌ ISSUE 1: Incorrect Token Endpoint**
The endpoint `auth.tiktok-shops.com` doesn't match any official TikTok Shop documentation. Based on research, it should be:
- `auth.tiktokshop.com` (regional)
- OR `open-api.tiktokglobalshop.com` (global)

**❌ ISSUE 2: Missing Required Parameters**

**Current (in "Prepare Params"):**
```javascript
{
  app_key: "6ispb8b0uinvi",
  app_secret: "8d22f4e7a060780a62b123660753af076a73c0a5",
  auth_code: code,
  grant_type: "authorized_code"
}
```

**Correct (per TikTok Shop docs):**
```javascript
{
  app_key: "6ispb8b0uinvi",
  app_secret: "8d22f4e7a060780a62b123660753af076a73c0a5",
  auth_code: code,
  grant_type: "authorized_code"
}
```

Actually, your parameters look correct, BUT the grant_type value might need to be `authorization_code` (standard OAuth term) instead of `authorized_code`. **This needs verification from official docs.**

**❌ ISSUE 3: Missing Signature Calculation**

According to your research report:

> "TikTok's refresh tokens are single-use and rotate frequently"

> "In addition to the OAuth token, API calls often require a calculated sign parameter (HMAC-SHA256 of the sorted query parameters)"

**Your workflow does NOT calculate the `sign` parameter** required for TikTok Shop API calls.

**❌ ISSUE 4: Response Handling**

TikTok Shop returns:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "access_token": "ROW_xxx",
    "access_token_expire_in": 1209600,
    "refresh_token": "ROT_xxx",
    "refresh_token_expire_in": 7776000,
    "open_id": "xxx",
    "seller_name": "xxx",
    "seller_base_region": "US",
    "user_type": 0
  }
}
```

**Your workflow doesn't extract from `data.access_token`** - it tries to access `$json.access_token` directly, which will fail.

**❌ ISSUE 5: Database Fields Incomplete**

You need to store:
- ✅ `tiktok_access_token`
- ✅ `tiktok_refresh_token`
- ❌ `tiktok_shop_cipher` (CRITICAL - needed for ALL API calls)
- ❌ `tiktok_open_id`
- ❌ `access_token_expire_at`
- ❌ `refresh_token_expire_at`

The `shop_cipher` is required for making any TikTok Shop API requests.

### **Corrected TikTok Shop Workflow:**

```javascript
// Start Flow - CORRECT
GET https://services.tiktokshop.com/open/authorize
  ?app_key={app_key}
  &state={base64_state}

// Callback Flow - NEEDS MAJOR FIXES
1. Receive code + state
2. Validate state
3. Token Exchange:
   POST https://auth.tiktokshop.com/api/v2/token/get
   // OR for US sellers:
   POST https://open-api.tiktokglobalshop.com/authorization/202309/token
   
   Content-Type: application/json
   {
     "app_key": "xxx",
     "app_secret": "xxx",
     "auth_code": "xxx",
     "grant_type": "authorized_code"  // or "authorization_code" - VERIFY!
   }

4. Extract from response.data:
   const tokenData = response.data;
   
5. Get shop info (to get cipher):
   POST /api/authorization/202309/shops
   {
     "app_key": "xxx",
     "app_secret": "xxx",
     "access_token": tokenData.access_token
   }
   // This returns shop_cipher which is REQUIRED for all future calls

6. Store in database:
   - tiktok_connected = true
   - tiktok_access_token = tokenData.access_token (encrypted!)
   - tiktok_refresh_token = tokenData.refresh_token (encrypted!)
   - tiktok_shop_id = shop_info.shop_id
   - tiktok_shop_cipher = shop_info.cipher (CRITICAL!)
   - tiktok_access_expires_at = NOW() + tokenData.access_token_expire_in seconds
   - tiktok_refresh_expires_at = NOW() + tokenData.refresh_token_expire_in seconds
```

### **TikTok Shop Recommendation Summary:**
1. ❌ Fix token endpoint URL (verify correct domain)
2. ❌ Add response parsing for `data` wrapper object
3. ❌ Add shop info call to get `cipher`
4. ❌ Store cipher, expiration times, and shop_id
5. ⚠️ Verify grant_type parameter value
6. ❌ Implement signature calculation for future API calls
7. ⚠️ Add refresh token rotation handling
8. ❌ Move credentials to environment variables

---

## 4. Etsy OAuth Workflow Analysis

### Status: ❌ **WILL NOT WORK - MISSING PKCE**

### **CRITICAL ERROR: PKCE Not Implemented**

Etsy v3 API **REQUIRES** PKCE (Proof Key for Code Exchange). Your research report states:

> "Mechanism: OAuth 2.0 with Proof Key for Code Exchange (PKCE)"

> "Flow: The SaaS generates a code_verifier (random string) and a code_challenge (SHA-256 hash of the verifier)"

**Your current workflow DOES NOT implement this.** Without PKCE, Etsy will reject your authorization requests.

### **Current Implementation Issues:**

**Start Flow:**

**✅ Correct:**
- Generate random verifier
- State generation

**❌ Missing:**
- SHA-256 hash calculation to create `code_challenge`
- `code_challenge_method=S256` parameter in authorization URL

**Your current "Generate Verifier" node:**
```javascript
// Sadece rastgele metin üretiyoruz (Crypto kütüphanesi gerekmez)
const verifier = [...Array(50)].map(() => (Math.random() * 36 | 0).toString(36)).join('');

return {
  verifier,
  owner_id: $json.query.user_id
};
```

**Problems:**
1. ✅ Verifier generation is OK (though should be 128 chars, not 50)
2. ❌ No code_challenge generation
3. ❌ code_challenge should be base64url(SHA256(verifier))

**Your "Crypto Node" configuration:**
```javascript
// Uses n8n Crypto node on verifier
// But doesn't specify SHA-256 or base64url encoding!
```

**⚠️ The Crypto node may be misconfigured** - need to verify it's doing SHA-256 and base64url encoding.

**Your "Finalize Params" node:**
```javascript
// 1. Crypto düğümünden gelen çıktıyı (data) URL-safe yapıyoruz
const challenge = $json.data
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');
```

**❌ This is backwards!** The crypto node should OUTPUT base64, then you convert to base64url. But we need to verify the crypto node is doing SHA-256.

### **Correct PKCE Implementation:**

```javascript
// Generate Verifier (128 characters)
const crypto = require('crypto');
const verifier = crypto.randomBytes(64).toString('base64url');
// Result example: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

// Generate Challenge (SHA-256 hash of verifier, base64url encoded)
const hash = crypto.createHash('sha256').update(verifier).digest();
const challenge = hash.toString('base64url');
// Must use base64url encoding: no +, /, or = characters

// Store verifier for use in token exchange
// (You're doing this correctly via state)

// Build authorization URL:
https://www.etsy.com/oauth/connect
  ?response_type=code
  &redirect_uri=https://n8n.erenmuhammedortakvps.store/webhook/auth/etsy/callback
  &scope=listings_r%20transactions_r%20email_r
  &client_id=9emxt80uz4il21hrfmehdmh5
  &state={base64_encoded_state_with_owner_and_verifier}
  &code_challenge={challenge}
  &code_challenge_method=S256
```

### **Token Exchange Issues:**

**Callback Flow - "Etsy Token Exchange" Node:**

**Current:**
```javascript
POST https://api.etsy.com/v3/public/oauth/token
Content-Type: application/x-www-form-urlencoded
```

**❌ CRITICAL: Missing `code_verifier` parameter!**

**Correct request:**
```
POST https://api.etsy.com/v3/public/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={code_from_callback}
&redirect_uri=https://n8n.erenmuhammedortakvps.store/webhook/auth/etsy/callback
&client_id=9emxt80uz4il21hrfmehdmh5
&code_verifier={verifier_from_state}
```

**Note:** Etsy does NOT use `client_secret` in the token request when using PKCE. This is the whole point of PKCE - to enable public clients.

### **Database Update Issues:**

```sql
UPDATE public.shops
SET 
  etsy_connected = true,
  etsy_access_token = '{{ $json.access_token }}',
  etsy_refresh_token = '{{ $json.refresh_token }}',
  etsy_token_expires_at = NOW() + INTERVAL '1 hour',
  etsy_shop_id = '{{ $json.access_token.split(".")[0] }}', -- ❌ WRONG!
```

**Problems:**
1. ❌ `etsy_shop_id` extraction is wrong - you can't split access_token
2. ✅ Storing refresh_token is correct
3. ⚠️ Should extract `user_id` from token response (it's returned separately)

**Etsy token response:**
```json
{
  "access_token": "1234567890.abcdefg...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "1234567890.hijklmn...",
  "user_id": "1234567890"  // ← Use this for shop_id
}
```

### **Corrected Etsy Workflow:**

```javascript
// Start Flow:
1. Generate code_verifier (128 chars, base64url)
2. Generate code_challenge = SHA256(verifier).base64url()
3. Encode state with { owner_id, verifier }
4. Redirect to:
   https://www.etsy.com/oauth/connect
     ?response_type=code
     &redirect_uri={your_callback}
     &scope=listings_r%20transactions_r%20email_r
     &client_id={your_client_id}
     &state={base64_state}
     &code_challenge={challenge}
     &code_challenge_method=S256

// Callback Flow:
1. Receive code + state
2. Decode state to get { owner_id, verifier }
3. Exchange code for token:
   POST https://api.etsy.com/v3/public/oauth/token
   Content-Type: application/x-www-form-urlencoded
   
   grant_type=authorization_code
   &code={code}
   &redirect_uri={same_as_start}
   &client_id={your_client_id}
   &code_verifier={verifier_from_state}  // ← CRITICAL!

4. Store response:
   - etsy_access_token = access_token (encrypted!)
   - etsy_refresh_token = refresh_token (encrypted!)
   - etsy_shop_id = user_id  // ← Use user_id field
   - etsy_token_expires_at = NOW() + expires_in seconds
```

### **Etsy Recommendation Summary:**
1. ❌ Implement proper PKCE (SHA-256 + base64url)
2. ❌ Add `code_verifier` to token exchange
3. ❌ Fix shop_id extraction (use `user_id` from response)
4. ❌ Verify Crypto node is configured for SHA-256
5. ❌ Increase verifier length to 128 characters
6. ❌ Remove `client_secret` from token request
7. ❌ Move client_id to environment variables

---

## Cross-Platform Security Issues

### 1. **Hardcoded Credentials** (ALL PLATFORMS - CRITICAL)

Every single workflow has hardcoded API credentials:

```javascript
// Shopify:
client_id: "SHOPIFY_CLIENT_ID_PLACEHOLDER"
client_secret: "SHOPIFY_CLIENT_SECRET_PLACEHOLDER"

// Amazon:
client_id: "AMAZON_CLIENT_ID_PLACEHOLDER"
client_secret: "AMAZON_CLIENT_SECRET_PLACEHOLDER"

// TikTok:
app_key: "TIKTOK_APP_KEY_PLACEHOLDER"
app_secret: "TIKTOK_APP_SECRET_PLACEHOLDER"

// Etsy:
client_id: "ETSY_CLIENT_ID_PLACEHOLDER"
```

**❌ CRITICAL SECURITY VIOLATION**

**Action Required:**
1. Create environment variables in n8n
2. Use `{{$env.SHOPIFY_CLIENT_ID}}` syntax
3. OR store in Supabase Vault and fetch dynamically
4. **NEVER commit these to Git**

### 2. **Missing Rate Limit Handling** (ALL PLATFORMS)

None of the workflows implement rate limit detection or backoff strategies.

**Recommendation:**
- Add error detection for 429 status codes
- Implement exponential backoff
- Use the Redis rate limiter pattern described in your WBS document

### 3. **Insufficient Error Logging** (ALL PLATFORMS)

None of the workflows log errors to a centralized system for debugging.

**Recommendation:**
- Add error logging to Supabase `webhook_events` or similar table
- Include: platform, error_message, request_payload, timestamp

### 4. **No Webhook Signature Verification** (WHERE APPLICABLE)

While these are OAuth flows (not webhooks), you should implement signature verification for callbacks where available:
- Shopify: ✅ HMAC verification needed
- Amazon: ⚠️ State validation
- TikTok: ⚠️ State validation + signature for API calls
- Etsy: ⚠️ State validation

---

## Database Schema Validation

### Required Schema Updates

Based on the analysis, your database schema needs these additions:

```sql
-- Add to shops table:

-- Amazon (CRITICAL - for AWS IAM signing)
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS amazon_aws_access_key_id text,
ADD COLUMN IF NOT EXISTS amazon_aws_secret_access_key text,
ADD COLUMN IF NOT EXISTS amazon_aws_role_arn text;

-- TikTok Shop (CRITICAL - required for all API calls)
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS tiktok_shop_cipher text,
ADD COLUMN IF NOT EXISTS tiktok_open_id text,
ADD COLUMN IF NOT EXISTS tiktok_access_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS tiktok_refresh_expires_at timestamptz;

-- Etsy (FIX - user_id instead of parsing token)
-- Already exists, just fix the insert logic

-- ALL PLATFORMS: Add token refresh tracking
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS last_token_refresh_at timestamptz,
ADD COLUMN IF NOT EXISTS token_refresh_failed_at timestamptz,
ADD COLUMN IF NOT EXISTS token_refresh_error text;
```

---

## Priority Action Plan

### **IMMEDIATE (Before Any Testing):**

1. ❌ **Remove all hardcoded credentials**
   - Severity: CRITICAL
   - Platforms: ALL
   - Action: Move to environment variables

2. ❌ **Fix Etsy PKCE implementation**
   - Severity: CRITICAL (will fail 100%)
   - Platform: Etsy
   - Action: Implement SHA-256 code challenge + add code_verifier to token exchange

3. ❌ **Fix TikTok Shop token endpoint**
   - Severity: CRITICAL (will fail 100%)
   - Platform: TikTok Shop
   - Action: Correct endpoint URL + response parsing

4. ❌ **Complete Amazon workflow**
   - Severity: HIGH (missing critical components)
   - Platform: Amazon
   - Action: Add refresh token exchange, remove access token storage, document AWS IAM requirements

### **HIGH PRIORITY (Before Production):**

5. ⚠️ **Add HMAC validation to Shopify**
   - Severity: HIGH (security risk)
   - Platform: Shopify
   - Action: Implement HMAC verification in callback

6. ⚠️ **Implement state validation**
   - Severity: MEDIUM (security + reliability)
   - Platforms: ALL
   - Action: Store state in Redis, validate in callback

7. ⚠️ **Add database schema updates**
   - Severity: HIGH (missing required fields)
   - Platforms: Amazon, TikTok Shop
   - Action: Run SQL migrations

### **MEDIUM PRIORITY:**

8. ℹ️ **Add comprehensive error logging**
   - Severity: MEDIUM (debugging difficulty)
   - Platforms: ALL
   - Action: Log all errors to database

9. ℹ️ **Implement rate limit handling**
   - Severity: MEDIUM (operational resilience)
   - Platforms: ALL
   - Action: Detect 429, implement backoff

### **LOW PRIORITY:**

10. ℹ️ **Add scope verification**
    - Severity: LOW (best practice)
    - Platforms: Shopify, Etsy
    - Action: Verify granted scopes match requested

---

## Testing Recommendations

### Testing Order (After Fixes):

1. **Shopify** (easiest, best documented)
   - Use development store
   - Test with actual OAuth flow
   - Verify token storage and database update
   - Test token refresh (if implementing)

2. **Etsy** (after PKCE fix)
   - Use your own shop
   - Test complete flow including PKCE
   - Verify code_verifier is correctly passed
   - Check user_id extraction

3. **TikTok Shop** (after endpoint fix)
   - Use sandbox environment
   - Test token exchange
   - Verify cipher retrieval
   - Test signature calculation

4. **Amazon** (last, most complex)
   - Will require Professional Seller account ($39.99/month)
   - Test authorization code flow
   - Test refresh token exchange
   - Document AWS IAM setup separately

### Test Checklist Per Platform:

- [ ] Start flow generates correct authorization URL
- [ ] Redirect to platform works
- [ ] Platform redirects back to callback with code
- [ ] State validation passes
- [ ] Token exchange succeeds
- [ ] Tokens stored in database (encrypted)
- [ ] Database record created/updated correctly
- [ ] Redirect to frontend works
- [ ] Can retrieve tokens from database
- [ ] Platform-specific requirements met (HMAC, PKCE, cipher, etc.)

---

## Documentation Gaps

The following should be documented for the team:

1. **AWS IAM Setup Guide for Amazon SP-API**
   - How to create IAM user
   - How to create execution role
   - How to attach policies
   - How to get credentials

2. **Environment Variables Configuration**
   - List of all required env vars
   - How to set them in n8n
   - How to reference them in workflows

3. **Token Refresh Procedures**
   - When to refresh (expiration times)
   - How to handle refresh failures
   - Emergency re-authorization procedures

4. **Platform-Specific Gotchas**
   - Amazon: AWS IAM required
   - TikTok: Refresh tokens rotate
   - Etsy: PKCE required, no client_secret
   - Shopify: HMAC verification required

---

## Conclusion

**Current Status:** None of the workflows are production-ready. All require fixes ranging from minor (Shopify) to critical (Etsy, TikTok, Amazon).

**Estimated Time to Fix:**
- Shopify: 2-4 hours (add HMAC + state validation)
- Etsy: 4-6 hours (implement PKCE correctly)
- TikTok Shop: 6-8 hours (fix endpoints + add cipher logic)
- Amazon: 8-12 hours (complete missing steps + AWS IAM documentation)

**Total:** 20-30 hours of development work

**Blocker for Production:**
- **CRITICAL:** Hardcoded credentials must be removed
- **CRITICAL:** Etsy PKCE must be implemented
- **CRITICAL:** TikTok Shop endpoints must be corrected
- **HIGH:** Amazon workflow must be completed

**Recommendation:**
1. Start with Shopify (lowest risk, highest success rate)
2. Use it to validate the overall architecture
3. Then tackle Etsy and TikTok Shop
4. Save Amazon for last (highest complexity)

Do not deploy ANY workflow to production until:
- ✅ Credentials are externalized
- ✅ Platform-specific requirements implemented (PKCE, HMAC, etc.)
- ✅ Testing completed with actual platform responses
- ✅ Database schema updated
- ✅ Error handling added

---

**Report Prepared By:** Senior Solutions Architect  
**Review Status:** Pre-Production Technical Audit  
**Next Review:** After fixes implemented and testing completed
