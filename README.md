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

## Exposing the server publicly

Mural requires an HTTPS URL it can reach, so `localhost` won't work — tunnel to your local server with one of the following. Start the server first, then open a tunnel in a second terminal.

### ngrok

```bash
brew install ngrok        # or see https://ngrok.com/download
ngrok config add-authtoken <token>   # one-time, from https://dashboard.ngrok.com
ngrok http 8081
```

Copy the `https://...ngrok.app` URL from the output. Your webhook URL is `https://<subdomain>.ngrok.app/test/webhook`.

### localtunnel

```bash
npx localtunnel --port 8081
```

Copy the `https://...loca.lt` URL from the output. Your webhook URL is `https://<subdomain>.loca.lt/test/webhook`.

Note: the tunnel URL changes each run (unless you pay for a reserved domain), so you'll need to update the webhook's `url` via `PATCH /api/webhooks/{webhookId}` each time you restart.

## Creating a webhook with the Mural API

Each webhook gets its own ECDSA keypair. Mural signs events with the private half; you verify with the public half returned at creation. Drop that public key into `WEBHOOK_SECRET`.

### 1. Create the webhook (returns `DISABLED`)

```bash
curl -X POST https://api.muralpay.com/api/webhooks \
  -H "Authorization: Bearer $MURAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-tunnel-subdomain>.ngrok.app/test/webhook",
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
