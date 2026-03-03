import { lazy } from 'react';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const IMPORT_RELOAD_KEY = 'lazy-import-reload-once';

const shouldAttemptReload = (error: unknown) => {
  if (typeof window === 'undefined' || !import.meta.env.DEV) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error || '');
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Outdated Optimize Dep')
  );
};

export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  retries = 1,
  retryDelayMs = 250
) {
  const load = async (attempt = 0): Promise<{ default: T }> => {
    try {
      return await importer();
    } catch (error) {
      if (shouldAttemptReload(error)) {
        const reloaded = sessionStorage.getItem(IMPORT_RELOAD_KEY) === '1';
        if (!reloaded) {
          sessionStorage.setItem(IMPORT_RELOAD_KEY, '1');
          window.location.reload();
          return new Promise(() => {});
        }
      }

      if (attempt >= retries) {
        throw error;
      }
      await wait(retryDelayMs);
      return load(attempt + 1);
    }
  };

  return lazy(load);
}
