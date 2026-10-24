# demo-webhook-server

Simple NestJS app that exposes an endpoint that can receive Mural webhooks and verifies their ECDSA signatures.
When a verified event is received, it prints the event to the console.

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
npm test               # run the verification tests
```

## Endpoints

- `POST /test/webhook`: verifies the signature using the public key in `WEBHOOK_SECRET`

## How verification works

See [Signature Validation](https://developers.muralpay.com/docs/signature-validation) for the full spec. The endpoint:

1. Requires the `x-mural-webhook-signature` and `x-mural-webhook-timestamp` headers.
2. Rejects timestamps that aren't valid ISO 8601 or are more than 5 minutes from the server's clock, to limit replay attacks.
3. Verifies the base64 DER ECDSA signature over `<timestamp>.<raw body>` with SHA-256. It uses the **raw request bytes** (`rawBody: true` in `main.ts`). Don't verify against `JSON.stringify(req.body)`: re-serializing can change whitespace or key order and break valid signatures.
4. Parses and logs the body only after the signature checks out.
5. Skips events whose `eventId` it has already processed. Mural retries failed deliveries (up to 3 attempts over about 6 minutes), so the same event can arrive more than once, each delivery with a new `deliveryId` and `attemptNumber`. The demo keeps processed IDs in memory; use a durable store in production.

It returns `200` for verified events (including duplicates) and `401` for missing headers or failed verification. Mural treats any non-200 response as a failed delivery and retries it, except `404`, which fails the delivery immediately with no retry.

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

Valid categories: `MURAL_ACCOUNT_BALANCE_ACTIVITY`, `BUSINESS_VERIFICATION_STATUS`, `ORGANIZATION_TOS`, `PAYOUT_REQUEST`, `PAYIN`, `COMPLIANCE_REVIEW`, `RFI`. See [Event Types](https://developers.muralpay.com/docs/event-types) for each category's payloads. Max 5 webhooks per org.

### 2. (Optional) Check connectivity with a ping

Ping works on a `DISABLED` webhook, so you can confirm your tunnel and signature verification work before activating it:

```bash
curl -X POST https://api.muralpay.com/api/webhooks/{webhookId}/ping \
  -H "Authorization: Bearer $MURAL_API_KEY"
```

It sends a signed test request to your URL and returns the outcome: `{"type": "success", ...}`, `{"type": "httpError", ...}` (your endpoint returned a non-2xx status, for example a `401` from failed verification) or `{"type": "unreachable", ...}`.

### 3. Activate it

```bash
curl -X PATCH https://api.muralpay.com/api/webhooks/{webhookId}/status \
  -H "Authorization: Bearer $MURAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "ACTIVE"}'
```

### 4. (Optional) Send a test event

```bash
curl -X POST https://api.muralpay.com/api/webhooks/{webhookId}/send \
  -H "Authorization: Bearer $MURAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"event": {"type": "categoryTest", "category": "MURAL_ACCOUNT_BALANCE_ACTIVITY"}}'
```
