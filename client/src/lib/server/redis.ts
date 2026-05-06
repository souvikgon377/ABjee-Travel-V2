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

// Circuit Breaker State
class RedisCircuitBreaker {
  private static failures = 0;
  private static blockedUntil = 0;
  private static readonly FAILURE_THRESHOLD = 3;
  private static readonly COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  static isBlocked(): boolean {
    if (this.blockedUntil > 0 && Date.now() < this.blockedUntil) {
      return true;
    }
    if (this.blockedUntil > 0) {
      // Cooldown expired, reset but keep one failure to trip again quickly if it fails
      console.info('[Redis] Cooldown expired, attempting recovery...');
      this.blockedUntil = 0;
      this.failures = this.FAILURE_THRESHOLD - 1;
    }
    return false;
  }

  static recordFailure(error: any) {
    this.failures++;
    const message = error instanceof Error ? error.message : String(error);
    
    if (this.failures >= this.FAILURE_THRESHOLD || 
        message.includes('max requests limit') || 
        message.includes('rate limit') ||
        message.includes('quota')) {
      this.blockedUntil = Date.now() + this.COOLDOWN_MS;
      console.error(`[Redis] CIRCUIT TRIPPED! Blocked for 5 mins due to: ${message}`);
    }
  }

  static recordSuccess() {
    this.failures = 0;
    this.blockedUntil = 0;
  }
}

export const initRedis = (): Redis | null => {
  if (redis) return redis;

  if (!REDIS_URL || !REDIS_TOKEN) {
    console.warn('[Redis] ENV vars missing: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
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
  if (RedisCircuitBreaker.isBlocked()) return null;
  return redis || initRedis();
};

export const safeRedisCall = async <T>(
  operation: (client: Redis) => Promise<T>,
  fallback: T,
  label: string,
): Promise<T> => {
  if (RedisCircuitBreaker.isBlocked()) {
    return fallback;
  }

  const client = getRedis();
  if (!client) {
    return fallback;
  }

  try {
    const result = await operation(client);
    RedisCircuitBreaker.recordSuccess();
    return result;
  } catch (error) {
    RedisCircuitBreaker.recordFailure(error);
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Redis] ${label}: Failed with error: ${message}`);
    return fallback;
  }
};
