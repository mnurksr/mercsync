# AMAZON SP-API OAUTH WORKFLOW - CORRECTED VERSION

## ⚠️ CRITICAL PREREQUISITES

Before implementing this workflow, you MUST:

1. **Have an Amazon Professional Seller Account** ($39.99/month)
2. **Register an application in Amazon Developer Console**
3. **Get your LWA credentials** (Client ID, Client Secret)
4. **Set up AWS IAM** (separate process - see below)

## n8n Workflow JSON

```json
{
  "name": "Amazon SP-API OAuth - Fixed",
  "nodes": [
    {
      "parameters": {
        "path": "auth/amazon/start",
        "responseMode": "responseNode",
        "options": {}
      },
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 0],
      "id": "amazon-start-webhook",
      "name": "Start Webhook"
    },
    {
      "parameters": {
        "jsCode": "const user_id = ($json.query.user_id || '').toString().trim();\nif (!user_id) {\n  throw new Error('Missing user_id parameter');\n}\n\n// Generate state with owner_id\nconst statePayload = {\n  owner_id: user_id,\n  nonce: Math.random().toString(36).substring(2),\n  timestamp: Date.now()\n};\n\nconst stateJson = JSON.stringify(statePayload);\nconst state = Buffer.from(stateJson).toString('base64')\n  .replace(/\\+/g, '-')\n  .replace(/\\//g, '_')\n  .replace(/=+$/g, '');\n\nconst applicationId = $env.AMAZON_APPLICATION_ID;\n\nif (!applicationId) {\n  throw new Error('AMAZON_APPLICATION_ID environment variable not set');\n}\n\n// NOTE: Remove version=beta for production apps\nconst authUrl = 'https://sellercentral.amazon.com/apps/authorize/consent?' +\n  `application_id=${applicationId}&` +\n  `state=${state}&` +\n  `version=beta`; // Remove this in production!\n\nreturn {\n  json: {\n    auth_url: authUrl,\n    state: state\n  }\n};"
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
      "id": "redirect-to-amazon",
      "name": "Redirect to Amazon"
    },
    {
      "parameters": {
        "path": "auth/amazon/callback",
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
        "jsCode": "const query = $json.query || {};\nconst code = query.spapi_oauth_code;  // Note: Different from standard 'code'\nconst sellerId = query.selling_partner_id;\nconst mwsAuthToken = query.mws_auth_token;  // Optional, for MWS migration\nconst state = query.state;\n\nif (!code || !sellerId || !state) {\n  throw new Error('Missing required Amazon callback parameters');\n}\n\n// Decode state\nfunction base64UrlToString(input) {\n  const pad = '='.repeat((4 - (input.length % 4)) % 4);\n  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');\n  return Buffer.from(b64, 'base64').toString('utf8');\n}\n\nlet owner_id;\ntry {\n  const decoded = base64UrlToString(state);\n  const parsed = JSON.parse(decoded);\n  owner_id = parsed.owner_id;\n} catch (e) {\n  throw new Error('Invalid state parameter');\n}\n\nreturn {\n  json: {\n    spapi_oauth_code: code,\n    selling_partner_id: sellerId,\n    mws_auth_token: mwsAuthToken,\n    owner_id: owner_id\n  }\n};"
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [200, 300],
      "id": "parse-callback",
      "name": "Parse Amazon Callback"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://api.amazon.com/auth/o2/token",
        "sendBody": true,
        "contentType": "form-urlencoded",
        "bodyParameters": {
          "parameters": [
            {
              "name": "grant_type",
              "value": "authorization_code"
            },
            {
              "name": "code",
              "value": "={{$json.spapi_oauth_code}}"
            },
            {
              "name": "client_id",
              "value": "={{$env.AMAZON_CLIENT_ID}}"
            },
            {
              "name": "client_secret",
              "value": "={{$env.AMAZON_CLIENT_SECRET}}"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [400, 300],
      "id": "exchange-for-refresh-token",
      "name": "Exchange for Refresh Token"
    },
    {
      "parameters": {
        "jsCode": "const response = $json;\n\nif (!response.refresh_token) {\n  throw new Error('No refresh token received from Amazon LWA');\n}\n\n// Store the refresh token (this is the permanent credential)\nreturn {\n  json: {\n    owner_id: $('Parse Amazon Callback').item.json.owner_id,\n    selling_partner_id: $('Parse Amazon Callback').item.json.selling_partner_id,\n    refresh_token: response.refresh_token,\n    // We also get an access token here, but DON'T store it\n    // It expires in 1 hour - we'll generate new ones on-demand\n    initial_access_token: response.access_token,\n    token_type: response.token_type\n  }\n};"
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [600, 300],
      "id": "extract-refresh-token",
      "name": "Extract Refresh Token"
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "UPDATE public.shops\nSET \n  amazon_connected = true,\n  amazon_seller_id = '{{$json.selling_partner_id}}',\n  amazon_refresh_token = '{{$json.refresh_token}}',\n  amazon_marketplace_id = 'A33AVAJ2PDY3EV',  -- Turkey/EU marketplace\n  amazon_region = 'eu-west-1',\n  is_active = true,\n  last_token_refresh_at = NOW()\nWHERE owner_id = '{{$json.owner_id}}';\n\n-- Insert if not exists\nINSERT INTO public.shops (\n  owner_id,\n  amazon_connected,\n  amazon_seller_id,\n  amazon_refresh_token,\n  amazon_marketplace_id,\n  amazon_region,\n  is_active,\n  created_at\n)\nSELECT \n  '{{$json.owner_id}}',\n  true,\n  '{{$json.selling_partner_id}}',\n  '{{$json.refresh_token}}',\n  'A33AVAJ2PDY3EV',\n  'eu-west-1',\n  true,\n  NOW()\nWHERE NOT EXISTS (\n  SELECT 1 FROM public.shops WHERE owner_id = '{{$json.owner_id}}'\n);",
        "options": {}
      },
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2,
      "position": [800, 300],
      "id": "store-credentials",
      "name": "Store Amazon Credentials",
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
        "redirectURL": "={{$env.FRONTEND_URL || 'http://localhost:3000'}}/settings?amazon_connected=true&requires_aws_setup=true",
        "options": {}
      },
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.5,
      "position": [1000, 300],
      "id": "redirect-success",
      "name": "Redirect to App"
    }
  ],
  "connections": {
    "Start Webhook": {
      "main": [[{"node": "Generate Auth URL", "type": "main", "index": 0}]]
    },
    "Generate Auth URL": {
      "main": [[{"node": "Redirect to Amazon", "type": "main", "index": 0}]]
    },
    "Callback Webhook": {
      "main": [[{"node": "Parse Amazon Callback", "type": "main", "index": 0}]]
    },
    "Parse Amazon Callback": {
      "main": [[{"node": "Exchange for Refresh Token", "type": "main", "index": 0}]]
    },
    "Exchange for Refresh Token": {
      "main": [[{"node": "Extract Refresh Token", "type": "main", "index": 0}]]
    },
    "Extract Refresh Token": {
      "main": [[{"node": "Store Amazon Credentials", "type": "main", "index": 0}]]
    },
    "Store Amazon Credentials": {
      "main": [[{"node": "Redirect to App", "type": "main", "index": 0}]]
    }
  }
}
```

