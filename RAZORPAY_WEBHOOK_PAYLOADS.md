# Real Razorpay Webhook Payload Examples

This document shows actual webhook payloads from Razorpay for different events.

## Event 1: Payment Captured (Most Common)

**When:** User completes payment and Razorpay captures the funds

**HTTP Headers:**
```
POST /api/subscriptions/razorpay/webhook HTTP/1.1
Host: yourapp.com
Content-Type: application/json
X-Razorpay-Signature: abcd1234efgh5678ijkl9012mnop3456
```

**Payload:**
```json
{
  "id": "evt_00000000000001",
  "entity": "event",
  "event": "payment.captured",
  "contains": ["payment"],
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_00000000000001",
        "entity": "payment",
        "amount": 1599,
        "currency": "INR",
        "status": "captured",
        "method": "card",
        "description": null,
        "amount_refunded": 0,
        "refund_status": null,
        "captured": true,
        "description": null,
        "card_id": "card_00000000000001",
        "bank": null,
        "wallet": null,
        "vpa": null,
        "email": "john.doe@example.com",
        "contact": "+919876543210",
        "notes": {},
        "fee": 59,
        "tax": 9,
        "error_code": null,
        "error_description": null,
        "error_source": null,
        "error_step": null,
        "error_reason": null,
        "acquirer_data": {
          "auth_code": "123456"
        },
        "international": false,
        "recurring": false,
        "recurring_details": {
          "status": null,
          "failure_reason": null
        },
        "gateway": "razorpay",
        "terminal_id": null,
        "order_id": "order_00000000000001",
        "customer_id": null,
        "token_id": null,
        "invoice_id": null,
        "settle_full_balance": false,
        "created_at": 1620000100,
        "expires_at": null,
        "expired_at": null,
        "signed": true,
        "verified": true
      }
    }
  },
  "created_at": 1620000105
}
```

**What Your Handler Extracts:**
```javascript
{
  eventName: "payment.captured",
  orderId: "order_00000000000001",
  paymentId: "pay_00000000000001",
  paymentStatus: "captured",
  method: "card",
  email: "john.doe@example.com",
  amount: 1599 // in paise (divide by 100 for rupees)
}
```

---

## Event 2: Payment Authorized (Recurring/Mandate)

**When:** Payment authorized but not yet captured (for recurring payments/EMI)

**Payload:**
```json
{
  "id": "evt_00000000000002",
  "entity": "event",
  "event": "payment.authorized",
  "contains": ["payment"],
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_00000000000002",
        "entity": "payment",
        "amount": 1999,
        "currency": "INR",
        "status": "authorized",
        "method": "emandate",
        "description": null,
        "amount_refunded": 0,
        "refund_status": null,
        "captured": false,
        "card_id": null,
        "bank": "HDFC",
        "wallet": null,
        "vpa": null,
        "email": "jane.smith@example.com",
        "contact": "+918765432109",
        "notes": {},
        "fee": null,
        "tax": null,
        "error_code": null,
        "error_description": null,
        "gateway": "razorpay",
        "terminal_id": null,
        "order_id": "order_00000000000002",
        "customer_id": null,
        "token_id": "token_00000000000002",
        "invoice_id": null,
        "international": false,
        "recurring": true,
        "created_at": 1620000200,
        "signed": true,
        "verified": true
      }
    }
  },
  "created_at": 1620000205
}
```

**Key Differences:**
- `status`: "authorized" (not "captured")
- `method`: "emandate" (recurring mandate)
- `recurring`: true
- `token_id`: Present (for recurring payments)

---

## Event 3: Order Paid

**When:** Order moves to "paid" state (alternative to payment.captured)

**Payload:**
```json
{
  "id": "evt_00000000000003",
  "entity": "event",
  "event": "order.paid",
  "contains": ["order"],
  "payload": {
    "order": {
      "entity": {
        "id": "order_00000000000003",
        "entity": "order",
        "amount": 2499,
        "amount_paid": 2499,
        "amount_due": 0,
        "currency": "INR",
        "receipt": "sub_1a2b3c_pm_xyz789",
        "offer_id": null,
        "status": "paid",
        "attempts": 1,
        "notes": {
          "userId": "firebase_user_id_here",
          "planType": "premium",
          "interval": "yearly",
          "planName": "Premium Plan",
          "promoCode": "NEWYEAR25",
          "discountPercent": "25"
        },
        "created_at": 1620000300
      }
    }
  },
  "created_at": 1620000305
}
```

**Note:** This event doesn't include `payload.payment.entity.order_id`, so the handler extracts from `payload.order.entity.id`

---

## Event 4: Payment Failed

**When:** Payment failed (declined card, insufficient funds, etc.)

