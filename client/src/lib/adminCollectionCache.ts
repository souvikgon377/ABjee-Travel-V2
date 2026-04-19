type CacheEnvelope<T> = {
  expiresAt: number;
  value: T;
};

const memoryCache = new Map<string, CacheEnvelope<unknown>>();
const STORAGE_PREFIX = 'abjee:admin-cache:';

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export function getAdminCollectionCache<T>(key: string): T | null {
  const now = Date.now();
  const memoryEntry = memoryCache.get(key) as CacheEnvelope<T> | undefined;

  if (memoryEntry) {
    if (memoryEntry.expiresAt > now) {
      return memoryEntry.value;
    }
    memoryCache.delete(key);
  }

  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now) {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      return null;
    }

    memoryCache.set(key, parsed);
    return parsed.value;
  } catch {
    return null;
  }
}

export function setAdminCollectionCache<T>(key: string, value: T, ttlMs: number) {
  const entry: CacheEnvelope<T> = {
    value,
    expiresAt: Date.now() + ttlMs,
  };

  memoryCache.set(key, entry);

  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // Ignore storage quota or privacy-mode failures.
  }
}

export function clearAdminCollectionCache(key?: string) {
  if (typeof key === 'string') {
    memoryCache.delete(key);
    if (canUseStorage()) {
      try {
        window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      } catch {
        // Ignore storage failures.
      }
    }
    return;
  }

  memoryCache.clear();

  if (!canUseStorage()) return;

  try {
    for (const storageKey of Object.keys(window.localStorage)) {
      if (storageKey.startsWith(STORAGE_PREFIX)) {
        window.localStorage.removeItem(storageKey);
      }
    }
  } catch {
    // Ignore storage failures.
  }
}