# Revenue Controls Implementation

## Overview
Added Paid (Pro) and Premium plan controllers in the admin Revenue tab, allowing admins to:
1. **Pricing Controller**: Set pricing amounts and currency for monthly/yearly Paid and Premium plans
2. **Private Room Controller**: Set max total private communities allowed per user for each paid plan

## Changes Made

### 1. Backend API Enhancement
**File**: `src/app/api/admin/settings/route.ts`
- Extended admin settings schema to store:
  - `pricing`: { currency, proMonthly, proYearly, premiumMonthly, premiumYearly }
  - `privateRoomLimits`: { pro, premium }
- Added normalization functions for amounts and limits
- Default values:
  - Pricing: INR, 2/15 (monthly/yearly) for both plans
  - Private Room Limits: 3 (Paid), 10 (Premium)

### 2. Admin Dashboard UI
**File**: `src/components/mvpblocks/index.tsx`
- Added Revenue panel form with two sections:
  - **Pricing Controller**: Input fields for currency, pro monthly/yearly, premium monthly/yearly
  - **Private Room Controller**: Input fields for total private communities per plan
- Added state management for revenue settings fetch, form updates, and save operations
- Added Save and Reset buttons with success/error feedback
- Form loads settings on dashboard mount and admins can edit/persist changes

### 3. Subscription Plan Pricing Integration
**Files**: 
- `src/lib/server/subscriptionPlans.ts`: Added configurable plan fetching functions
  - `getConfiguredSubscriptionPlans()`: Async function to fetch plans with admin-controlled pricing
  - `getConfiguredPrivateRoomLimits()`: Async function to fetch admin-controlled private room limits
  - `getConfiguredPlanByInterval()`: Fetch specific plan by interval (monthly/yearly)
- Updated all subscription routes to use configured pricing:
  - `src/app/api/subscriptions/plans/route.ts`
  - `src/app/api/subscriptions/upgrade/route.ts`
  - `src/app/api/subscriptions/coupon/validate/route.ts`
  - `src/app/api/subscriptions/coupon/redeem/route.ts`
  - `src/app/api/subscriptions/razorpay/order/route.ts`
  - `src/app/api/subscriptions/razorpay/verify/route.ts`
  - `src/app/api/subscriptions/razorpay/webhook/route.ts`

### 4. Private Room Limit Policy Updates
**File**: `src/lib/subscriptionPolicy.ts`
- Updated `getPaidPrivateRoomLimit()` to accept optional `limits` override parameter
- Updated `getPrivateRoomParticipationAllowance()` and `getPrivateRoomCreateAllowance()` to accept optional limits
- Added normalization utils for limit enforcement
- Changed messaging from "monthly/yearly" to plan-based ("Paid" and "Premium")

### 5. Client-Side Enforcement
**Files**:
- `src/screens/ChatPage.tsx`: Loads admin-configured limits on component mount and passes to allowance functions
- `src/lib/chatService.ts`: Updated enforcement logic to return early when explicit max override is provided

## Data Flow

### Setting Pricing and Limits
1. Admin opens Revenue tab → loads current settings via `adminAPI.getSettings()`
2. Admin edits pricing/limits → saves via `adminAPI.updateSettings()`
3. Settings stored in Firestore: `admin_settings` collection, `system` document

### Using Configured Settings
1. User initiates subscription upgrade → calls subscription endpoint
2. Endpoint fetches configured plans: `getConfiguredSubscriptionPlans()`
3. Returns Razorpay order with admin-set pricing
4. After payment, subscription service stores private room limit from configured settings

### Enforcing Private Room Limits
1. User creates private room → calls `createGroupRoom()`
2. Function calls `enforcePrivateRoomMembershipLimit()` with admin-configured max
3. User's current private room count compared against configured limit
4. If limit exceeded, error thrown with plan-specific message

## Testing Checklist
- [ ] Build passes: ✅ Next.js 16.2.3 build completed successfully
- [ ] Admin can open Revenue tab in admin dashboard
- [ ] Admin can view and edit pricing (currency, pro/premium monthly/yearly amounts)
- [ ] Admin can view and edit private room limits (pro/premium totals)
- [ ] Save button persists settings to Firestore
- [ ] Reset button reverts unsaved form changes
- [ ] Subscription upgrade endpoints use configured pricing
- [ ] Razorpay payments reflect configured amounts
- [ ] Private room creation enforced with configured limits
- [ ] Free users remain blocked from private communities
- [ ] Paid/Premium users see updated limits in chat UI

## Default Settings
If no custom settings are configured in admin panel, system falls back to:
- **Pricing**: ₹2 (monthly), ₹15 (yearly) for both Paid and Premium
- **Private Room Limits**: 3 total for Paid, 10 total for Premium

## Notes
- All pricing amounts support decimal values (e.g., 9.99)
- Private room limits must be positive integers
- Currency field supports any 3-4 letter ISO currency code (defaults to INR)
- Settings are globally applied; individual plan overrides not currently supported
- Admin-only feature; users cannot bypass limits set in Revenue tab
