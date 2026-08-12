# webhook-handler

Secure webhook receiver with HMAC-SHA256 signature verification, idempotency via request ID caching, and timestamp tolerance to prevent replay attacks.

## Quickstart

```typescript
import { WebhookHandler } from 'webhook-handler';

const handler = new WebhookHandler({ secret: 'your-webhook-secret' });

handler.on('payment.completed', (payload) => {
  console.log('Payment:', payload.amount);
});

handler.on('*', (payload) => {
  console.log('Received any event:', payload);
});

// In your HTTP handler (Express example):
app.post('/webhooks', async (req, res) => {
  try {
    await handler.handle(req.body, req.headers['x-signature']);
    res.sendStatus(200);
  } catch (error) {
    res.sendStatus(401); // Signature invalid or replay detected
  }
});
```

## API

### Constructor

```typescript
new WebhookHandler(options: {
  secret: string;
  timestampToleranceSec?: number;  // default 300 (5 minutes)
  cacheSize?: number;               // default 1000
})
```

### Methods

#### `on(eventType, handler)`

Register a handler for an event type. Use `'*'` for all events.

```typescript
handler.on('user.created', async (payload) => {
  await db.users.insert(payload);
});
```

#### `handle(payload, signature)`

Verify signature, timestamp, and idempotency; dispatch to handlers.

```typescript
await handler.handle(JSON.stringify(webhookData), signatureFromHeader);
```

**Verifies:**
- HMAC-SHA256 signature (timing-safe comparison)
- Timestamp within tolerance window
- Request ID not previously seen (idempotency)

**Throws:**
- `Error('Webhook signature verification failed')` — bad signature
- `Error('Webhook timestamp outside tolerance window')` — old webhook (replay protection)
- Other errors from handlers are propagated

#### `static sign(payload, secret)`

Helper for the sending side to generate a signature.

```typescript
const payload = JSON.stringify(webhookData);
const signature = WebhookHandler.sign(payload, sharedSecret);
// Include signature in X-Signature header when sending
```

#### `clearCache()`

Clear idempotency cache (testing only).

```typescript
handler.clearCache();
```

## Webhook Payload Format

```typescript
interface WebhookEvent {
  id: string;              // Unique request ID for idempotency
  timestamp: number;       // Unix seconds (used for replay protection)
  type: string;            // Event type (e.g., 'payment.completed')
  payload: Record<string, any>;  // Your event data
}
```

## Signature Generation (Sending Side)

```typescript
const payload = JSON.stringify({
  id: 'evt_123',
  timestamp: Math.floor(Date.now() / 1000),
  type: 'payment.completed',
  payload: { orderId: 'ord_456', amount: 99.99 }
});

const signature = WebhookHandler.sign(payload, sharedSecret);

await fetch('https://your-app.com/webhooks', {
  method: 'POST',
  headers: { 'X-Signature': signature },
  body: payload
});
```

## Scope & Limits

- **Signature only** — HMAC-SHA256 with `timingSafeEqual`; no other auth schemes
- **Timestamp window** — configurable tolerance (default 5 min); no clock skew handling
- **Idempotency via ID cache** — in-memory, capped (default 1000); survives handler crashes but not process restart
- **No async retry** — handlers must implement their own retry; failed dispatch clears idempotency marker
- **No payload transformation** — raw JSON; user responsible for schema validation

## Example: Test Fixtures

```typescript
const secret = 'test-secret';

// Valid webhook
const payload = JSON.stringify({
  id: 'evt_test_1',
  timestamp: Math.floor(Date.now() / 1000),
  type: 'test.event',
  payload: { data: 'test' }
});
const signature = WebhookHandler.sign(payload, secret);

const handler = new WebhookHandler({ secret });
let received = false;
handler.on('test.event', () => { received = true; });

await handler.handle(payload, signature); // Success
console.log(received); // true

// Tampered payload
await handler.handle(payload + 'x', signature); // Throws
```

## License

MIT

---

Sponsored by [Ferrow](https://ferrow.ai)

---
Part of the [ferrow-toolkit](https://github.com/FerrowAI/ferrow-toolkit) collection · Sponsored by [Ferrow](https://ferrow.ai)
