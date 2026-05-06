/**
 * QueueService — Reliable Asynchronous Synchronization
 * 
 * Uses Redis (Upstash) to queue search sync tasks.
 * Prevents data loss if Typesense is temporarily down.
 */

import { getRedis } from '@/lib/server/redis';

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
    if (!redis) {
      console.warn('[QueueService] Redis unavailable, sync might be delayed.');
      return;
    }

    const jobWithRetry: QueueJob = { ...job, retries: 0 };
    await redis.rpush(this.QUEUE_KEY, JSON.stringify(jobWithRetry));
    console.log(`[QueueService] Job queued: ${job.type} for ${job.id}`);
  }

  /**
   * Processes the next job in the queue.
   * Can be called by a cron job or a long-running process.
   */
  static async processNext(processor: (job: QueueJob) => Promise<void>) {
    const redis = getRedis();
    if (!redis) return;

    const rawJob = await redis.lpop(this.QUEUE_KEY);
    if (!rawJob) return;

    const job = typeof rawJob === 'string' ? JSON.parse(rawJob) : rawJob;

    try {
      await processor(job);
    } catch (error) {
      console.error(`[QueueService] Job failed: ${job.id}`, error);
      
      if (job.retries < this.MAX_RETRIES) {
        job.retries++;
        // Track retry metric
        const { MetricsService } = await import('../analytics/MetricsService');
        await MetricsService.increment('queue_retry_count');
        
        // Push back to the end for later retry
        await redis.rpush(this.QUEUE_KEY, JSON.stringify(job));
        console.warn(`[QueueService] Job re-queued (Attempt ${job.retries})`);
      } else {
        const { MetricsService } = await import('../analytics/MetricsService');
        await MetricsService.increment('queue_failure_count');
        console.error(`[QueueService] Job ${job.id} exhausted retries. Data lost.`);
      }
    }
  }

  static async getQueueLength(): Promise<number> {
    const redis = getRedis();
    if (!redis) return 0;
    return await redis.llen(this.QUEUE_KEY);
  }
}
