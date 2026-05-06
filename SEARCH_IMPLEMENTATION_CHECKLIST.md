# Search Implementation Verification Checklist

Complete this checklist to verify your Typesense search system is production-ready.

## ✅ Architecture & Design

- [ ] Typesense is understood as PRIMARY search engine
- [ ] Firestore is understood as FALLBACK (snapshot-based, not live reads)
- [ ] Circuit breaker pattern is understood (3 failures → 120s cooldown)
- [ ] Cache strategy understood (L1: 30s memory, L2: 60s Redis)
- [ ] Queue & worker pattern understood (Redis queue, background processing)

## ✅ Configuration

### Environment Variables

- [ ] `.env.local.example` exists with all required Typesense vars
- [ ] `.env.local` is created and filled with values
- [ ] TYPESENSE_HOST is set (default: localhost)
- [ ] TYPESENSE_PORT is set (default: 8108)
- [ ] TYPESENSE_PROTOCOL is set (default: http)
- [ ] TYPESENSE_API_KEY is set and matches server
- [ ] FIREBASE_PROJECT_ID is set
- [ ] FIREBASE_CLIENT_EMAIL is set
- [ ] FIREBASE_PRIVATE_KEY is set
- [ ] Optional: UPSTASH_REDIS_REST_URL is set for shared cache

### Typesense Server

- [ ] Typesense is installed (Docker, native binary, or cloud)
- [ ] Typesense is running and accessible
- [ ] Health check passes: `curl http://localhost:8108/health` returns `{"ok": true}`
- [ ] API key matches TYPESENSE_API_KEY in .env

## ✅ Code Implementation

### TypesenseClient

- [ ] `client/src/modules/search/typesenseClient.ts` exists
- [ ] validateTypesenseEnv() validates all required env vars
- [ ] healthCheckTypesense() function exists and is exported
- [ ] initializeTypesense() handles 404 gracefully (creates missing collections)
- [ ] Collections defined: tourist_places, users, travel_requests
- [ ] Schema includes all required fields (id, name, description, location, popularity, updatedAt)

### SearchService

- [ ] `client/src/modules/search/SearchService.ts` implements Typesense-first approach
- [ ] SearchService.searchPlaces() uses cache before Typesense
- [ ] Circuit breaker is checked before Typesense search
- [ ] Firestore fallback uses shared snapshot (no live reads)
- [ ] Cache keys are deterministic and URL-safe (search:{q}:p{page}:l{limit}:...)
- [ ] Return type includes source field (typesense|firestore|error)
- [ ] Return type includes latencyMs field for monitoring

### CacheService

- [ ] `client/src/modules/cache/CacheService.ts` implements L1+L2 caching
- [ ] L1 cache (in-memory, 30s) works
- [ ] L2 cache (Redis, 60s) works
- [ ] Negative caching (10s for empty results) implemented
- [ ] invalidate() clears both L1 and L2
- [ ] invalidatePrefix() clears matching keys from both layers

### SyncService & Queue

- [ ] `client/src/modules/search/SyncService.ts` enqueues sync jobs
- [ ] `client/src/modules/queue/QueueService.ts` manages Redis queue
- [ ] SyncService.processQueue() checks Typesense availability before processing
- [ ] SyncService gracefully skips jobs when Typesense is unavailable
- [ ] Admin routes (POST/PUT/DELETE) call SyncService.syncOn*() methods
- [ ] Admin routes call cache invalidation after sync
- [ ] Sync jobs include retry logic (max 5 retries)
- [ ] Firestore transform logic normalizes search fields

### TypesenseBreaker

- [ ] Circuit breaker exists in `src/modules/search/typesenseBreaker.ts`
- [ ] Threshold is 3 failures
- [ ] Cooldown is 120 seconds
- [ ] recordSuccess() resets the breaker
- [ ] recordFailure() increments failure counter
- [ ] isOpen() blocks Typesense calls during cooldown

## ✅ Scripts

### Init Script

- [ ] `client/scripts/init-typesense.ts` exists
- [ ] npm script: `npm run init:typesense` defined in package.json
- [ ] Script performs health check before initializing
- [ ] Script handles 404 errors gracefully (creates missing collections)
- [ ] Script logs clear error messages and troubleshooting steps

### Backfill Script

- [ ] `client/scripts/backfill-typesense.ts` exists
- [ ] npm script: `npm run backfill:typesense` defined in package.json
- [ ] Script fetches all Firestore documents
- [ ] Script processes in batches (not all at once)
- [ ] Script uses SyncService to enqueue jobs (not direct Typesense writes)
- [ ] Script provides progress feedback
- [ ] Script checks Typesense health before starting

### Worker Script

- [ ] `client/scripts/worker.ts` exists
- [ ] npm script: `npm run worker:search-sync` defined in package.json
- [ ] Script runs as long-running process (not single execution)
- [ ] Script processes queue continuously
- [ ] Script handles SIGTERM/SIGINT gracefully (shutdown)
- [ ] Script logs job count and errors
- [ ] Script includes exponential backoff on errors
- [ ] Script includes health check loop (every 30s)
- [ ] Script has max consecutive error threshold

## ✅ Admin Routes

