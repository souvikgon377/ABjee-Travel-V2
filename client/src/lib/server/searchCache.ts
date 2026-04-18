type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry>();

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;

const canUseRedis = Boolean(REDIS_URL && REDIS_TOKEN);

const getMemory = <T>(key: string): T | null => {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return cached.value as T;
};

const setMemory = (key: string, value: unknown, ttlSeconds: number) => {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  memoryCache.set(key, { value, expiresAt });
};

const redisRequest = async (command: string, args: Array<string | number>) => {
  if (!canUseRedis) return null;

  const response = await fetch(`${REDIS_URL}/${command}/${args.map((arg) => encodeURIComponent(String(arg))).join('/')}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Redis ${command} failed with status ${response.status}`);
  }

  return response.json() as Promise<{ result?: unknown }>;
};

export const getSearchCache = async <T>(key: string): Promise<T | null> => {
  const memoryValue = getMemory<T>(key);
  if (memoryValue !== null) return memoryValue;

  if (!canUseRedis) return null;

  try {
    const payload = await redisRequest('get', [key]);
    const rawValue = payload?.result;
    if (typeof rawValue !== 'string' || rawValue.length === 0) return null;

    const parsed = JSON.parse(rawValue) as T;
    setMemory(key, parsed, 60);
    return parsed;
  } catch {
    return null;
  }
};

export const setSearchCache = async (key: string, value: unknown, ttlSeconds: number) => {
  setMemory(key, value, ttlSeconds);

  if (!canUseRedis) return;

  try {
    await redisRequest('setex', [key, ttlSeconds, JSON.stringify(value)]);
  } catch {
    // Fall back to in-memory cache silently when Redis is unreachable.
  }
};
