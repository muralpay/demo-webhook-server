# demo-webhook-server

Simple NestJS app that exposes an endpoint that can receive Mural webhooks and verifies their ECDSA signatures.
When an event is received, it will print out the event body to the console.

## Setup

```bash
npm install
cp .env.example .env   # then paste the dev public key into WEBHOOK_SECRET
```

## Running the server

```bash
npm run start          # one-off, listens on http://localhost:8081 by default
npm run start:dev      # watch mode — auto-reloads on file changes
npm run start:debug    # watch mode + Node debugger attached
npm run build          # compile TypeScript to dist/
npm run start:prod     # run the compiled build (node dist/main)
```

## Endpoints

- `POST /test/webhook` — verifies signature using the public key in `WEBHOOK_SECRET`

## Creating a webhook with the Mural API

Each webhook gets its own ECDSA keypair. Mural signs events with the private half; you verify with the public half returned at creation. Drop that public key into `WEBHOOK_SECRET`.

### 1. Create the webhook (returns `DISABLED`)

```bash
curl -X POST https://api.muralpay.com/api/webhooks \
  -H "Authorization: Bearer $MURAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost:8081/test/webhook",
    "categories": ["MURAL_ACCOUNT_BALANCE_ACTIVITY"]
  }'
```

Response (`MuralWebhook`):

```json
{
  "id": "...",
  "url": "...",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
  "categories": ["MURAL_ACCOUNT_BALANCE_ACTIVITY"],
  "status": "DISABLED",
  ...
}
```

Copy `publicKey` into `WEBHOOK_SECRET` in your `.env` (keep the `\n` escapes; the app converts them at runtime).

Valid categories: `MURAL_ACCOUNT_BALANCE_ACTIVITY`, `BUSINESS_VERIFICATION_STATUS`, `ORGANIZATION_TOS`, `PAYOUT_REQUEST`. Max 5 webhooks per org.

### 2. Activate it

```bash
curl -X PATCH https://api.muralpay.com/api/webhooks/{webhookId}/status \
  -H "Authorization: Bearer $MURAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "ACTIVE"}'
```

### 3. (Optional) Send a test event

```bash
curl -X POST https://api.muralpay.com/api/webhooks/{webhookId}/send \
  -H "Authorization: Bearer $MURAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"event": {"type": "categoryTest", "category": "MURAL_ACCOUNT_BALANCE_ACTIVITY"}}'
```