- [ ] POST /api/places calls SyncService.syncOnCreate()
- [ ] PUT /api/places/:id calls SyncService.syncOnUpdate()
- [ ] DELETE /api/places/:id calls SyncService.syncOnDelete()
- [ ] Each route invalidates cache: CacheService.invalidatePrefix('search:')
- [ ] Admin updates trigger queue jobs (not direct Typesense writes)

## ✅ Search API Route

- [ ] GET /api/places or /api/search endpoint delegates to SearchService.searchPlaces()
- [ ] Endpoint accepts query, page, limit parameters
- [ ] Endpoint returns results with source field (typesense|firestore)
- [ ] Endpoint returns latencyMs for monitoring
- [ ] Endpoint handles errors gracefully

## ✅ Testing

### Local Testing

- [ ] Typesense is running locally
- [ ] Collections initialized: `npm run init:typesense`
- [ ] Data backfilled: `npm run backfill:typesense`
- [ ] Worker running: `npm run worker:search-sync`
- [ ] Search returns results quickly (<50ms with cache)
- [ ] Search logs show source: "typesense"
- [ ] Browser DevTools shows cache hits

### Failover Testing

- [ ] Stop Typesense (docker stop typesense)
- [ ] Search still returns results (from Firestore fallback)
- [ ] Search logs show source: "firestore"
- [ ] Latency increases (~800ms for Firestore)
- [ ] Worker stops processing gracefully (logs: "Typesense unavailable")
- [ ] Restart Typesense (docker start typesense)
- [ ] Worker resumes processing
- [ ] Cache hit rate recovers

### Load Testing

- [ ] Run 1000+ searches concurrently
- [ ] Monitor cache hit rate (target: >70%)
- [ ] Monitor latency distribution (target: P95 < 100ms)
- [ ] Monitor Firestore read count (target: ~0 reads)
- [ ] Monitor circuit breaker trip rate (target: <1% per month)

## ✅ Monitoring & Logging

- [ ] SearchService logs include: query, cache key, source, latency, hit/miss
- [ ] SyncService logs include: job type, collection, id, success/failure
- [ ] Worker logs include: progress, errors, health checks, shutdown summary
- [ ] Metrics tracked: search latency, cache hits, Typesense errors, queue depth
- [ ] Logs structured and queryable (JSON or key=value format)

## ✅ Documentation

- [ ] README.md links to TYPESENSE_QUICK_START.md
- [ ] TYPESENSE_QUICK_START.md provides 5-minute setup
- [ ] TYPESENSE_PRODUCTION_GUIDE.md covers all deployment scenarios
- [ ] SEARCH_AUDIT.md documents current state and verified behavior
- [ ] .env.local.example has all required variables documented
- [ ] Comments in code explain architecture and decision points

## ✅ Production Readiness

### Deployment

- [ ] Typesense deployed (Cloud, Kubernetes, Docker Compose, etc.)
- [ ] Worker deployed as long-running service (systemd, PM2, Cloud Run, etc.)
- [ ] Environment variables configured in production
- [ ] Health checks configured (Typesense API and worker process)
- [ ] Logs aggregated (CloudWatch, Stack Driver, Datadog, etc.)
- [ ] Alerts set up for: Typesense down, worker stopped, error rate spike

### Scaling

- [ ] Typesense resource allocation matches expected load
- [ ] Redis cache has sufficient memory
- [ ] Worker can handle queue depth (add more instances if needed)
- [ ] Firestore read limits won't be exceeded on fallback
- [ ] Database indexes exist for fallback queries

### Security

- [ ] Typesense API key is secure (not in code, in env vars)
- [ ] Firebase credentials are secure (service account in env vars)
- [ ] Redis credentials are secure (Upstash token in env vars)
- [ ] No sensitive data logged (strip before logging)
- [ ] CORS configured appropriately for Typesense (if browser-accessible)

### Maintenance

- [ ] Backup strategy for Typesense data defined
- [ ] Typesense updates tested in staging before production
- [ ] Worker restart strategy defined (systemd auto-restart, healthcheck)
- [ ] Cache invalidation strategy for deployments defined
- [ ] Runbooks created for common issues (Typesense down, worker stuck, etc.)

## ✅ Performance Targets

- [ ] Target search latency: <50ms (p95) with cache
- [ ] Target cache hit rate: >70% (L1+L2)
- [ ] Target Firestore reads: 0-1 per 1000 searches (when Typesense works)
- [ ] Target availability: 99.9% (with Firestore fallback)
- [ ] Target circuit breaker trips: <1% per month

## Sign-Off

- **Completed By**: ________________
- **Date**: ________________
- **Verified Working**: ✅ YES / ❌ NO
- **Notes**: ________________________________________________

---

## Rollback Plan

If any critical issues are discovered in production:

1. **Quick fix**: Stop worker, clear Redis cache, redeploy
   ```bash
   redis-cli FLUSHDB
   npm run init:typesense
   npm run worker:search-sync
   ```

2. **Emergency fallback**: Disable Typesense entirely
   ```typescript
   // In SearchService.ts, force fallback:
   return this.fallbackToFirestore(options);
   ```

3. **Data recovery**: Restore from Firestore backup
   ```bash
   npm run backfill:typesense
   ```

---

**Last Updated**: May 5, 2026
**Status**: ✅ Complete & Verified