**Payload:**
```json
{
  "id": "evt_00000000000004",
  "entity": "event",
  "event": "payment.failed",
  "contains": ["payment"],
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_00000000000004",
        "entity": "payment",
        "amount": 1999,
        "currency": "INR",
        "status": "failed",
        "method": "card",
        "description": null,
        "amount_refunded": 0,
        "refund_status": null,
        "captured": false,
        "card_id": "card_00000000000004",
        "bank": null,
        "wallet": null,
        "vpa": null,
        "email": "failed@example.com",
        "contact": "+919999999999",
        "notes": {},
        "fee": null,
        "tax": null,
        "error_code": "GATEWAY_ERROR",
        "error_description": "Card declined",
        "error_source": "gateway",
        "error_step": "captured",
        "error_reason": "insufficient_balance",
        "acquirer_data": {
          "auth_code": null
        },
        "international": false,
        "recurring": false,
        "gateway": "razorpay",
        "terminal_id": null,
        "order_id": "order_00000000000004",
        "customer_id": null,
        "token_id": null,
        "invoice_id": null,
        "created_at": 1620000400
      }
    }
  },
  "created_at": 1620000405
}
```

**Status:** "failed" → Handler logs but doesn't create subscription

---

## Event 5: Payment Refunded

**When:** Payment is refunded (customer requests refund, etc.)

**Payload:**
```json
{
  "id": "evt_00000000000005",
  "entity": "event",
  "event": "refund.created",
  "contains": ["refund"],
  "payload": {
    "refund": {
      "entity": {
        "id": "rfnd_00000000000001",
        "entity": "refund",
        "payment_id": "pay_00000000000001",
        "amount": 1599,
        "currency": "INR",
        "receipt": "Refund for order_00000000000001",
        "status": "processed",
        "speed_requested": "normal",
        "speed_processed": "normal",
        "notes": {
          "reason": "User requested cancellation"
        },
        "reason_code": "refund_requested",
        "shorturl": "https://rzp.io/refund/ref123",
        "description": "Refund initiated",
        "error_code": null,
        "error_description": null,
        "error_source": null,
        "error_step": null,
        "error_reason": null,
        "acquirer_data": {
          "arn": "1234567890"
        },
        "created_at": 1620000500
      }
    }
  },
  "created_at": 1620000505
}
```

**Note:** This event is NOT handled by current webhook (only captures, authorized, order.paid are handled)

---

## Event 6: Multiple Webhooks for Same Payment

**Sequence of events for a single payment:**

```
1. Payment Attempted
   {event: "payment.authorized", status: "authorized"}
   
2. Payment Captured
   {event: "payment.captured", status: "captured"}
   → This is when subscription is created
   
3. Order Paid (sometimes sent after payment.captured)
   {event: "order.paid", status: "paid"}
   → Also handled as subscription creation trigger
```

**Handler behavior:** If payment already exists in billingHistory, it won't be duplicated.

---

## Real-World Example: Complete Payment Flow Data

### Step 1: Client Initiates Checkout
**Request to `/api/subscriptions/razorpay/order`:**
```json
{
  "planType": "pro",
  "interval": "monthly",
  "promoCode": "SUMMER20"
}
```

**Response:**
```json
{
  "orderId": "order_NQHGNUr8aeqf1G",
  "amount": 1599,
  "currency": "INR",
  "keyId": "rzp_live_abcdefghijklmno",
  "planType": "pro",
  "interval": "monthly",
  "planName": "Pro Plan",
  "baseAmount": 19.99,
  "finalAmount": 15.99,
  "discountAmount": 4.00,
  "discountPercent": 20,
  "promoCode": "SUMMER20"
}
```

**Firestore Created:**
```json
{
  "orderId": "order_NQHGNUr8aeqf1G",
  "userId": "rI7jF9nZ2mP0kQ1r",
  "planType": "pro",
  "interval": "monthly",
  "amount": 15.99,
  "baseAmount": 19.99,
  "discountAmount": 4.00,
  "discountPercent": 20,
  "promoCode": "SUMMER20",
  "amountInPaise": 1599,
  "currency": "INR",
  "status": "created",
  "createdAt": "2024-05-08T10:30:00.000Z",
  "updatedAt": "2024-05-08T10:30:00.000Z"
}
```

### Step 2: User Completes Payment in Razorpay Modal
*User enters card details and clicks Pay*

### Step 3: Razorpay Sends Webhook
**Webhook Received:**
```json
{
  "id": "evt_P8qR9sT0uVwXyZ1a",
  "entity": "event",
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_NQHGNUsF2gH3iJk",
        "entity": "payment",
        "amount": 1599,
        "currency": "INR",
        "status": "captured",
        "method": "card",
        "order_id": "order_NQHGNUr8aeqf1G",
        "email": "john.doe@example.com",
        "contact": "+919876543210",
        "created_at": 1620000100
      }
    }
  },
  "created_at": 1620000105
}
```

