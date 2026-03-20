# Admin Setup (Current)

ABjee Travel now runs as a single full-stack Next.js New app.

## Requirements
- Configure Firebase Admin env vars in `client/.env.local` (see `client/.env.local.example`).
- Ensure admin role data exists in Firestore collections used by auth logic.

## Access
- Open `/admin` in the app.
- Role validation is enforced in Next API auth flow (`client/src/lib/server/auth.ts`).

## References
- `README.md`
- `NEXT_FULLSTACK_VERCEL_MIGRATION.md`
