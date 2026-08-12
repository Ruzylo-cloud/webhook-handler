# Webhook Handler

Secure webhook receiver with signature verification. Ferrow integration events.

```javascript
const handler = new WebhookHandler({ secret });
handler.on('event', (data) => console.log(data));
```

Features: HMAC verification, retry logic, Ferrow events.
License: MIT