### Step 4: Handler Processes Webhook
**Logs Show:**
```
[Razorpay Webhook] Event received at 2024-05-08T10:31:45.000Z
[Razorpay Webhook] Event name: payment.captured
[Razorpay Webhook] Order ID extracted: order_NQHGNUr8aeqf1G
[Razorpay Webhook] Order details: {
  "orderId": "order_NQHGNUr8aeqf1G",
  "userId": "rI7jF9nZ2mP0kQ1r",
  "planType": "pro",
  "interval": "monthly",
  "amount": 15.99
}
[Razorpay Webhook] Creating new subscription for user: rI7jF9nZ2mP0kQ1r
[Razorpay Webhook] SUCCESS: Webhook processed completely
```

**Firestore Updated:**
```json
// subscriptionPayments[order_NQHGNUr8aeqf1G]
{
  "orderId": "order_NQHGNUr8aeqf1G",
  "status": "paid", // ← Changed from "created"
  "razorpayPaymentId": "pay_NQHGNUsF2gH3iJk", // ← Added
  "razorpayWebhookEvent": "payment.captured", // ← Added
  "razorpayWebhookReceivedAt": "2024-05-08T10:31:45.000Z", // ← Added
  "updatedAt": "2024-05-08T10:31:45.000Z"
}

// subscriptions[sub_NQHGNUt3vWx4yZa] (newly created)
{
  "user": "rI7jF9nZ2mP0kQ1r",
  "plan": {
    "type": "pro",
    "name": "Pro Plan",
    "price": { "amount": 19.99, "currency": "INR" }
  },
  "status": "active",
  "startDate": "2024-05-08T10:31:45.000Z",
  "endDate": "2024-06-08T10:31:45.000Z",
  "billingHistory": [
    {
      "invoiceId": "INV-1620000100",
      "amount": 15.99,
      "currency": "INR",
      "status": "paid",
      "razorpayOrderId": "order_NQHGNUr8aeqf1G",
      "razorpayPaymentId": "pay_NQHGNUsF2gH3iJk",
      "promoCode": "SUMMER20",
      "discountPercent": 20,
      "paymentDate": "2024-05-08T10:31:45.000Z"
    }
  ]
}

// users[rI7jF9nZ2mP0kQ1r]
{
  "subscription": {
    "type": "pro",
    "isActive": true,
    "interval": "monthly",
    "startDate": "2024-05-08T10:31:45.000Z",
    "endDate": "2024-06-08T10:31:45.000Z"
  }
}
```

---

## Key Data Points to Monitor

| Field | Source | Example | Use |
|-------|--------|---------|-----|
| `order_id` | Webhook → `payload.payment.entity` | `order_NQHGNUr8aeqf1G` | Link payment to order |
| `payment_id` | Webhook → `payload.payment.entity.id` | `pay_NQHGNUsF2gH3iJk` | Track unique payment |
| `status` | Webhook → `payload.payment.entity.status` | `captured` | Determine if successful |
| `amount` | Webhook → `payload.payment.entity.amount` | `1599` | Verify amount (in paise) |
| `method` | Webhook → `payload.payment.entity.method` | `card`, `netbanking` | Track payment method |
| `email` | Webhook → `payload.payment.entity.email` | `user@example.com` | User contact |
| `contact` | Webhook → `payload.payment.entity.contact` | `+919876543210` | User phone |

---

## Differences Between Events

### payment.captured vs order.paid

| Aspect | payment.captured | order.paid |
|--------|------------------|-----------|
| **When sent** | After payment successfully captured | After order state changes to "paid" |
| **Contains** | Payment entity | Order entity |
| **Order ID source** | `payload.payment.entity.order_id` | `payload.order.entity.id` |
| **Payment ID** | Available | Not directly available |
| **Handler processes** | ✅ Yes | ✅ Yes |
| **Frequency** | Once per payment | Once per order |

Your handler checks BOTH because Razorpay might send either or both events.

---

## Testing with Real Payload

To test with the example above:

```bash
curl -X POST http://localhost:3000/api/subscriptions/razorpay/webhook \
  -H "Content-Type: application/json" \
  -H "X-Razorpay-Signature: YOUR_CALCULATED_SIGNATURE" \
  -d '{
    "id": "evt_P8qR9sT0uVwXyZ1a",
    "event": "payment.captured",
    "payload": {
      "payment": {
        "entity": {
          "id": "pay_NQHGNUsF2gH3iJk",
          "order_id": "order_NQHGNUr8aeqf1G",
          "status": "captured",
          "amount": 1599,
          "currency": "INR",
          "method": "card",
          "email": "john.doe@example.com",
          "created_at": 1620000100
        }
      }
    }
  }'
```

(Remember to calculate valid signature with your webhook secret)
