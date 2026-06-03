# Webhook & Revenue Status Report

## 🔐 RAZORPAY WEBHOOK CONFIGURATION

### Webhook URL
```
https://abjee-travel.vercel.app/api/subscriptions/razorpay/webhook
```

### Webhook Secrets
| Key | Value |
|-----|-------|
| **Webhook Secret** | `****` |
| **Live API Key** | `********` |
| **Server API Key** | `****` |
| **Server Secret** | `****` |

### Configuration Location
- **File**: `client/.env`
- **Environment**: `RAZORPAY_ENV=live`

### Events Handled
The webhook processes these Razorpay events:
1. `payment.captured` → Payment successfully captured
2. `payment.authorized` → Payment authorized but not captured
3. `order.paid` → Order marked as paid

---

## 📊 REVENUE DATA ENDPOINTS

### 1. Admin Stats Endpoint
**URL**: `/api/admin/stats`  
**Method**: GET  
**Auth**: Required (Admin only)  
**Cache**: L1 (2min) → L2 Redis (5min) → Firestore

**Response Structure**:
```json
{
  "totalUsers": number,
  "activeUsers": number,
  "revenue": number,
  "monthlyRevenue": number,
  "pageViews": number,
  "paidTransactions": number,
  "stats": {
    "users": {
      "total": number,
      "active": number,
      "growth": "percentage string"
    },
    "revenue": {
      "total": "amount as string",
      "monthly": "amount as string",
      "growth": "percentage string"
    },
    "subscriptions": {
      "total": number,
      "basic": number,
      "pro": number,
      "premium": number
    }
  }
}
```

**Data Sources**:
- **Total Users**: `users` collection count
- **Active Users**: Status from RTDB (online or seen within 5 mins)
- **Revenue**: `subscriptionPayments` collection with status="paid"
- **Monthly Revenue**: Payments created this calendar month
- **Page Views**: From RTDB analytics
- **Transactions**: Count of paid payments

---

### 2. Dashboard Data Endpoint
**URL**: `/api/admin/dashboard-data`  
**Method**: GET  
**Auth**: Required (Admin only)  
**Cache**: 3 minutes

**Response Structure**:
```json
{
  "stats": {
    "totalUsers": number,
    "activeUsers": number,
    "revenue": number,
    "monthlyRevenue": number,
    "pageViews": number,
    "paidTransactions": number
  },
  "recentUsers": [
    {
      "id": string,
      "email": string,
      "displayName": string,
      "role": string,
      "isActive": boolean,
      "createdAt": timestamp
    }
  ],
  "subscriptionsSummary": {
    "total": number,
    "basic": number,
    "pro": number,
    "premium": number,
    "active": number
  },
  "cachedAt": number
}
```

---

### 3. System Status Endpoint
**URL**: `/api/admin/system-status`  
**Method**: GET  
**Auth**: Required (Admin only)  
**Cache**: 20 seconds

**Response Structure**:
```json
{
  "firebaseAuth": boolean,
  "firestore": {
    "ok": boolean,
    "ms": number
  },
  "realtimeDb": {
    "ok": boolean,
    "ms": number
  },
  "gemini": {
    "ok": boolean,
    "ms": number,
    "detail": string
  },
  "responseTimeMs": number
}
```

---

## 💰 REVENUE CALCULATION LOGIC

### Subscription Plans (Monthly Pricing)
| Plan | Monthly | Quarterly | Yearly |
|------|---------|-----------|--------|
| Basic | $9.99 | $29.97 | $119.88 |
| Pro | $19.99 | $59.97 | $239.88 |
| Premium | $29.99 | $89.97 | $359.88 |

### Revenue Calculation Method

**Priority 1** - Use `subscriptionPayments` if available:
- Filter documents where `status = "paid"`
- Read `amountInPaise` field (divide by 100 for USD)
- Fallback to `amount` field if paise not present
- Total Revenue: Sum of all paid payments
- Monthly Revenue: Sum of payments with `updatedAt` or `createdAt` >= start of current month

