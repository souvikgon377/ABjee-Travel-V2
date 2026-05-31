/**
 * QueueService — Reliable Asynchronous Synchronization
 * 
 * Uses Redis (Upstash) to queue search sync tasks.
 * Prevents data loss if Typesense is temporarily down.
 */

import { getRedis } from '@/lib/server/redis';
import { enqueueLocalJob, processOneLocalJob, getLocalQueueLength } from './localQueue';

export interface QueueJob {
  type: 'SYNC' | 'DELETE';
  collection: string;
  id: string;
  data?: any;
  retries: number;
}

export class QueueService {
  private static readonly QUEUE_KEY = 'queue:search_sync';
  private static readonly MAX_RETRIES = 5;

  /**
   * Pushes a new job to the queue.
   */
  static async push(job: Omit<QueueJob, 'retries'>) {
    const redis = getRedis();
    const jobWithRetry: QueueJob = { ...job, retries: 0 };

    // If Redis isn't configured, persist the job to a local durable queue
    if (!redis) {
      console.warn('[QueueService] Redis unavailable, persisting job to local queue.');
      await enqueueLocalJob(jobWithRetry);
      return;
    }

    try {
      await redis.rpush(this.QUEUE_KEY, JSON.stringify(jobWithRetry));
      console.log(`[QueueService] Job queued: ${job.type} for ${job.id}`);
    } catch (err) {
      console.warn('[QueueService] Redis push failed, persisting job to local queue:', err);
      await enqueueLocalJob(jobWithRetry);
    }
  }

  /**
   * Processes the next job in the queue.
   * Can be called by a cron job or a long-running process.
   */
  static async processNext(processor: (job: QueueJob) => Promise<void>) {
    const redis = getRedis();

    // Try Redis first (if configured)
    if (redis) {
      try {
        const rawJob = await redis.lpop(this.QUEUE_KEY);
        if (rawJob) {
          const job = typeof rawJob === 'string' ? JSON.parse(rawJob) : rawJob;
          try {
            await processor(job);
            return;
          } catch (error) {
            console.error(`[QueueService] Job failed: ${job.id}`, error);

            // If failure is due to missing Typesense collection, attempt to
            // initialize collections and retry the job once before applying
            // the usual retry/persist logic.
            const isTypesenseNotFound =
              (error && (error as any).httpStatus === 404) || (error && (error as any).status === 404) ||
              String((error && (error as any).message) || '').includes('Collection not found') ||
              String((error && (error as any).message) || '').includes('ObjectNotFound');

            if (isTypesenseNotFound) {
              try {
                console.info('[QueueService] Detected Typesense collection missing — attempting initializeTypesense() and retry.');
                const { initializeTypesense } = await import('../search/typesenseClient');
                const initResult = await initializeTypesense();
                console.info('[QueueService] initializeTypesense result:', initResult);
                // Retry processor once after init
                try {
                  await processor(job);
                  console.info(`[QueueService] Job ${job.id} succeeded after initializeTypesense()`);
                  return;
                } catch (retryErr) {
                  console.error('[QueueService] Retry after initializeTypesense() failed:', retryErr);
                }
              } catch (initErr) {
                console.error('[QueueService] initializeTypesense() failed:', initErr);
              }
            }

            if (job.retries < this.MAX_RETRIES) {
              job.retries++;
              const { MetricsService } = await import('../analytics/MetricsService');
              await MetricsService.increment('queue_retry_count');
              // Try to requeue; if that fails we'll fall back to local persistence
              try {
                await redis.rpush(this.QUEUE_KEY, JSON.stringify(job));
                console.warn(`[QueueService] Job re-queued (Attempt ${job.retries})`);
              } catch (pushErr) {
                console.warn('[QueueService] Requeue to Redis failed, persisting locally', pushErr);
                await enqueueLocalJob(job);
              }
            } else {
              const { MetricsService } = await import('../analytics/MetricsService');
              await MetricsService.increment('queue_failure_count');
              console.error(`[QueueService] Job ${job.id} exhausted retries. Data lost.`);
            }
            return;
          }
        }
      } catch (err) {
        console.warn('[QueueService] Redis lpop failed:', err);
      }
    }

    // Redis not configured or no job available — process one local queued job if present
    try {
      await processOneLocalJob(processor);
    } catch (err) {
      console.error('[QueueService] Local queue processing failed:', err);
    }
  }

  static async getQueueLength(): Promise<number> {
    const redis = getRedis();
    const localLen = await getLocalQueueLength();
    if (!redis) return localLen;
    try {
      const redisLen = await redis.llen(this.QUEUE_KEY);
      return redisLen + localLen;
    } catch (err) {
      console.warn('[QueueService] Failed to get redis queue length:', err);
      return localLen;
    }
  }
}
