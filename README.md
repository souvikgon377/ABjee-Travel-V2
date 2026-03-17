# ABjee Travel

ABjee Travel is now a single full-stack Next.js application (App Router) designed for Vercel deployment.

## Stack

- Next.js 15 (App Router)
- React 19 + TypeScript
- Tailwind CSS
- Firebase (Auth, Firestore, Realtime Database)
- Firebase Admin (server-side, inside Next API routes)

## Local Setup

### 1) Install

```bash
cd client
npm install
```

### 2) Configure environment

Copy and fill:

```bash
cp .env.local.example .env.local
```

Required groups:
- `NEXT_PUBLIC_FIREBASE_*` (client SDK)
- `FIREBASE_SERVICE_ACCOUNT` or split admin vars (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
- Optional Cloudinary vars for upload route

### 3) Run

```bash
cd client
npm run dev
```

App runs at `http://localhost:3000`.

## Build

```bash
cd client
npm run build
npm run start
```

## Deployment

- Deploy only the `client` app to Vercel.
- Configure the same env vars in Vercel project settings.
- API routes are provided under `client/src/app/api/*`.

## Realtime Strategy

- Primary realtime channel is Firebase Realtime Database via `chatService`.
- No separate Socket.IO server is required.

## Project Structure

```text
AbJee-Travel/
  client/
    src/
      app/           # Next routes + API handlers
      components/    # UI/features
      contexts/      # Auth and app contexts
      lib/           # Client + server libs
      services/      # Firestore/Firebase business logic
```

## Notes

- Legacy split-server architecture has been removed from this repository.
- Migration details are captured in `NEXT_FULLSTACK_VERCEL_MIGRATION.md`.
