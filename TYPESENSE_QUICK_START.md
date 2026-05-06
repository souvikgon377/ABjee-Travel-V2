# Typesense Quick Start Guide

Get the search system running in 5 minutes.

## Prerequisites
- Node.js 18+
- Docker (for Typesense)
- Firebase credentials
- Redis (Upstash endpoint, optional but recommended)

## Quick Setup

### 1. Configure Environment (1 min)

```bash
cd client
cp .env.local.example .env.local
```

Edit `.env.local` with your values:
```bash
# Typesense
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http
TYPESENSE_API_KEY=xyz

# Firebase (from Firebase Console)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=xxx@xxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Redis (optional)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

### 2. Start Typesense (1 min)

```bash
docker run -d \
  --name typesense \
  -p 8108:8108 \
  -p 8107:8107 \
  -v typesense_data:/data \
  typesense/typesense:latest \
  --data-dir=/data \
  --api-key=xyz \
  --enable-cors

# Verify it's running
curl http://localhost:8108/health
# {"ok": true}
```

### 3. Install & Initialize (2 min)

```bash
npm install
npm run init:typesense
# ✅ Typesense initialization complete
```

### 4. Backfill Data (1 min)

```bash
npm run backfill:typesense
# 🎉 Full Backfill Complete in 2.34s!
# - Tourist Places: 234 queued for sync
```

### 5. Start Worker

```bash
# In another terminal
npm run worker:search-sync
# 👷 Search Sync Worker Started
# [Worker] 📊 Progress: 50 jobs processed, 0 errors
```

### 6. Test It

```bash
npm run dev
```

Navigate to search page:
- Query: "taj mahal"
- Check browser console for: `source: "typesense"` ✅
- Latency should be <50ms

## Common Commands

```bash
# Initialize collections
npm run init:typesense

# Backfill all existing data
npm run backfill:typesense

# Start sync worker
npm run worker:search-sync

# Check Typesense health
curl http://localhost:8108/health

# Check collections
curl -H "X-TYPESENSE-API-KEY: xyz" http://localhost:8108/collections

# Development
npm run dev

# Production build
npm run build && npm start
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ECONNREFUSED` | Start Typesense: `docker run ... typesense/typesense:latest ...` |
| `Collection not found` | Run `npm run init:typesense` |
| No results in search | Run `npm run backfill:typesense` and start worker |
| High latency (>200ms) | Check L1/L2 cache hit rate in logs |
| Worker not processing | Check Typesense health: `curl http://localhost:8108/health` |

## Performance

- **Target**: <50ms searches with cache hits
- **Cache**: 30s in-memory + 60s Redis
- **Fallback**: Firestore snapshot (no live reads)
- **Circuit Breaker**: Auto-recovers when Typesense is back

## Next Steps

- Read [TYPESENSE_PRODUCTION_GUIDE.md](./TYPESENSE_PRODUCTION_GUIDE.md) for deployment
- Monitor worker logs: `pm2 logs search-worker`
- Set up alerts for circuit breaker trips

## Full Docs

See [TYPESENSE_PRODUCTION_GUIDE.md](./TYPESENSE_PRODUCTION_GUIDE.md) for:
- Cloud deployment options
- Production configurations
- Monitoring & debugging
- Scaling strategies
- Advanced troubleshooting
