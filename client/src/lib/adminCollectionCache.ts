type CacheEnvelope<T> = {
  expiresAt: number;
  value: T;
};

type CacheScopeOptions = {
  userId?: string | null;
  useGlobalFallback?: boolean;
  writeGlobal?: boolean;
  writeUser?: boolean;
};

const memoryCache = new Map<string, CacheEnvelope<unknown>>();
const STORAGE_PREFIX = 'abjee:admin-cache:';
const GLOBAL_SCOPE = 'global';

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const normalizeUserId = (userId?: string | null) => {
  const normalized = typeof userId === 'string' ? userId.trim() : '';
  return normalized || null;
};

const buildScopedKey = (key: string, userId?: string | null) => {
  const scopedUser = normalizeUserId(userId);
  const scope = scopedUser ? `user:${scopedUser}` : GLOBAL_SCOPE;
  return `${scope}:${key}`;
};

const readScopedCache = <T>(scopedKey: string): T | null => {
  const now = Date.now();
  const memoryEntry = memoryCache.get(scopedKey) as CacheEnvelope<T> | undefined;

  if (memoryEntry) {
    if (memoryEntry.expiresAt > now) {
      return memoryEntry.value;
    }
    memoryCache.delete(scopedKey);
  }

  if (!canUseStorage()) return null;

  try {
    const storageKey = `${STORAGE_PREFIX}${scopedKey}`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    memoryCache.set(scopedKey, parsed);
    return parsed.value;
  } catch {
    return null;
  }
};

export function getAdminCollectionCache<T>(key: string, options?: CacheScopeOptions): T | null {
  const userId = normalizeUserId(options?.userId);
  const shouldFallback = options?.useGlobalFallback !== false;

  if (userId) {
    const userValue = readScopedCache<T>(buildScopedKey(key, userId));
    if (userValue !== null) {
      return userValue;
    }
  }

  if (shouldFallback) {
    return readScopedCache<T>(buildScopedKey(key));
  }

  return null;
}

const writeScopedCache = <T>(scopedKey: string, entry: CacheEnvelope<T>) => {
  memoryCache.set(scopedKey, entry);

  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${scopedKey}`, JSON.stringify(entry));
  } catch {
    // Ignore storage quota or privacy-mode failures.
  }
};

export function setAdminCollectionCache<T>(key: string, value: T, ttlMs: number, options?: CacheScopeOptions) {
  const entry: CacheEnvelope<T> = {
    value,
    expiresAt: Date.now() + ttlMs,
  };
  const userId = normalizeUserId(options?.userId);
  const shouldWriteGlobal = options?.writeGlobal !== false;
  const shouldWriteUser = options?.writeUser !== false;

  if (userId && shouldWriteUser) {
    writeScopedCache(buildScopedKey(key, userId), entry);
  }

  if (shouldWriteGlobal) {
    writeScopedCache(buildScopedKey(key), entry);
  }
}

const clearScopedCache = (scopedKey: string) => {
  memoryCache.delete(scopedKey);

  if (canUseStorage()) {
    try {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${scopedKey}`);
    } catch {
      // Ignore storage failures.
    }
  }
};

export function clearAdminCollectionCache(key?: string, options?: Pick<CacheScopeOptions, 'userId'>) {
  const userId = normalizeUserId(options?.userId);

  if (typeof key === 'string') {
    if (userId) {
      clearScopedCache(buildScopedKey(key, userId));
    }
    clearScopedCache(buildScopedKey(key));
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