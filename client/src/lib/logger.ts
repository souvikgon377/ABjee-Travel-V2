/**
 * WHY: Conditional logging utility for production-safe debugging
 * WHAT: Provides console methods that only log in development mode
 * WHEN: Use throughout the app instead of direct console.* calls
 */

const isDev = (process.env.NODE_ENV === "development");

export const logger = {
  /**
   * Debug-level logging (only in development)
   * Use for detailed tracing and diagnostics
   */
  debug: (...args: unknown[]): void => {
    if (isDev) {
      console.debug(...args);
    }
  },

  /**
   * Info-level logging (only in development)
   * Use for general informational messages
   */
  log: (...args: unknown[]): void => {
    if (isDev) {
      console.log(...args);
    }
  },

  /**
   * Warning-level logging (only in development)
   * Use for non-critical issues
   */
  warn: (...args: unknown[]): void => {
    if (isDev) {
      console.warn(...args);
    }
  },

  /**
   * Error-level logging (only in development)
   * Use for errors and exceptions
   * NOTE: In production, consider using error tracking service
   */
  error: (...args: unknown[]): void => {
    if (isDev) {
      console.error(...args);
    }
  },

  /**
   * Info-level logging that works in both dev and production
   * Use sparingly for critical user-facing information
   */
  info: (...args: unknown[]): void => {
    console.info(...args);
  },

  /**
   * Group logging (only in development)
   */
  group: (label: string): void => {
    if (isDev) {
      console.group(label);
    }
  },

  /**
   * End group logging (only in development)
   */
  groupEnd: (): void => {
    if (isDev) {
      console.groupEnd();
    }
  }
};

export default logger;

