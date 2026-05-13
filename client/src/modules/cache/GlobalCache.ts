type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 30_000;
const store = new Map<string, CacheEntry<any>>();

function isExpired(entry: CacheEntry<any>) {
  return Date.now() > entry.expiresAt;
}

export const GlobalCache = {
  get<T>(key: string): T | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (isExpired(entry)) {
      store.delete(key);
      return null;
    }
    return entry.data as T;
  },

  set<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS) {
    console.info('[Cache] Updated document', { key });
    store.set(key, { data: value, expiresAt: Date.now() + ttlMs });
  },

  delete(key: string) {
    console.info('[Cache] Invalidated key', { key });
    store.delete(key);
  },

  clear() {
    console.info('[Cache] Cleared all keys');
    store.clear();
  },

  invalidatePattern(prefix: string) {
    const removed: string[] = [];
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) {
        store.delete(key);
        removed.push(key);
      }
    }
    if (removed.length > 0) {
      console.info('[Cache] Invalidated pattern', { prefix, count: removed.length });
    }
    return removed;
  },

  keys() {
    return Array.from(store.keys());
  },
};

export type { CacheEntry };
