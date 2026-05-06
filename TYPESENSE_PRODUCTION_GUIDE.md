# Typesense Production Setup & Deployment Guide

This guide covers the complete setup, deployment, and operation of the production-grade Typesense search system for AbJee Travel.

**Quick Facts:**
- Primary: Typesense search engine
- Fallback: Firestore snapshot cache (zero live reads)
- Cache: L1 (30s in-memory) + L2 (60s Redis)
- Circuit Breaker: 3 failures → 2 min cooldown
- Zero Firestore reads on search when Typesense works

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Local Development Setup](#local-development-setup)
3. [Production Deployment](#production-deployment)
4. [Monitoring & Debugging](#monitoring--debugging)
5. [Troubleshooting](#troubleshooting)
6. [Performance Targets](#performance-targets)

---

## Architecture Overview

```
User Request
    ↓
[L1 Cache: 30s in-memory] ← HIT → Return cached
    ↓
[L2 Cache: 60s Redis] ← HIT → Store in L1 + Return
    ↓
[Circuit Breaker] ← OPEN → Fallback to Firestore
    ↓
[Typesense Search] ← PRIMARY
    ├─ SUCCESS → Store in cache + Return
    └─ FAILURE → Trip breaker + Fallback to Firestore
        ↓
[Firestore Snapshot Cache] ← SECONDARY (no live reads)
    ├─ In-memory filter + paginate
    └─ Return (source: firestore)
```

### Key Design Decisions

1. **Typesense as Primary**
   - All searches prefer Typesense
   - No Firestore reads when Typesense works
   - Minimal latency (<50ms target)

2. **Graceful Fallback**
   - When Typesense fails: use Firestore snapshot (pre-loaded)
   - Snapshot is refreshed in background
   - No exponential backoff or error amplification

3. **Multi-Tier Cache**
   - L1: 30s in-memory (fastest, per-process)
   - L2: 60s Redis (shared across instances)
   - Negative cache: 10s for empty results

4. **Circuit Breaker**
   - 3 failures → Open for 120s
   - Prevents cascading failures
   - Automatic recovery when Typesense is back

---

## Local Development Setup

### Prerequisites

- Docker & Docker Compose (for Typesense)
- Node.js 18+
- npm or yarn
- Firebase Admin credentials
- Redis (Upstash REST endpoint)

### Step 1: Configure Environment Variables

```bash
cd client
cp .env.local.example .env.local
```

Edit `.env.local`:

```bash
# Typesense (Local Dev)
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http
TYPESENSE_API_KEY=xyz

# Firebase (from Firebase Console)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=xxx@xxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
FIREBASE_DATABASE_URL=https://your-project-id.firebaseio.com

# Redis (optional, for shared cache across instances)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

### Step 2: Start Typesense (Docker)

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
```

Verify it's running:

```bash
curl http://localhost:8108/health
```

Expected output:
```json
{
  "ok": true
}
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Initialize Typesense Collections

```bash
npm run init:typesense
```

Expected output:
```
🚀 Starting Typesense Initialization...

📡 Checking Typesense connectivity at localhost:8108...
✅ Typesense is healthy

📝 Initializing collections...

✅ Typesense initialization complete in 0.45s
📊 Summary:
   ✨ tourist_places: created
   ✨ users: created
   ✨ travel_requests: created
```

### Step 5: Backfill Existing Data

```bash
npm run backfill:typesense
```

This queues all Firestore documents for sync. Progress:

```
🚀 Starting Typesense Full Backfill...

📡 Checking Typesense connectivity...
✅ Typesense is healthy

🗺️  Tourist Places
   📡 Fetching Places from Firestore...
   📝 Found 234 items to sync. Processing in batches of 50...

   📦 Batch 1/5:
      ✅ Batch complete: 50/234 synced (21.4%)
   📦 Batch 2/5:
      ✅ Batch complete: 100/234 synced (42.7%)
   ...
   🎉 Places sync queued: 234 documents

✅ Full Backfill Complete in 2.34s!
📊 Summary:
   - Tourist Places: 234 queued for sync

💡 Next Steps:
   1. Start the worker: npm run worker:search-sync
   2. Monitor logs for sync progress
   3. Verify data in Typesense: curl http://localhost:8108/collections/tourist_places
```

### Step 6: Start the Sync Worker

In a separate terminal:

```bash
npm run worker:search-sync
```

This processes the backfill queue and handles real-time syncs. Output:

```
👷 Search Sync Worker Started
📋 Configuration:
   - Typesense: localhost:8108
   - Health Check Interval: 30s
   - Process ID: 12345

[Worker] ✅ Typesense is healthy
[Worker] 📊 Progress: 10 jobs processed, 0 errors
[Worker] 📊 Progress: 20 jobs processed, 0 errors
...
```

Keep this running in production (via PM2, systemd, or Docker).

### Step 7: Test Search

```bash
npm run dev
```

Navigate to search page and test:
- Query: "taj mahal" → should return results from Typesense
- Check browser console logs for `source: "typesense"` or `source: "firestore"`

---

## Production Deployment

### Option A: Cloud Typesense

1. **Create Account**: Sign up at https://cloud.typesense.org
2. **Create Cluster**: 2GB+ RAM recommended for >10k documents
3. **Get Credentials**: Copy host, port, API key
4. **Update `.env.production`**:

```bash
TYPESENSE_HOST=xxx-123.c.typesense.org
TYPESENSE_PORT=443
TYPESENSE_PROTOCOL=https
TYPESENSE_API_KEY=xxxxx
```

5. **Deploy**:
```bash
npm run init:typesense
npm run backfill:typesense
npm run worker:search-sync
```

### Option B: Self-Hosted Typesense (Docker Swarm / Kubernetes)

#### Docker Compose (Staging/Small Production)

```yaml
version: '3.8'
services:
  typesense:
    image: typesense/typesense:latest
    container_name: typesense
    ports:
      - "8108:8108"
      - "8107:8107"
    volumes:
      - typesense_data:/data
    environment:
      - TYPESENSE_DATA_DIR=/data
      - TYPESENSE_API_KEY=${TYPESENSE_API_KEY:-xyz}
      - TYPESENSE_ENABLE_CORS=true
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8108/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  worker:
    build: .
    container_name: search-worker
    environment:
      TYPESENSE_HOST: typesense
      TYPESENSE_PORT: 8108
      TYPESENSE_PROTOCOL: http
      TYPESENSE_API_KEY: ${TYPESENSE_API_KEY:-xyz}
      FIREBASE_PROJECT_ID: ${FIREBASE_PROJECT_ID}
      FIREBASE_CLIENT_EMAIL: ${FIREBASE_CLIENT_EMAIL}
      FIREBASE_PRIVATE_KEY: ${FIREBASE_PRIVATE_KEY}
    command: npm run worker:search-sync
    depends_on:
      typesense:
        condition: service_healthy
    restart: unless-stopped

volumes:
  typesense_data:
    driver: local
```

Deploy:
```bash
docker-compose up -d
docker-compose logs -f worker
```

#### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: typesense
spec:
  replicas: 1
  selector:
    matchLabels:
      app: typesense
  template:
    metadata:
      labels:
        app: typesense
    spec:
      containers:
      - name: typesense
        image: typesense/typesense:latest
        ports:
        - containerPort: 8108
        - containerPort: 8107
        env:
        - name: TYPESENSE_DATA_DIR
          value: /data
        - name: TYPESENSE_API_KEY
          valueFrom:
            secretKeyRef:
              name: typesense-secret
              key: api-key
        - name: TYPESENSE_ENABLE_CORS
          value: "true"
        volumeMounts:
        - name: data
          mountPath: /data
        livenessProbe:
          httpGet:
            path: /health
            port: 8108
          initialDelaySeconds: 10
          periodSeconds: 30
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: typesense-pvc

---
apiVersion: v1
kind: Service
metadata:
  name: typesense
spec:
  selector:
    app: typesense
  ports:
  - name: api
    port: 8108
    targetPort: 8108
  - name: peering
    port: 8107
    targetPort: 8107
  type: ClusterIP
```

Deploy:
```bash
kubectl apply -f typesense-deployment.yaml
kubectl apply -f search-worker-deployment.yaml
```

### Environment Setup (Production)

Create `.env.production`:

```bash
# Typesense (Cloud or Self-Hosted)
TYPESENSE_HOST=your-cloud-host.typesense.org
TYPESENSE_PORT=443
TYPESENSE_PROTOCOL=https
TYPESENSE_API_KEY=xxxx

# Firebase
FIREBASE_PROJECT_ID=your-prod-project
FIREBASE_CLIENT_EMAIL=xxx@xxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Debug off
TYPESENSE_DEBUG=false
```

### Initialize & Backfill (Production)

```bash
# SSH into production server / container
npm run init:typesense
npm run backfill:typesense

# In screen/tmux session:
npm run worker:search-sync
```

Or use PM2:

```bash
pm2 start npm --name "search-worker" -- run worker:search-sync
pm2 save
pm2 startup
```

---

## Monitoring & Debugging

### Logs to Watch

1. **Typesense Startup**:
```bash
docker logs -f typesense
# Expected: "Typesense server listening on" and "Health"
```

2. **Worker Processing**:
```bash
pm2 logs search-worker
# Expected: "Progress: 10 jobs processed, 0 errors"
```

3. **Search Requests** (in Next.js app):
```bash
# Browser console or server logs
[SearchService] Query: "taj mahal", CacheKey: search:taj%20mahal:p1:l10:c=all:a=1
[SearchService] ✅ Typesense found 42 results in 35ms
```

### Debugging Commands

**Health Check**:
```bash
curl http://localhost:8108/health
# {"ok": true}
```

**Get Collection Stats**:
```bash
curl -H "X-TYPESENSE-API-KEY: xyz" \
  http://localhost:8108/collections/tourist_places
```

**List All Collections**:
```bash
curl -H "X-TYPESENSE-API-KEY: xyz" \
  http://localhost:8108/collections
```

**Check Cache Hit Rate**:
```bash
# In app logs, grep for:
grep "source.*cache.*hit.*true" app.log | wc -l
```

**Monitor Queue**:
```bash
# Check Redis queue length (if using Redis queue)
redis-cli LLEN search:sync:queue
```

---

## Troubleshooting

### Issue 1: "Typesense is not reachable"

```
❌ Typesense initialization failed:
   Typesense is not reachable. Make sure it's running...
```

**Fix**:
```bash
# Check if Typesense is running
curl http://localhost:8108/health

# If not running, start it
docker run -p 8108:8108 -p 8107:8107 typesense/typesense:latest \
  --data-dir=/data --api-key=xyz --enable-cors

# If connection refused, check firewall/network
telnet localhost 8108
ping typesense-host (if remote)
```

### Issue 2: Collection 404 during initialization

```
❌ Error checking collection...
   404: Collection not found
```

**Fix**:
This is expected on first run. The init script should handle it and create the collection. If it doesn't:

```bash
# Manually check which collections exist
curl -H "X-TYPESENSE-API-KEY: xyz" \
  http://localhost:8108/collections

# If empty, run init again
npm run init:typesense
```

### Issue 3: Worker keeps saying "Typesense is unavailable"

```
[Worker] ⚠️ Typesense is unavailable. Will retry after delay...
```

**Fix**:
```bash
# Check worker configuration
echo $TYPESENSE_HOST
echo $TYPESENSE_PORT

# Verify Typesense health
curl http://localhost:8108/health

# Check worker logs for error details
pm2 logs search-worker | grep "Worker.*Error"

# Restart worker after Typesense is up
npm run worker:search-sync
```

### Issue 4: High latency or missing results

```
[SearchService] ✅ Typesense found 0 results in 1200ms
```

**Possible causes**:
1. **Data not synced**: Run `npm run backfill:typesense` again
2. **Wrong schema**: Check if fields match query_by in SearchService.ts
3. **Stale cache**: Clear Redis: `redis-cli FLUSHDB`
4. **Typesense slow**: Check Typesense metrics, increase resources

**Verify data in Typesense**:
```bash
curl -H "X-TYPESENSE-API-KEY: xyz" \
  "http://localhost:8108/collections/tourist_places/documents/search?q=taj&query_by=name"
```

### Issue 5: Circuit breaker constantly open

```
[SearchService] Circuit breaker is open, falling back to Firestore
```

**Fix**:
```bash
# Check Typesense health
curl http://localhost:8108/health

# Check for errors in Typesense logs
docker logs typesense | grep -i error

# Increase connection timeout in typesenseClient.ts
// Change connectionTimeoutSeconds from 5 to 10
```

---

## Performance Targets

### Expected Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| Typesense Search Latency | <50ms | P95, without cache |
| Cache Hit Rate | >70% | L1 + L2 combined |
| Firestore Reads | ~0 | Per 1000 searches when Typesense works |
| Worker Sync Latency | <100ms | Per document |
| Circuit Breaker Trips | <1% | Monthly |
| Availability | 99.9% | With fallback to Firestore |

### Load Testing

```bash
# Simple load test (Apache Bench)
ab -n 1000 -c 10 \
  "http://localhost:3000/api/search?q=taj&limit=10"

# Expected: >50% L1/L2 cache hits within first 100 requests
```

### Monitoring Setup (Optional)

**Prometheus Metrics**:
```typescript
// Add to SearchService.ts
import { register, Counter, Histogram } from 'prom-client';

const searchLatency = new Histogram({
  name: 'search_latency_ms',
  help: 'Search latency in milliseconds',
  buckets: [10, 50, 100, 500, 1000],
});

const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['tier'],
});
```

**Grafana Dashboard**:
- Search latency P50/P95/P99
- Cache hit rate (L1 vs L2)
- Circuit breaker state
- Worker job processing rate
- Firestore read count

---

## Maintenance

### Daily Tasks
- Monitor worker logs for errors
- Check Typesense health: `curl http://localhost:8108/health`
- Monitor cache hit rates in logs

### Weekly Tasks
- Review search latency metrics
- Check circuit breaker trip frequency
- Verify worker is caught up on sync queue

### Monthly Tasks
- Full backfill test: `npm run backfill:typesense`
- Test failover to Firestore (intentionally stop Typesense)
- Update Typesense version: `docker pull typesense/typesense:latest`
- Review and optimize slow queries

### Scaling

**When to Scale**:
- Search latency >100ms → Upgrade Typesense plan
- Cache hit rate <50% → Increase Redis/Memcached size
- Worker lag >5min → Add more worker instances
- Firestore reads spike → Check for broken searches

**Scaling Steps**:
1. Upgrade Typesense resource allocation
2. Increase Redis cache size
3. Add more worker instances (horizontal scaling)
4. Enable Redis persistence for L2 cache

---

## Questions?

- **Typesense Docs**: https://typesense.org/docs/
- **Firebase Docs**: https://firebase.google.com/docs
- **Circuit Breaker Pattern**: https://martinfowler.com/bliki/CircuitBreaker.html

---

**Last Updated**: May 5, 2026
**Status**: Production Ready ✅
