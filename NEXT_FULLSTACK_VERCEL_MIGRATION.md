# ABJee Travel — Full-Stack Next.js (Vercel) Migration

> Historical migration record: this document intentionally contains legacy `server/*`, Express, and Socket.IO references for traceability of the completed migration.
> Current source-of-truth for active architecture and deployment is `README.md`.

## Phase 1 — Current Backend Analysis (from `server/src/*`)

### Framework & runtime
- **Framework:** Express 4 (`server/src/server.js`)
- **Auth:** Firebase ID token verification (`server/src/middleware/auth.js`)
- **DB:** Firebase Firestore + Firebase Realtime Database (`server/src/config/firebase-admin.js`)
- **Realtime:** Socket.IO (`server/src/socket/*`, `server/src/middleware/socketAuth.js`)
- **Validation:** `express-validator` + custom validators

### Folder map (existing backend)
- `server/src/config/`
  - `firebase-admin.js`: Firebase Admin bootstrap from file/env
  - `database.js`: Firestore init + health write
- `server/src/middleware/`
  - `auth.js`: Bearer token auth + user sync + admin role checks
  - `socketAuth.js`: socket handshake auth
  - `validation.js`, `errorHandler.js`
- `server/src/models/` (service-style wrappers around Firestore)
  - `User.js`, `Subscription.js`, `TravelPartnerRequest.js`, `ChatRoom.js`, `Message.js`, `Notification.js`, `UserRole.js`
- `server/src/routes/`
  - `auth.js`, `users.js`, `subscriptions.js`, `travel-partners.js`, `notifications.js`, `admin.js`
  - `chat.js` (ESM, Firestore-backed)
  - `chat-rooms.js` (legacy CommonJS/Mongoose-style, not wired in `server.js`)
- `server/src/socket/`
  - `socketHandlers.js`, `messageModeration.js` (mixed legacy + modern patterns)

### Route handlers mounted by server
From `server/src/server.js`:
- `/api/auth`
- `/api/users`
- `/api/subscriptions`
- `/api/travel-partners`
- `/api/notifications`
- `/api/admin`
- `/api/health`

### Controllers/services pattern
- No explicit controller folder; route files call model-service classes directly.
- Business logic already mostly sits in model service classes; routes are thin-ish.

### Middleware logic
- Auth middleware verifies Firebase token and materializes/syncs `users` doc.
- Admin middleware checks `role in ['admin','owner']`.
- Rate-limit + CORS + helmet configured at Express app level.

### Database connections
- Firestore collections used: `users`, `subscriptions`, `travelPartnerRequests`, `chatRooms`, `messages`, `notifications`, `admins`, `userRoles`.
- Realtime DB paths used: `chatrooms`, `messages` (admin/chatroom management + legacy socket/chat flows).

### Authentication
- Firebase ID token (`Authorization: Bearer <token>`)
- Admin role resolved from token/custom claim or `admins` collection fallback.

### Realtime / websocket
- Socket.IO server handlers exist but are inconsistent with current frontend Firebase RTDB chat service.
- `server.js` in this snapshot does not initialize/socket-bind these handlers.

### File uploads
- No strong server upload route currently; frontend uploads directly to Cloudinary unsigned in `client/src/lib/imageUpload.ts`.

### External APIs
- Firebase Admin SDK
- Cloudinary upload API (frontend direct)

### Environment variables in backend
- `FIREBASE_SERVICE_ACCOUNT`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_DATABASE_URL`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX_REQUESTS`
- `PORT`
- `NODE_ENV`

---

## Phase 2 — Target Next.js Full-Stack Architecture

```text
client/src/
  app/
    api/
      auth/
      users/
      subscriptions/
      travel-partners/
      notifications/
      admin/
      upload/
      health/
  components/
  hooks/
  lib/
    server/
      firebaseAdmin.ts
      auth.ts
      http.ts
  services/
    userService.ts
    subscriptionService.ts
    travelPartnerRequestService.ts
    notificationService.ts
    adminService.ts
  types/
  screens/
public/
```

