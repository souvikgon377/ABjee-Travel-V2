// Upstash Redis client for server-side operations.
// Falls back to `null` when Upstash env vars are not provided.

import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;

export const initRedis = (): Redis | null => {
  if (redisClient) return redisClient;

  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || '').replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || '';

  if (!url || !token) {
    console.warn('[redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set; Redis disabled.');
    return null;
  }

  try {
    redisClient = new Redis({ url, token });
    console.info('[redis] Upstash Redis client initialized');
    return redisClient;
  } catch (err) {
    console.error('[redis] Failed to initialize Upstash Redis client', err);
    return null;
  }
};

export const getRedis = (): Redis | null => {
  return redisClient || initRedis();
};

export const safeRedisCall = async <T>(
  operation: (client: Redis) => Promise<T>,
  fallback: T,
  label?: string,
): Promise<T> => {
  const client = getRedis();
  if (!client) {
    if (label) console.warn(`[redis] ${label} skipped: Redis unavailable`);
    return fallback;
  }

  try {
    return await operation(client);
  } catch (err) {
    console.warn(`[redis] ${label || 'operation'} failed:`, err);
    return fallback;
  }
};

export const resolveRedisRestConfig = () => ({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || '',
});