## Required Environment Variables

```bash
AMAZON_APPLICATION_ID=your_amazon_application_id
AMAZON_CLIENT_ID=amzn1.application-oa2-client.xxxxx
AMAZON_CLIENT_SECRET=amzn1.oa2-cs.v1.xxxxx
AMAZON_REDIRECT_URI=https://n8n.erenmuhammedortakvps.store/webhook/auth/amazon/callback
FRONTEND_URL=http://localhost:3000

# AWS IAM Credentials (separate from OAuth)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_ROLE_ARN=arn:aws:iam::123456789012:role/YourSPAPIRole
```

## Database Schema Requirements

```sql
-- Add Amazon columns
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS amazon_connected boolean default false,
ADD COLUMN IF NOT EXISTS amazon_seller_id text,
ADD COLUMN IF NOT EXISTS amazon_refresh_token text,  -- Store this
ADD COLUMN IF NOT EXISTS amazon_marketplace_id text default 'A33AVAJ2PDY3EV',  -- Turkey/EU
ADD COLUMN IF NOT EXISTS amazon_region text default 'eu-west-1',
ADD COLUMN IF NOT EXISTS last_token_refresh_at timestamptz;

-- DO NOT store access_token - generate on-demand!

-- AWS IAM credentials (store separately, encrypted)
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS amazon_aws_access_key_id text,
ADD COLUMN IF NOT EXISTS amazon_aws_secret_access_key text,
ADD COLUMN IF NOT EXISTS amazon_aws_role_arn text;

-- Create index
CREATE INDEX IF NOT EXISTS idx_shops_amazon_seller ON shops(amazon_seller_id);
```

## COMPANION WORKFLOW: Get Access Token (On-Demand)

You MUST create a separate workflow that generates access tokens when needed:

```json
{
  "name": "Amazon - Get Fresh Access Token",
  "nodes": [
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT amazon_refresh_token, owner_id \nFROM shops \nWHERE owner_id = '{{$json.owner_id}}' \nAND amazon_connected = true",
        "options": {}
      },
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2,
      "position": [0, 0],
      "id": "get-refresh-token",
      "name": "Get Refresh Token"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://api.amazon.com/auth/o2/token",
        "sendBody": true,
        "contentType": "form-urlencoded",
        "bodyParameters": {
          "parameters": [
            {
              "name": "grant_type",
              "value": "refresh_token"
            },
            {
              "name": "refresh_token",
              "value": "={{$json.amazon_refresh_token}}"
            },
            {
              "name": "client_id",
              "value": "={{$env.AMAZON_CLIENT_ID}}"
            },
            {
              "name": "client_secret",
              "value": "={{$env.AMAZON_CLIENT_SECRET}}"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [200, 0],
      "id": "refresh-access-token",
      "name": "Refresh Access Token"
    },
    {
      "parameters": {
        "jsCode": "// Return access token with expiration time\nconst expiresAt = new Date(Date.now() + ($json.expires_in * 1000));\n\nreturn {\n  json: {\n    access_token: $json.access_token,\n    token_type: $json.token_type,\n    expires_at: expiresAt.toISOString(),\n    expires_in_seconds: $json.expires_in\n  }\n};"
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [400, 0],
      "id": "return-token",
      "name": "Return Fresh Token"
    }
  ],
  "connections": {
    "Get Refresh Token": {
      "main": [[{"node": "Refresh Access Token", "type": "main", "index": 0}]]
    },
    "Refresh Access Token": {
      "main": [[{"node": "Return Fresh Token", "type": "main", "index": 0}]]
    }
  }
}
```