### Exact move map (backend -> Next)
- `server/src/config/firebase-admin.js` -> `client/src/lib/server/firebaseAdmin.ts`
- `server/src/middleware/auth.js` -> `client/src/lib/server/auth.ts`
- `server/src/models/User.js` -> `client/src/services/userService.ts`
- `server/src/models/Subscription.js` -> `client/src/services/subscriptionService.ts`
- `server/src/models/TravelPartnerRequest.js` -> `client/src/services/travelPartnerRequestService.ts`
- `server/src/routes/auth.js` -> `client/src/app/api/auth/*/route.ts`
- `server/src/routes/users.js` -> `client/src/app/api/users/*/route.ts`
- `server/src/routes/subscriptions.js` -> `client/src/app/api/subscriptions/*/route.ts`
- `server/src/routes/travel-partners.js` -> `client/src/app/api/travel-partners/*/route.ts`
- `server/src/routes/admin.js` -> `client/src/app/api/admin/*/route.ts`
- `server/src/routes/notifications.js` -> `client/src/app/api/notifications/*/route.ts`
- `server/src/server.js /api/health` -> `client/src/app/api/health/route.ts`

---

## Phase 3 — Express -> Next API conversion examples

### Users endpoint
Express:
```js
router.get('/profile', authenticate, async (req, res) => { ... })
```
Next:
```ts
// src/app/api/users/profile/route.ts
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  return ok({ user })
}
```

### Chat endpoint pattern
Express:
```js
router.post('/rooms/:roomId/join', authenticate, async (req, res) => { ... })
```
Next:
```ts
// src/app/api/chat/rooms/[roomId]/join/route.ts
export async function POST(req: NextRequest, { params }: { params: { roomId: string } }) {
  const user = await authenticateRequest(req)
  const room = await chatRoomService.findById(params.roomId)
  ...
}
```

### Upload endpoint pattern
Express:
```js
app.post('/api/upload', ...)
```
Next:
```ts
// src/app/api/upload/route.ts
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file')
  ...
}
```

---

## Phase 4 — Business Logic in services

Implemented:
- `client/src/services/userService.ts`
- `client/src/services/subscriptionService.ts`
- `client/src/services/travelPartnerRequestService.ts`

Pattern enforced:
- `route.ts` files do auth/validation/response only.
- Firestore logic centralized in service classes.

---

## Phase 5 — Frontend API call migration

Implemented:
- `client/src/contexts/AuthContext.tsx`
  - Replaced `${NEXT_PUBLIC_SERVER_URL}/api/...` with `/api/...`
- `client/src/components/auth/AuthMultiStepForm.tsx`
  - Replaced `${NEXT_PUBLIC_SERVER_URL}/api/auth/me` with `/api/auth/me`
- `client/src/lib/api.ts`
  - Axios base remains local-origin and points to `/api`

Required follow-up sweep:
- Remove remaining hardcoded socket server usage if Socket.IO is fully removed (`client/src/lib/socket.ts`).

---

## Phase 6 — Environment variable migration

Implemented in template:
- Updated `client/.env.local.example`
- Removed external backend URL dependency
- Added server-only Firebase Admin keys:
  - `FIREBASE_SERVICE_ACCOUNT` **or** split admin credentials
  - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

Rule:
- `NEXT_PUBLIC_*` only for browser-safe keys.
- Secrets stay unprefixed and only used in route handlers/services.

---

## Phase 7 — Realtime strategy (Vercel-compatible)

### Implemented for this codebase
Using **Firebase Realtime Database as primary realtime channel** (`client/src/lib/chatService.ts`) and **Socket.IO client/server path is retired**.

Why:
- Vercel serverless is not ideal for persistent Socket.IO without external stateful infrastructure.
- Current app already uses Firebase RTDB for chat presence/messages.

Alternative if strict websocket needed:
- Pusher / Ably / Supabase Realtime.

