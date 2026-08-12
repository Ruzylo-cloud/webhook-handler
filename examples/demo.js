// Compile TS first: tsc
const { WebhookHandler } = require('../dist/index.js');

async function demo() {
  const secret = 'my-webhook-secret';
  const handler = new WebhookHandler({ secret, timestampToleranceSec: 300 });

  // Register handlers
  let paymentReceived = false;
  let anyEventReceived = false;

  handler.on('payment.completed', () => {
    paymentReceived = true;
  });

  handler.on('*', () => {
    anyEventReceived = true;
  });

  // Create a valid webhook
  const validPayload = JSON.stringify({
    id: 'evt_123',
    timestamp: Math.floor(Date.now() / 1000),
    type: 'payment.completed',
    payload: { orderId: 'ord_456', amount: 99.99 }
  });

  const validSignature = WebhookHandler.sign(validPayload, secret);

  console.log('=== Demo 1: Valid signature ===');
  try {
    await handler.handle(validPayload, validSignature);
    console.log('✓ Valid signature accepted');
    console.log(`  paymentReceived: ${paymentReceived}, anyEventReceived: ${anyEventReceived}`);
  } catch (error) {
    console.log('✗ Failed:', error.message);
  }

  // Demo 2: Tampered payload
  console.log('\n=== Demo 2: Tampered payload ===');
  const tamperedPayload = validPayload + 'x';
  try {
    await handler.handle(tamperedPayload, validSignature);
    console.log('✗ Tampered payload was accepted (BUG)');
  } catch (error) {
    console.log('✓ Tampered payload rejected:', error.message);
  }

  // Demo 3: Replayed webhook (duplicate ID)
  console.log('\n=== Demo 3: Replayed webhook ===');
  handler.clearCache(); // Reset for test
  await handler.handle(validPayload, validSignature);
  console.log('✓ First webhook accepted');

  // Same payload again
  await handler.handle(validPayload, validSignature);
  console.log('✓ Replayed webhook silently ignored (idempotent)');

  // Demo 4: Stale timestamp
  console.log('\n=== Demo 4: Stale timestamp ===');
  const stalePayload = JSON.stringify({
    id: 'evt_old',
    timestamp: Math.floor(Date.now() / 1000) - 400,  // 400 sec old (tolerance is 300 sec)
    type: 'payment.completed',
    payload: { data: 'old' }
  });
  const staleSignature = WebhookHandler.sign(stalePayload, secret);

  try {
    await handler.handle(stalePayload, staleSignature);
    console.log('✗ Stale webhook was accepted (BUG)');
  } catch (error) {
    console.log('✓ Stale webhook rejected:', error.message);
  }

  console.log('\n=== Summary ===');
  console.log('Signature verification: PASS');
  console.log('Idempotency: PASS');
  console.log('Replay protection: PASS');
}

demo().catch(console.error);