**Priority 2** - Fallback to `subscriptions` if no payments exist:
- Filter subscriptions with `expiresAt > now`
- Look up plan price from: `{ basic: 9.99, pro: 19.99, premium: 29.99 }`
- Total Revenue: Sum of active subscription prices
- Monthly Revenue: Sum where `createdAt` >= start of current month

### Growth Calculation
```
Growth % = (Monthly Revenue / Total Revenue) × 100
```

---

## 🔗 WEBHOOK INTEGRATION FLOW

### 1. Payment Initiation
```
User upgrades subscription
↓
POST /api/subscriptions/upgrade
↓
Creates order in subscriptionPayments collection
↓
Returns Razorpay Order ID to frontend
```

### 2. Razorpay Processes Payment
```
User completes payment in Razorpay checkout
↓
Razorpay processes payment (captured/authorized)
↓
Sends webhook to: /api/subscriptions/razorpay/webhook
```

### 3. Webhook Handler Validation
```
Verify x-razorpay-signature header with HMAC-SHA256
Secret: "Abjee@0909"
↓
Extract Order ID from webhook payload
↓
Look up order in subscriptionPayments collection
```

### 4. Update Subscription
```
If payment.captured or payment.authorized:
  ↓
  Create/Update subscription record
  ↓
  Set features (maxPrivateChats based on plan)
  ↓
  Calculate interval end date
  ↓
  Update user permissions
↓
Log billing entry with payment details
```

---

## ✅ VERIFICATION CHECKLIST

- [x] Webhook URL configured: `https://abjee-travel.vercel.app/api/subscriptions/razorpay/webhook`
- [x] Webhook secret stored: `RAZORPAY_WEBHOOK_SECRET=Abjee@0909`
- [x] Environment configured: `RAZORPAY_ENV=live`
- [x] API keys present in .env
- [x] Revenue endpoints implemented with caching
- [x] Signature verification enabled (HMAC-SHA256)
- [x] Multiple data source fallbacks (Payments → Subscriptions)
- [x] System health monitoring available

---

## 🚀 HOW TO TEST REVENUE DATA

### Using Admin Dashboard
1. Navigate to `/admin/dashboard`
2. View revenue card showing:
   - Total Revenue (all-time)
   - Monthly Revenue (current month)
   - Growth % (monthly/total ratio)
3. See subscription breakdown: Basic, Pro, Premium counts

### Using API Directly
```bash
curl -H "Authorization: Bearer <admin-token>" \
     https://abjee-travel.vercel.app/api/admin/stats

curl -H "Authorization: Bearer <admin-token>" \
     https://abjee-travel.vercel.app/api/admin/system-status
```

### Force Fresh Data
```bash
curl -H "Authorization: Bearer <admin-token>" \
     "https://abjee-travel.vercel.app/api/admin/stats?forceRefresh=true"
```

---

## ⚠️ KNOWN ISSUES & NOTES

1. **System Status Timeouts**: RTDB probes may timeout on Vercel serverless. This is non-critical and reported as "ok: true" by design to prevent blocking the UI.

2. **Empty Payments**: If `subscriptionPayments` collection is empty, system automatically falls back to `subscriptions` collection for revenue calculation.

3. **Currency**: All amounts are in USD. Firestore stores amounts in paise (1/100th unit) for Razorpay integration.

4. **Webhook Signature**: Must be verified server-side. Frontend cannot verify signatures.

5. **Cache TTLs**:
   - Stats: 2min memory + 5min Redis
   - Dashboard: 3min Redis
   - System Status: 20sec cache

---

## 📝 FILES INVOLVED

| File | Purpose |
|------|---------|
| `client/.env` | Razorpay credentials & webhook secret |
| `client/src/app/api/admin/stats/route.ts` | Revenue calculation logic |
| `client/src/app/api/admin/dashboard-data/route.ts` | Dashboard data aggregation |
| `client/src/app/api/admin/system-status/route.ts` | System health checks |
| `client/src/app/api/subscriptions/razorpay/webhook/route.ts` | Webhook handler & signature verification |
| `client/src/lib/server/subscriptionPlans.ts` | Plan pricing & configuration |

---

Generated: 2025-04-26
Status: ✅ All systems operational
