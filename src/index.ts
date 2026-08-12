import { createHmac, timingSafeEqual } from 'crypto';

// Webhook event structure
export interface WebhookEvent {
  id: string;
  timestamp: number;
  type: string;
  payload: Record<string, any>;
}

// Event handler type
type EventHandler = (payload: Record<string, any>) => void | Promise<void>;

// LRU-ish cache for idempotency
class IdempotencyCache {
  private seen: Map<string, number> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  has(id: string): boolean {
    return this.seen.has(id);
  }

  add(id: string): void {
    if (this.seen.size >= this.maxSize) {
      // Simple eviction: remove oldest entry
      const oldest = Array.from(this.seen.entries())[0];
      this.seen.delete(oldest[0]);
    }
    this.seen.set(id, Date.now());
  }

  clear(): void {
    this.seen.clear();
  }
}

export class WebhookHandler {
  private secret: string;
  private handlers: Map<string, EventHandler[]> = new Map();
  private idempotencyCache: IdempotencyCache;
  private timestampToleranceSec: number;

  constructor(options: {
    secret: string;
    timestampToleranceSec?: number;
    cacheSize?: number;
  }) {
    this.secret = options.secret;
    this.timestampToleranceSec = options.timestampToleranceSec ?? 300; // 5 minutes default
    this.idempotencyCache = new IdempotencyCache(options.cacheSize ?? 1000);
  }

  // Register an event handler
  on(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  // Verify signature and dispatch webhook
  async handle(payload: string, signature: string): Promise<void> {
    // Verify signature
    this.verifySignature(payload, signature);

    // Parse payload
    const event: WebhookEvent = JSON.parse(payload);

    // Check timestamp tolerance
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - event.timestamp) > this.timestampToleranceSec) {
      throw new Error('Webhook timestamp outside tolerance window');
    }

    // Check idempotency
    if (this.idempotencyCache.has(event.id)) {
      // Silently ignore replayed webhooks (idempotent)
      return;
    }
    this.idempotencyCache.add(event.id);

    // Dispatch to handlers
    const typeHandlers = this.handlers.get(event.type) || [];
    const wildcardHandlers = this.handlers.get('*') || [];
    const allHandlers = [...typeHandlers, ...wildcardHandlers];

    for (const handler of allHandlers) {
      await handler(event.payload);
    }
  }

  // Verify HMAC-SHA256 signature (timing-safe)
  private verifySignature(payload: string, signature: string): void {
    const expected = createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');

    // Use timingSafeEqual to prevent timing attacks
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signature);

    if (expectedBuf.length !== receivedBuf.length) {
      throw new Error('Webhook signature verification failed');
    }

    if (!timingSafeEqual(expectedBuf, receivedBuf)) {
      throw new Error('Webhook signature verification failed');
    }
  }

  // Helper: sign a payload (for sending side)
  static sign(payload: string, secret: string): string {
    return createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  // Clear caches (for testing)
  clearCache(): void {
    this.idempotencyCache.clear();
  }
}
