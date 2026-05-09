# Razorpay Webhook Debugging Guide

## Real-Time Webhook Data Logging

The webhook handler now includes comprehensive logging. When a webhook is received, you'll see detailed logs in your server console showing:

### Console Logs You'll See

```
[Razorpay Webhook] Event received at 2024-05-08T10:31:45.000Z
[Razorpay Webhook] Signature header present: true
[Razorpay Webhook] Event name: payment.captured
[Razorpay Webhook] Payload ID: evt_1a2b3c4d5e
[Razorpay Webhook] Full payload: {
  "id": "evt_1a2b3c4d5e",
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_1a2b3c4d5e",
        "order_id": "order_1a2b3c4d5e",
        "status": "captured",
        "amount": 1599,
        "email": "user@example.com"
      }
    }
  }
}
[Razorpay Webhook] Order ID extracted: order_1a2b3c4d5e
[Razorpay Webhook] Order details: {
  "orderId": "order_1a2b3c4d5e",
  "userId": "user_firebase_id_123",
  "planType": "pro",
  "interval": "monthly",
  "currentStatus": "created",
  "amount": 15.99
}
[Razorpay Webhook] Payment details extracted: {
  "paymentId": "pay_1a2b3c4d5e",
  "paymentStatus": "captured",
  "method": "card",
  "email": "user@example.com"
}
[Razorpay Webhook] Pricing details: {
  "selectedPrice": {
    "amount": 19.99,
    "currency": "INR"
  },
  "appliedPromoCode": "SUMMER20",
  "discountPercent": 20,
  "discountAmount": 4.00,
  "finalAmount": 15.99
}
[Razorpay Webhook] Existing subscription found: false
[Razorpay Webhook] Creating billing entry: {
  "invoiceId": "INV-1620000100",
  "amount": 15.99,
  "currency": "INR"
}
[Razorpay Webhook] Creating new subscription for user: user_firebase_id_123
[Razorpay Webhook] New subscription created: sub_1a2b3c4d5e
[Razorpay Webhook] Updating user profile for: user_firebase_id_123
[Razorpay Webhook] Finalizing payment record: order_1a2b3c4d5e
[Razorpay Webhook] SUCCESS: Webhook processed completely
[Razorpay Webhook] Summary: {
  "orderId": "order_1a2b3c4d5e",
  "paymentId": "pay_1a2b3c4d5e",
  "userId": "user_firebase_id_123",
  "subscriptionId": "sub_1a2b3c4d5e",
  "planType": "pro",
  "amount": 15.99,
  "status": "paid"
}
```

## How to View the Logs

### Local Development

```bash
# Terminal 1: Start your Next.js dev server
cd client
npm run dev

# Logs will appear in the same terminal where you see "compiled client successfully"
```

### Production (Vercel/Netlify)

1. **Vercel:**
   - Go to your project dashboard
   - Click "Functions" or "Deployments"
   - Select your latest deployment
   - Go to "Function Logs"
   - Filter by route: `/api/subscriptions/razorpay/webhook`

2. **Self-hosted (Node):**
   - Check your application logs
   - Use: `pm2 logs` or `docker logs <container-id>`
   - Search for `[Razorpay Webhook]` tag

### Cloud Logging (Firebase Cloud Functions / Google Cloud)

```bash
# View recent webhook logs
gcloud functions logs read razorpayWebhook --limit=50

# Follow logs in real-time
gcloud functions logs read razorpayWebhook --follow
```

## Understanding the Log Sequence

### Successful Payment Flow

```
1. Event received → Webhook POST received
2. Signature verified → HMAC validation passed
3. Event name extracted → payment.captured
4. Order ID extracted → order_1a2b3c4d5e
5. Order lookup → Found in subscriptionPayments
6. Payment details extracted → paymentId, status
7. Configuration loaded → Plans, limits, pricing
8. Subscription created/updated → sub_1a2b3c4d5e
9. User profile updated → subscription.type = "pro"
10. Payment record finalized → status = "paid"
```

### Error Cases

**Missing Order:**
```
[Razorpay Webhook] ERROR: Could not extract order ID from payload
[Razorpay Webhook] Checked paths:
  - payload.payload.payment.entity.order_id: undefined
  - payload.payload.order.entity.id: undefined
```

**Invalid Signature:**
```
[Razorpay Webhook] ERROR: Signature mismatch
[Razorpay Webhook] Expected: a1b2c3d4e5f6...
[Razorpay Webhook] Got: x9y8z7w6v5u4...
```

**Order Not Found:**
```
[Razorpay Webhook] ERROR: Order not found in subscriptionPayments
[Razorpay Webhook] Looking for order ID: order_unknown
```

## Testing Webhooks with Real Data

### 1. Using Razorpay Dashboard

- Log in to Razorpay Dashboard
- Go to **Settings** → **Webhooks**
- Click **Test Webhook**
- Select event type (e.g., `payment.captured`)
- View the exact payload Razorpay will send
- Check server logs to see how it's processed

### 2. Using cURL with Sample Data

```bash
# Create a sample webhook payload
export WEBHOOK_SECRET="your_webhook_secret"
export RAW_BODY='{"id":"evt_test","event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_test123","status":"captured","order_id":"order_test123"}}}}'

# Calculate signature
export SIGNATURE=$(echo -n "$RAW_BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d' ' -f2)

# Send the webhook
curl -X POST http://localhost:3000/api/subscriptions/razorpay/webhook \
  -H "Content-Type: application/json" \
  -H "X-Razorpay-Signature: $SIGNATURE" \
  -d "$RAW_BODY" \
  -v
```

### 3. Using Node.js Script

