# Razorpay Webhook Data Reference

## Complete Data Flow

### 1. Step 1: Order Creation Request → Razorpay
**Endpoint:** POST `/api/subscriptions/razorpay/order`

**Request Body (Client sends):**
```json
{
  "planType": "pro",
  "interval": "monthly",
  "promoCode": "SUMMER20"
}
```

**Request to Razorpay API:**
```json
{
  "amount": 1999,           // in paise (100 = Rs 1)
  "currency": "INR",
  "receipt": "sub_1a2b3c_pm_abc123",
  "notes": {
    "userId": "user_firebase_id_123",
    "planType": "pro",
    "interval": "monthly",
    "planName": "Pro Plan",
    "promoCode": "SUMMER20",
    "discountPercent": "20"
  }
}
```

**Razorpay Response (Success):**
```json
{
  "id": "order_1a2b3c4d5e",
  "entity": "order",
  "amount": 1999,
  "amount_paid": 0,
  "amount_due": 1999,
  "currency": "INR",
  "receipt": "sub_1a2b3c_pm_abc123",
  "offer_id": null,
  "status": "created",
  "attempts": 0,
  "notes": {
    "userId": "user_firebase_id_123",
    "planType": "pro",
    "interval": "monthly",
    "planName": "Pro Plan",
    "promoCode": "SUMMER20",
    "discountPercent": "20"
  },
  "created_at": 1620000000
}
```

**Backend stores in Firestore `subscriptionPayments` collection:**
```json
{
  "orderId": "order_1a2b3c4d5e",
  "userId": "user_firebase_id_123",
  "planType": "pro",
  "interval": "monthly",
  "amount": 15.99,                    // Final amount after discount
  "baseAmount": 19.99,                // Original price
  "discountAmount": 4.00,
  "discountPercent": 20,
  "promoCode": "SUMMER20",
  "amountInPaise": 1599,
  "currency": "INR",
  "status": "created",
  "razorpayOrder": {
    "id": "order_1a2b3c4d5e",
    "amount": 1999,
    "currency": "INR",
    "receipt": "sub_1a2b3c_pm_abc123",
    "notes": { /* ... */ },
    "created_at": 1620000000
  },
  "createdAt": "2024-05-08T10:30:00.000Z",
  "updatedAt": "2024-05-08T10:30:00.000Z"
}
```