Migration action:
- Keep `client/src/lib/chatService.ts` as realtime source.
- `client/src/lib/socket.ts` removed from frontend runtime.

---

## Phase 8 — Uploads

Implemented:
- `client/src/app/api/upload/route.ts`
  - Accepts multipart file
  - Forwards to Cloudinary
  - Returns uploaded asset metadata

Frontend action:
- Switch image upload helpers to call `/api/upload` instead of direct Cloudinary browser upload when secret/signed flow is required.

---

## Phase 9 — Auth integration

Implemented:
- `client/src/lib/server/auth.ts`
  - Bearer token verification with Firebase Admin
  - User profile provisioning/sync
  - Admin role check helper
- API routes use this helper for protected endpoints.

For route protection at page level:
- Add `middleware.ts` for pathname-level checks if needed.
- For App Router, preferred approach is server-side checks in route handlers + client guards in UI.

Example middleware skeleton:
```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  // Optional: lightweight checks; avoid heavy Firebase verify in middleware for cost/latency
  return NextResponse.next()
}

export const config = { matcher: ['/admin/:path*'] }
```

---

## Phase 10 — Remove old server

### Completed
1. Deleted `server/`
2. Removed old root backend deploy artifacts (`render.yaml`, `deploy.ps1`, `deploy.sh`)
3. Removed external backend rewrite reliance
4. Removed unused frontend deps:
   - `socket.io-client` ✅
   - `react-router-dom` ✅

Additional cleanup completed:
- Removed legacy frontend bootstrap files:
  - `client/vite.config.ts`

---

## Phase 11 — Vercel optimization

Implemented/Current:
- API routes run as serverless functions (`runtime = 'nodejs'`).
- `next-pwa` enabled for production.

Recommended final pass:
- Use `next/image` for all non-critical image tags where possible.
- Add route-level caching for read-only APIs (`revalidate` where safe).
- Use dynamic imports for heavy chat/admin UI blocks.
- Keep Firebase Admin singleton initialization (already done) to avoid cold-start overhead.

---

## Phase 12 — Final flow (single stack)

Browser -> Next page (`src/app/*`) -> Next route handler (`src/app/api/*/route.ts`) -> service (`src/services/*`) -> Firebase (Firestore/RTDB) -> JSON response.

### Modes
- **Dev:** `npm run dev`
- **Build:** `npm run build`
- **Vercel:** deploy `client/` only with env vars set in Vercel project settings

---

## What is already integrated in code (this pass)

- Added server runtime/auth layer:
  - `client/src/lib/server/firebaseAdmin.ts`
  - `client/src/lib/server/auth.ts`
  - `client/src/lib/server/http.ts`
- Added services:
  - `client/src/services/userService.ts`
  - `client/src/services/subscriptionService.ts`
  - `client/src/services/travelPartnerRequestService.ts`
- Added API routes:
  - `client/src/app/api/health/route.ts`
  - `client/src/app/api/auth/me/route.ts`
  - `client/src/app/api/auth/logout/route.ts`
  - `client/src/app/api/users/profile/route.ts`
  - `client/src/app/api/users/search/route.ts`
  - `client/src/app/api/subscriptions/plans/route.ts`
  - `client/src/app/api/subscriptions/current/route.ts`
  - `client/src/app/api/subscriptions/upgrade/route.ts`
  - `client/src/app/api/subscriptions/cancel/route.ts`
  - `client/src/app/api/subscriptions/usage/route.ts`
  - `client/src/app/api/subscriptions/billing-history/route.ts`
  - `client/src/app/api/upload/route.ts`
- Updated frontend API calls to local `/api` in:
  - `client/src/contexts/AuthContext.tsx`
  - `client/src/components/auth/AuthMultiStepForm.tsx`
- Removed backend proxy rewrite from:
  - `client/next.config.ts`
- Updated env template:
  - `client/.env.local.example`
- Added dependency:
  - `firebase-admin` in `client/package.json`
