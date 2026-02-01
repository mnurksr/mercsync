# TIKTOK SHOP OAUTH WORKFLOW - CORRECTED VERSION

## n8n Workflow JSON

```json
{
  "name": "TikTok Shop OAuth - Fixed",
  "nodes": [
    {
      "parameters": {
        "path": "auth/tiktok/start",
        "responseMode": "responseNode",
        "options": {}
      },
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 0],
      "id": "tiktok-start-webhook",
      "name": "Start Webhook"
    },
    {
      "parameters": {
        "jsCode": "const user_id = ($json.query.user_id || '').toString().trim();\nif (!user_id) {\n  throw new Error('Missing user_id parameter');\n}\n\n// Generate state with owner_id\nconst statePayload = {\n  owner_id: user_id,\n  nonce: Math.random().toString(36).substring(2),\n  timestamp: Date.now()\n};\n\nconst stateJson = JSON.stringify(statePayload);\nconst state = Buffer.from(stateJson).toString('base64')\n  .replace(/\\+/g, '-')\n  .replace(/\\//g, '_')\n  .replace(/=+$/g, '');\n\nconst appKey = $env.TIKTOK_APP_KEY;\nconst authUrl = `https://services.tiktokshop.com/open/authorize?app_key=${appKey}&state=${state}`;\n\nreturn {\n  json: {\n    auth_url: authUrl,\n    state: state\n  }\n};"
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [200, 0],
      "id": "generate-auth-url",
      "name": "Generate Auth URL"
    },
    {
      "parameters": {
        "respondWith": "redirect",
        "redirectURL": "={{$json.auth_url}}",
        "options": {}
      },
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.5,
      "position": [400, 0],
      "id": "redirect-to-tiktok",
      "name": "Redirect to TikTok"
    },
    {
      "parameters": {
        "path": "auth/tiktok/callback",
        "responseMode": "responseNode",
        "options": {}
      },
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 300],
      "id": "callback-webhook",
      "name": "Callback Webhook"
    },
    {
      "parameters": {
        "jsCode": "const query = $json.query || {};\nconst code = query.code;\nconst state = query.state;\n\nif (!code || !state) {\n  throw new Error('Missing code or state parameter');\n}\n\n// Decode state\nfunction base64UrlToString(input) {\n  const pad = '='.repeat((4 - (input.length % 4)) % 4);\n  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');\n  return Buffer.from(b64, 'base64').toString('utf8');\n}\n\nlet owner_id;\ntry {\n  const decoded = base64UrlToString(state);\n  const parsed = JSON.parse(decoded);\n  owner_id = parsed.owner_id;\n} catch (e) {\n  throw new Error('Invalid state parameter');\n}\n\nreturn {\n  json: {\n    code: code,\n    owner_id: owner_id,\n    app_key: $env.TIKTOK_APP_KEY,\n    app_secret: $env.TIKTOK_APP_SECRET\n  }\n};"
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [200, 300],
      "id": "prepare-callback",
      "name": "Prepare Callback Data"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://auth.tiktokshop.com/api/v2/token/get",
        "sendBody": true,
        "contentType": "json",
        "bodyParameters": {
          "parameters": [
            {
              "name": "app_key",
              "value": "={{$json.app_key}}"
            },
            {
              "name": "app_secret",
              "value": "={{$json.app_secret}}"
            },
            {
              "name": "auth_code",
              "value": "={{$json.code}}"
            },
            {
              "name": "grant_type",
              "value": "authorized_code"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [400, 300],
      "id": "exchange-token",
      "name": "Exchange Token"
    },
    {
      "parameters": {
        "jsCode": "const response = $json;\n\n// TikTok Shop wraps response in data object\nif (!response.data || response.code !== 0) {\n  const errorMsg = response.message || 'Unknown error from TikTok Shop';\n  throw new Error(`TikTok token exchange failed: ${errorMsg}`);\n}\n\nconst tokenData = response.data;\n\nif (!tokenData.access_token || !tokenData.refresh_token) {\n  throw new Error('Missing tokens in TikTok response');\n}\n\n// Calculate expiration times\nconst accessExpiresAt = new Date(Date.now() + (tokenData.access_token_expire_in * 1000));\nconst refreshExpiresAt = new Date(Date.now() + (tokenData.refresh_token_expire_in * 1000));\n\nreturn {\n  json: {\n    owner_id: $('Prepare Callback Data').item.json.owner_id,\n    access_token: tokenData.access_token,\n    refresh_token: tokenData.refresh_token,\n    open_id: tokenData.open_id,\n    seller_name: tokenData.seller_name,\n    seller_region: tokenData.seller_base_region,\n    access_expires_at: accessExpiresAt.toISOString(),\n    refresh_expires_at: refreshExpiresAt.toISOString()\n  }\n};"
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [600, 300],
      "id": "parse-token-response",
      "name": "Parse Token Response"
    },
    {
      "parameters": {
        "jsCode": "const crypto = require('crypto');\n\nconst app_key = $env.TIKTOK_APP_KEY;\nconst app_secret = $env.TIKTOK_APP_SECRET;\nconst access_token = $json.access_token;\nconst timestamp = Math.floor(Date.now() / 1000);\n\n// TikTok requires signature for API calls\n// Sign = HMAC-SHA256(app_secret, concatenated_string)\nconst path = '/api/shop/get_authorized_shop';\nconst params = {\n  app_key: app_key,\n  timestamp: timestamp,\n  access_token: access_token\n};\n\n// Sort parameters alphabetically\nconst sortedParams = Object.keys(params)\n  .sort()\n  .map(key => `${key}${params[key]}`)\n  .join('');\n\nconst signString = app_secret + path + sortedParams + app_secret;\nconst sign = crypto.createHmac('sha256', app_secret)\n  .update(signString)\n  .digest('hex');\n\nreturn {\n  json: {\n    app_key: app_key,\n    timestamp: timestamp,\n    access_token: access_token,\n    sign: sign\n  }\n};"
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [800, 300],
      "id": "prepare-shop-request",
      "name": "Prepare Shop Info Request"
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://open-api.tiktokshop.com/api/shop/get_authorized_shop",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            {
              "name": "app_key",
              "value": "={{$json.app_key}}"
            },
            {
              "name": "timestamp",
              "value": "={{$json.timestamp}}"
            },
            {
              "name": "access_token",
              "value": "={{$json.access_token}}"
            },
            {
              "name": "sign",
              "value": "={{$json.sign}}"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1000, 300],
      "id": "get-shop-info",
      "name": "Get Shop Info (for Cipher)"
    },
    {
      "parameters": {
        "jsCode": "const shopResponse = $json;\n\nif (!shopResponse.data || shopResponse.code !== 0) {\n  const errorMsg = shopResponse.message || 'Failed to get shop info';\n  throw new Error(`TikTok shop info failed: ${errorMsg}`);\n}\n\nconst shopData = shopResponse.data.shop_list[0]; // First authorized shop\n\nif (!shopData || !shopData.cipher) {\n  throw new Error('Shop cipher not found - required for all API calls');\n}\n\n// Combine token data with shop data\nconst tokenData = $('Parse Token Response').item.json;\n\nreturn {\n  json: {\n    owner_id: tokenData.owner_id,\n    access_token: tokenData.access_token,\n    refresh_token: tokenData.refresh_token,\n    open_id: tokenData.open_id,\n    shop_id: shopData.shop_id,\n    shop_cipher: shopData.cipher,  // CRITICAL!\n    shop_name: shopData.shop_name,\n    seller_region: tokenData.seller_region,\n    access_expires_at: tokenData.access_expires_at,\n    refresh_expires_at: tokenData.refresh_expires_at\n  }\n};"
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1200, 300],
      "id": "combine-data",
      "name": "Combine Token & Shop Data"
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "UPDATE public.shops\nSET \n  tiktok_connected = true,\n  tiktok_access_token = '{{$json.access_token}}',\n  tiktok_refresh_token = '{{$json.refresh_token}}',\n  tiktok_shop_id = '{{$json.shop_id}}',\n  tiktok_shop_cipher = '{{$json.shop_cipher}}',\n  tiktok_open_id = '{{$json.open_id}}',\n  tiktok_access_expires_at = '{{$json.access_expires_at}}'::timestamptz,\n  tiktok_refresh_expires_at = '{{$json.refresh_expires_at}}'::timestamptz,\n  is_active = true,\n  last_token_refresh_at = NOW()\nWHERE owner_id = '{{$json.owner_id}}';\n\n-- Insert if not exists\nINSERT INTO public.shops (\n  owner_id,\n  tiktok_connected,\n  tiktok_access_token,\n  tiktok_refresh_token,\n  tiktok_shop_id,\n  tiktok_shop_cipher,\n  tiktok_open_id,\n  tiktok_access_expires_at,\n  tiktok_refresh_expires_at,\n  is_active,\n  created_at\n)\nSELECT \n  '{{$json.owner_id}}',\n  true,\n  '{{$json.access_token}}',\n  '{{$json.refresh_token}}',\n  '{{$json.shop_id}}',\n  '{{$json.shop_cipher}}',\n  '{{$json.open_id}}',\n  '{{$json.access_expires_at}}'::timestamptz,\n  '{{$json.refresh_expires_at}}'::timestamptz,\n  true,\n  NOW()\nWHERE NOT EXISTS (\n  SELECT 1 FROM public.shops WHERE owner_id = '{{$json.owner_id}}'\n);",
        "options": {}
      },
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2,
      "position": [1400, 300],
      "id": "upsert-tiktok",
      "name": "Upsert TikTok Shop",
      "credentials": {
        "postgres": {
          "id": "QyLuD28JpwvMjOqS",
          "name": "Postgres account"
        }
      }
    },
    {
      "parameters": {
        "respondWith": "redirect",
        "redirectURL": "={{$env.FRONTEND_URL || 'http://localhost:3000'}}/settings?tiktok_connected=true",
        "options": {}
      },
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.5,
      "position": [1600, 300],
      "id": "redirect-success",
      "name": "Redirect to App"
    }
  ],
  "connections": {
    "Start Webhook": {
      "main": [[{"node": "Generate Auth URL", "type": "main", "index": 0}]]
    },
    "Generate Auth URL": {
      "main": [[{"node": "Redirect to TikTok", "type": "main", "index": 0}]]
    },
    "Callback Webhook": {
      "main": [[{"node": "Prepare Callback Data", "type": "main", "index": 0}]]
    },
    "Prepare Callback Data": {
      "main": [[{"node": "Exchange Token", "type": "main", "index": 0}]]
    },
    "Exchange Token": {
      "main": [[{"node": "Parse Token Response", "type": "main", "index": 0}]]
    },
    "Parse Token Response": {
      "main": [[{"node": "Prepare Shop Info Request", "type": "main", "index": 0}]]
    },
    "Prepare Shop Info Request": {
      "main": [[{"node": "Get Shop Info (for Cipher)", "type": "main", "index": 0}]]
    },
    "Get Shop Info (for Cipher)": {
      "main": [[{"node": "Combine Token & Shop Data", "type": "main", "index": 0}]]
    },
    "Combine Token & Shop Data": {
      "main": [[{"node": "Upsert TikTok Shop", "type": "main", "index": 0}]]
    },
    "Upsert TikTok Shop": {
      "main": [[{"node": "Redirect to App", "type": "main", "index": 0}]]
    }
  }
}
```

## Required Environment Variables

```bash
TIKTOK_APP_KEY=your_tiktok_app_key
TIKTOK_APP_SECRET=your_tiktok_app_secret
FRONTEND_URL=http://localhost:3000
```

## Database Schema Requirements

```sql
-- Add TikTok Shop specific columns
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS tiktok_connected boolean default false,
ADD COLUMN IF NOT EXISTS tiktok_access_token text,
ADD COLUMN IF NOT EXISTS tiktok_refresh_token text,
ADD COLUMN IF NOT EXISTS tiktok_shop_id text,
ADD COLUMN IF NOT EXISTS tiktok_shop_cipher text,  -- CRITICAL!
ADD COLUMN IF NOT EXISTS tiktok_open_id text,
ADD COLUMN IF NOT EXISTS tiktok_access_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS tiktok_refresh_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS last_token_refresh_at timestamptz;

-- Create index
CREATE INDEX IF NOT EXISTS idx_shops_tiktok_id ON shops(tiktok_shop_id);
```

## CRITICAL NOTES:

1. **shop_cipher is REQUIRED** for ALL TikTok Shop API calls
   - Without it, you cannot make any API requests
   - Must be fetched via /api/shop/get_authorized_shop after OAuth

2. **Signature Calculation** is required for ALL API calls
   - Pattern: HMAC-SHA256(app_secret, app_secret + path + sorted_params + app_secret)
   - Every future API call needs this signature

3. **Token Expiration**
   - Access tokens expire (typically 14 days)
   - Refresh tokens also expire and are SINGLE-USE
   - When refreshing, you get a NEW refresh token - must store it!

4. **Region-Specific Endpoints**
   - This workflow uses US endpoint (open-api.tiktokshop.com)
   - For other regions, check TikTok Shop documentation

## Next Steps:

1. Create a separate workflow for **token refresh** (critical because tokens rotate)
2. Implement signature calculation helper as reusable function
3. Test in TikTok Sandbox environment first

## Test Checklist:
- [ ] Environment variables configured
- [ ] Database columns created
- [ ] Start flow generates authorization URL
- [ ] Token exchange returns data.access_token
- [ ] Shop info call returns cipher
- [ ] Database stores shop_cipher (verify!)
- [ ] All expiration times stored correctly
