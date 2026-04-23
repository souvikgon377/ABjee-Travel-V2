import { Redis } from '@upstash/redis';

export const resolveRedisRestConfig = () => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.UPSTASH_REDIS_REST_ioURL ||
    process.env.REDIS_REST_URL ||
    '';
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.UPSTASH_REDIS_REST_ioTOKEN ||
    process.env.REDIS_REST_TOKEN ||
    '';

  return {
    url: url.trim(),
    token: token.trim(),
  };
};

const { url: REDIS_URL, token: REDIS_TOKEN } = resolveRedisRestConfig();

let redis: Redis | null = null;

export const initRedis = (): Redis | null => {
  if (redis) return redis;

  if (!REDIS_URL || !REDIS_TOKEN) {
    console.warn('[Redis] ENV vars missing: UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_ioURL/REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN/UPSTASH_REDIS_REST_ioTOKEN/REDIS_REST_TOKEN');
    return null;
  }

  try {
    redis = new Redis({
      url: REDIS_URL,
      token: REDIS_TOKEN,
    });
    console.info('[Redis] Client initialized successfully');
    return redis;
  } catch (error) {
    console.error('[Redis] Initialization failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
};

export const getRedis = (): Redis | null => {
  return redis || initRedis();
};

export const safeRedisCall = async <T>(
  operation: (client: Redis) => Promise<T>,
  fallback: T,
  label: string,
): Promise<T> => {
  const client = getRedis();
  if (!client) {
    console.warn(`[Redis] ${label}: Skipped (Redis not available)`);
    return fallback;
  }

  try {
    return await operation(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Redis] ${label}: Failed with error: ${message}`);
    return fallback;
  }
};
