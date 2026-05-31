// Redis has been intentionally disabled in this build.
// This module provides safe no-op stubs so the rest of the codebase
// can continue to run without requiring Redis or emitting Redis logs.

export const initRedis = (): null => null;

export const getRedis = (): null => null;

export const safeRedisCall = async <T>(
  _operation: (client: unknown) => Promise<T>,
  fallback: T,
  _label?: string,
): Promise<T> => {
  return fallback;
};

export const resolveRedisRestConfig = () => ({ url: '', token: '' });
