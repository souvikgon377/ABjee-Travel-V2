# 🧠 INCREMENTAL SEARCH: PRODUCTION STRATEGY (FAIL-FAST)

This document covers the highly resilient search architecture finalized on April 28, 2026. This has been fully updated to persist across server restarts, effectively providing self-healing durability to the system.

## 1. Failover Lifecycle

- **Request & Read Phase:** Every time an Admin searches, the system will test `safeRedis()`. If Redis is active, it runs natively. If the limit is exceeded, an internal circuit breaker triggers: `REDIS_BLOCKED_UNTIL`. While blocked, searches bypass Redis completely and rely exclusively on a pre-loaded local snapshot filter (`fallbackSearch()`).
- **Writing & Updating Phase:** Any Admin operations (Edit/Add/Delete) try to write to Redis (using `safeUpsert` and `safeDelete`). If the quota is blown or a timeout occurs, these requests do not fail. They are written to a physical disk queue file: `.search_queue.json`.
- **Background Restitution:** An automated background worker polls `replayQueue()`. If Redis limits lift, it continuously drains operations from `.search_queue.json`.
  - **Dynamic Backoff:** A self-healing retry loop dynamically backs off on consecutive failures (doubling `retryDelay` up to 5 mins), avoiding spamming Upstash.
- **Smarter Reconnection**: When `REDIS_BLOCKED_UNTIL` naturally expires, the system explicitly sends an `await redis.ping()` before routing public traffic into it again. If the ping times out, the block increments by 60 seconds without allowing an uncatchable storm.

## 2. Disk-Backed Snapshot Engine

Every 5 minutes, an insulation loop attempts to dump all current items from Redis dynamically into Node memory and physical memory (`.search_snapshot.json`). If the machine restarts during a Redis blackout, it automatically bootstraps from `.search_snapshot.json`.

When users query during a downtime:
- Perfect Name Match = 100pts
- Starts With Prefix = 80pts
- General Description includes = 50pts
- City/State exact matches = +40/30pts

## 3. System Auditing

The Node server will naturally output its stability state into the server console every 60 seconds using `logSystemStatus()`, keeping an eye on queue backing levels and Redis connectivity status.