## AWS IAM SETUP (REQUIRED - MANUAL PROCESS)

Amazon SP-API requires AWS IAM credentials IN ADDITION TO OAuth. This is a **separate, manual process**:

### Step 1: Create IAM User
1. Log in to AWS Console
2. Go to IAM → Users → Create User
3. Name: `sp-api-integration` (or similar)
4. No console access needed

### Step 2: Create IAM Role
1. IAM → Roles → Create Role
2. Trusted Entity: `arn:aws:iam::437568002678:role/aws-sp-api-role`
3. Permissions: Attach `AmazonSellingPartnerAPIAccess` policy
4. Name: `YourSPAPIRole`
5. Copy the Role ARN: `arn:aws:iam::123456789012:role/YourSPAPIRole`

### Step 3: Get Credentials
1. Select the IAM user created in Step 1
2. Security Credentials → Create Access Key
3. Use case: "Application running outside AWS"
4. Copy:
   - Access Key ID: `AKIA...`
   - Secret Access Key: `wJalrXUtn...`

### Step 4: Store in Database
```sql
UPDATE shops
SET 
  amazon_aws_access_key_id = 'AKIA...',
  amazon_aws_secret_access_key = 'wJalrXUtn...',  -- ENCRYPT THIS!
  amazon_aws_role_arn = 'arn:aws:iam::123456789012:role/YourSPAPIRole'
WHERE owner_id = 'user_id_here';
```

**⚠️ CRITICAL SECURITY:**
- Encrypt AWS credentials using Supabase Vault or pg_crypto
- Never commit AWS credentials to Git
- Use separate credentials per environment

## MAKING SP-API REQUESTS (After OAuth + IAM Setup)

Every SP-API request requires:
1. **LWA Access Token** (from refresh token)
2. **AWS Signature Version 4** (using IAM credentials)

Example request structure:
```javascript
const crypto = require('crypto');
const axios = require('axios');

// Step 1: Get fresh access token (from companion workflow)
const lwaToken = await getFreshAccessToken(owner_id);

// Step 2: Sign request with AWS IAM
const endpoint = 'https://sellingpartnerapi-eu.amazon.com';
const path = '/orders/v0/orders';
const method = 'GET';
const region = 'eu-west-1';

// AWS4 Signature (complex - recommend using aws4 library)
const signature = generateAWS4Signature({
  access_key: awsAccessKeyId,
  secret_key: awsSecretAccessKey,
  region: region,
  service: 'execute-api',
  method: method,
  path: path
});

// Step 3: Make request
const response = await axios.get(endpoint + path, {
  headers: {
    'x-amz-access-token': lwaToken,  // LWA token
    'x-amz-date': signature.date,
    'Authorization': signature.authHeader,  // AWS signature
    'host': 'sellingpartnerapi-eu.amazon.com'
  }
});
```

## IMPORTANT NOTES:

1. **Two-Step Authentication**
   - OAuth gets you refresh_token (for API access permission)
   - AWS IAM gets you signature credentials (for request authentication)
   - Both are required for every API call

2. **Do NOT Store Access Tokens**
   - They expire in 1 hour
   - Generate fresh ones using refresh_token when needed
   - Store only the refresh_token

3. **Marketplace IDs**
   - Turkey: `A33AVAJ2PDY3EV`
   - Germany: `A1PA6795UKMFR9`
   - US: `ATVPDKIKX0DER`
   - Update based on seller's region

4. **Production vs Beta**
   - Remove `&version=beta` from authorization URL for production apps
   - Beta is only for testing draft applications

5. **AWS Signature Libraries**
   - Use `aws4` npm package for signing
   - Do not implement signature logic manually (very complex)

## Test Checklist:
- [ ] Amazon Professional Seller Account active
- [ ] Application registered in Amazon Developer Console
- [ ] Environment variables configured (LWA credentials)
- [ ] AWS IAM user created
- [ ] AWS IAM role created and ARN obtained
- [ ] AWS credentials stored (encrypted!)
- [ ] Database columns created
- [ ] Refresh token obtained via OAuth
- [ ] Access token can be generated from refresh token
- [ ] Test API call with both LWA token and AWS signature

## COSTS:
- Amazon Professional Seller Account: $39.99/month (required)
- AWS usage: Minimal (under free tier for most use cases)

## Next Steps After OAuth:
1. Implement AWS4 signature helper function
2. Create order sync workflow (using both LWA + AWS auth)
3. Implement inventory update workflow
4. Set up webhook for real-time order notifications