**Response to Client:**
```json
{
  "orderId": "order_1a2b3c4d5e",
  "amount": 1599,                     // in paise
  "currency": "INR",
  "keyId": "rzp_live_xxxxx",
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

---

### 2. Step 2: User Completes Payment in Razorpay Checkout

User enters payment details in Razorpay Checkout modal and completes payment.

Razorpay processes the payment and gets a `payment_id`.

---

### 3. Step 3: Webhook Signature Verification & Processing
**Endpoint:** POST `/api/subscriptions/razorpay/webhook`

**Razorpay Webhook Request Headers:**
```
X-Razorpay-Signature: <HMAC_SHA256_SIGNATURE>
```

**Complete Webhook Payload Structure (Real Examples):**

#### Payment Captured Event
```json
{
  "id": "evt_1a2b3c4d5e6f7g8h",
  "entity": "event",
  "event": "payment.captured",
  "contains": ["payment"],
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_1a2b3c4d5e",
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
        "card_id": "card_1a2b3c4d5e",
        "bank": null,
        "wallet": null,
        "vpa": null,
        "email": "user@example.com",
        "contact": "+919876543210",
        "notes": {},
        "fee": null,
        "tax": null,
        "error_code": null,
        "error_description": null,
        "error_source": null,
        "error_step": null,
        "error_reason": null,
        "acquirer_data": {
          "auth_code": null
        },
        "international": false,
        "recurring": false,
        "recurring_details": {
          "status": null,
          "failure_reason": null
        },
        "gateway": "razorpay",
        "terminal_id": null,
        "order_id": "order_1a2b3c4d5e",
        "customer_id": null,
        "token_id": null,
        "invoice_id": null,
        "international": false,
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

#### Payment Authorized Event
```json
{
  "id": "evt_2a2b3c4d5e6f7g8h",
  "entity": "event",
  "event": "payment.authorized",
  "contains": ["payment"],
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_1a2b3c4d5e",
        "entity": "payment",
        "amount": 1599,
        "currency": "INR",
        "status": "authorized",
        "method": "emandate",
        "order_id": "order_1a2b3c4d5e",
        "created_at": 1620000100
      }
    }
  },
  "created_at": 1620000105
}
```

#### Order Paid Event
```json
{
  "id": "evt_3a2b3c4d5e6f7g8h",
  "entity": "event",
  "event": "order.paid",
  "contains": ["order"],
  "payload": {
    "order": {
      "entity": {
        "id": "order_1a2b3c4d5e",
        "entity": "order",
        "amount": 1599,
        "amount_paid": 1599,
        "amount_due": 0,
        "currency": "INR",
        "receipt": "sub_1a2b3c_pm_abc123",
        "status": "paid",
        "attempts": 1,
        "notes": {
          "userId": "user_firebase_id_123",
          "planType": "pro",
          "interval": "monthly"
        },
        "created_at": 1620000000
      }
    }
  },
  "created_at": 1620000105
}
```

---

### 4. Step 4: Backend Processes Webhook

**Webhook Processing Steps:**

1. **Verify Signature**
   ```
   expectedSignature = HMAC_SHA256(raw_body, RAZORPAY_WEBHOOK_SECRET)
   if (x-razorpay-signature !== expectedSignature) → reject
   ```

2. **Extract Key Data**
   ```
   event = payload.event                              // "payment.captured"
   orderId = payload.payload.payment.entity.order_id  // "order_1a2b3c4d5e"
   paymentId = payload.payload.payment.entity.id      // "pay_1a2b3c4d5e"
   paymentStatus = payload.payload.payment.entity.status  // "captured"
   ```

3. **Fetch Existing Payment Record**
   ```
   paymentDoc = subscriptionPayments[orderId]
   ```

4. **Update Payment Record in Firestore**
   ```json
   {
     "orderId": "order_1a2b3c4d5e",
     "userId": "user_firebase_id_123",
     "planType": "pro",
     "interval": "monthly",
     "amount": 15.99,
     "baseAmount": 19.99,
     "amountInPaise": 1599,
     "currency": "INR",
     "status": "paid",
     "razorpayOrder": { /* original order */ },
     "razorpayPaymentId": "pay_1a2b3c4d5e",
     "razorpayPaymentStatus": "captured",
     "razorpayWebhookEvent": "payment.captured",
     "razorpayWebhookReceivedAt": "2024-05-08T10:31:45.000Z",
     "createdAt": "2024-05-08T10:30:00.000Z",
     "updatedAt": "2024-05-08T10:31:45.000Z"
   }
   ```

5. **Create/Update Subscription Record**
   ```json
   {
     "id": "sub_1a2b3c4d5e",
     "user": "user_firebase_id_123",
     "plan": {
       "type": "pro",
       "name": "Pro Plan",
       "price": {
         "amount": 19.99,
         "currency": "INR"
       }
     },
     "status": "active",
     "startDate": "2024-05-08T10:31:45.000Z",
     "endDate": "2024-06-08T10:31:45.000Z",
     "nextBillingDate": "2024-06-08T10:31:45.000Z",
     "autoRenew": true,
     "features": {
       "maxPrivateChats": 50,
       "maxStorageGB": 100,
       "prioritySupport": true,
       "removeAds": true,
       "customBranding": false
     },
     "paymentMethod": {
       "type": "razorpay",
       "orderId": "order_1a2b3c4d5e",
       "paymentId": "pay_1a2b3c4d5e"
     },
     "promoCode": "SUMMER20",
     "billingHistory": [
       {
         "amount": 15.99,
         "currency": "INR",
         "status": "paid",
         "description": "Pro Plan - monthly subscription",
         "invoiceId": "INV-1620000100",
         "paymentDate": "2024-05-08T10:31:45.000Z",
         "paymentGateway": "razorpay",
         "razorpayOrderId": "order_1a2b3c4d5e",
         "razorpayPaymentId": "pay_1a2b3c4d5e",
         "promoCode": "SUMMER20",
         "discountPercent": 20,
         "discountAmount": 4.00,
         "source": "webhook"
       }
     ],
     "createdAt": "2024-05-08T10:31:45.000Z",
     "updatedAt": "2024-05-08T10:31:45.000Z"
   }
   ```

6. **Update User Profile**
   ```json
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

## Webhook Response

**Success (200 OK):**
```json
{
  "message": "Webhook processed successfully",
  "subscriptionId": "sub_1a2b3c4d5e"
}
```

**Failure Responses:**
```json
{
  "error": "Invalid webhook signature",
  "status": 400
}
```

```json
{
  "error": "Missing Razorpay order id in webhook payload",
  "status": 400
}
```

```json
{
  "error": "Order record not found",
  "status": 404
}
```

---

## Database Collections Modified

### 1. `subscriptionPayments` (Firestore)
- **Document ID:** Razorpay Order ID (e.g., `order_1a2b3c4d5e`)
- **Updated by:** Webhook handler
- **Key fields:** orderId, userId, planType, status, razorpayPaymentId, razorpayWebhookEvent

### 2. `subscriptions` (Firestore)
- **Collection:** Root
- **Document ID:** Generated subscription ID (e.g., `sub_1a2b3c4d5e`)
- **Updated by:** Webhook handler via subscriptionService
- **Key fields:** plan, status, startDate, endDate, billingHistory, paymentMethod

### 3. `users` (Firestore)
- **Document ID:** User Firebase ID
- **Updated by:** Webhook handler via userService
- **Key fields:** subscription.type, subscription.isActive, subscription.endDate

---

## Razorpay Event Types Handled

| Event | Trigger | Status Used |
|-------|---------|------------|
| `payment.captured` | Payment successfully captured | `captured` |
| `payment.authorized` | Payment authorized (pending capture) | `authorized` |
| `order.paid` | Order fully paid | varies |

---

## Real World Payment Flow Timeline

```
10:30:00 - Client initiates checkout
10:30:05 - Order created in Razorpay (status: "created")
          DB: subscriptionPayments[order_id] = {status: "created"}
          
10:30:15 - User opens Razorpay checkout modal
10:30:45 - User enters card details

10:31:00 - User clicks "Pay"
10:31:05 - Razorpay processes payment

10:31:10 - Razorpay captures payment
10:31:15 - Razorpay sends webhook event "payment.captured"
          DB: subscriptionPayments[order_id].status = "paid"
          DB: subscriptions[sub_id] = {status: "active", startDate, endDate}
          DB: users[user_id].subscription = {type: "pro", isActive: true}

10:31:45 - Client receives success notification
          Redirects to dashboard
```

---

## Testing Webhook Locally

Use Razorpay's webhook test tool or curl:

```bash
curl -X POST http://localhost:3000/api/subscriptions/razorpay/webhook \
  -H "Content-Type: application/json" \
  -H "X-Razorpay-Signature: <signature>" \
  -d '{
    "id": "evt_test",
    "event": "payment.captured",
    "payload": {
      "payment": {
        "entity": {
          "id": "pay_test123",
          "status": "captured",
          "order_id": "order_test123"
        }
      }
    }
  }'
```

**Note:** Signature must be valid HMAC_SHA256 of the raw body with your webhook secret.

---

## Common Issues & Debugging

### 1. Webhook Not Processed
- Check if signature is valid
- Verify webhook secret is correct
- Check if order exists in `subscriptionPayments`

### 2. Payment Status Not Updated
- Check logs for webhook receiver
- Verify Firestore database rules allow writes
- Check if user/subscription exists

### 3. Duplicate Payments
- Webhook handler checks if razorpayOrderId already exists in billingHistory
- Prevents adding same payment twice

### 4. Amount Discrepancy
- Final amount may differ from displayed due to:
  - Promo code discount
  - Currency conversion (if applicable)
  - Rounding differences