```javascript
// scripts/test-webhook.mjs
import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const BASE_URL = process.env.WEBHOOK_URL || 'http://localhost:3000';

const payload = {
  id: 'evt_' + Date.now(),
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: 'pay_' + Math.random().toString(36).slice(2),
        status: 'captured',
        order_id: 'order_' + Math.random().toString(36).slice(2),
        amount: 1999,
        method: 'card',
        email: 'test@example.com'
      }
    }
  },
  created_at: Math.floor(Date.now() / 1000)
};

const rawBody = JSON.stringify(payload);
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex');

console.log('Sending test webhook...');
console.log('Payload:', payload);
console.log('Signature:', signature);

fetch(`${BASE_URL}/api/subscriptions/razorpay/webhook`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Razorpay-Signature': signature
  },
  body: rawBody
})
  .then(r => r.json())
  .then(data => console.log('Response:', data))
  .catch(err => console.error('Error:', err));
```

Run with:
```bash
export RAZORPAY_WEBHOOK_SECRET="test_secret"
node scripts/test-webhook.mjs
```

## Data Structure Reference

### What Gets Logged

| Item | Where | Example |
|------|-------|---------|
| Event Type | `[Razorpay Webhook] Event name:` | `payment.captured` |
| Order ID | `[Razorpay Webhook] Order ID extracted:` | `order_1a2b3c4d5e` |
| Payment ID | `[Razorpay Webhook] Payment details extracted:` | `pay_1a2b3c4d5e` |
| User ID | `[Razorpay Webhook] Order details:` | `user_firebase_id_123` |
| Amount | `[Razorpay Webhook] Pricing details:` | `15.99` |
| Plan | `[Razorpay Webhook] Order details:` | `pro`, `monthly` |
| Subscription ID | `[Razorpay Webhook] Summary:` | `sub_1a2b3c4d5e` |

## Troubleshooting Specific Issues

### Issue: Webhook Never Received

**Check:**
1. Is webhook URL correctly configured in Razorpay Dashboard?
   ```
   https://yourapp.com/api/subscriptions/razorpay/webhook
   ```

2. Is your webhook endpoint publicly accessible?
   ```bash
   curl https://yourapp.com/api/subscriptions/razorpay/webhook -X POST -d "{}"
   # Should NOT return 404
   ```

3. Check Razorpay Dashboard → Settings → Webhooks → Event Details
   - Click on a recent event
   - See "Response" section
   - Look for 400/500 errors

### Issue: "Invalid Signature" Error

**Check:**
1. Webhook secret is correct:
   ```bash
   echo $RAZORPAY_WEBHOOK_SECRET
   # Should match: Settings → Webhooks → Your webhook secret
   ```

2. Raw body is not modified:
   - Webhook uses raw JSON string, not parsed object
   - Express.config.json() might modify it
   - Use `app.use(express.raw({type: 'application/json'}))` if needed

### Issue: "Order Not Found" Error

**Check:**
1. Order was created before webhook:
   ```
   [Order Creation] POST /api/subscriptions/razorpay/order → orderId: order_123
   [DB Write] subscriptionPayments[order_123] = {...}
   [Webhook] POST /api/subscriptions/razorpay/webhook → Looking for order_123
   ```

2. Check Firestore:
   - Collection: `subscriptionPayments`
   - Document ID matches `order_id` in webhook payload
   - Document has required fields: `userId`, `planType`, `interval`

### Issue: "Signature Mismatch" Error

**Debug Signature Verification:**
```javascript
// In webhook handler temporarily
console.log('[DEBUG] Raw body first 100 chars:', rawBody.substring(0, 100));
console.log('[DEBUG] Raw body length:', rawBody.length);
console.log('[DEBUG] Signature from header:', signature);
console.log('[DEBUG] Calculated signature:', expectedSignature);
console.log('[DEBUG] Signatures match:', signature === expectedSignature);
```

## Viewing Complete Webhook Payload

The logs now include the full payload. To parse it manually:

```javascript
// Extract from logs
const payload = JSON.parse(loggedPayload);

// Access nested data
const orderId = payload.payload.payment.entity.order_id;
const paymentId = payload.payload.payment.entity.id;
const amount = payload.payload.payment.entity.amount;
const status = payload.payload.payment.entity.status;
```

## Checking Database After Webhook

After a webhook is successfully processed, verify the data in Firestore:

```javascript
// Firebase Console → Firestore → Collections

// 1. Check subscriptionPayments
subscriptionPayments / order_1a2b3c4d5e
{
  orderId: "order_1a2b3c4d5e"
  userId: "user_firebase_id_123"
  status: "paid" ← Changed from "created"
  razorpayPaymentId: "pay_1a2b3c4d5e" ← Added by webhook
  razorpayWebhookReceivedAt: "2024-05-08T10:31:45.000Z" ← Added by webhook
}

// 2. Check subscriptions
subscriptions / sub_1a2b3c4d5e
{
  user: "user_firebase_id_123"
  plan: { type: "pro", name: "Pro Plan" }
  status: "active"
  billingHistory: [
    {
      razorpayOrderId: "order_1a2b3c4d5e" ← Linked payment
      status: "paid"
      amount: 15.99
    }
  ]
}

// 3. Check users
users / user_firebase_id_123
{
  subscription: {
    type: "pro"
    isActive: true
    endDate: "2024-06-08T10:31:45.000Z"
  }
}
```

## Next Steps

After confirming webhook data is flowing correctly:

1. **Monitor performance**: Check logs for webhook response times
2. **Set up alerts**: Get notified if webhook processing fails
3. **Create audit trail**: Track all payment events for compliance
4. **Test edge cases**: Webhook retry behavior, duplicate payments, etc.
