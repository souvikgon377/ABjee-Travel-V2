import client, { TYPESENSE_ENABLED } from './typesenseClient';

export class SearchKeyService {
  /**
   * Generates a scoped search-only API key for the frontend.
   * Returns null if Typesense is disabled.
   */
  static generateSearchKey(): string | null {
    if (!TYPESENSE_ENABLED) return null;
    return process.env.TYPESENSE_SEARCH_ONLY_API_KEY ?? process.env.TYPESENSE_API_KEY ?? null;
  }

  /**
   * Generate a truly scoped key using Typesense's key generation (requires Admin Key).
   * Returns null if Typesense is disabled.
   */
  static async generateScopedKey(): Promise<string | null> {
    if (!TYPESENSE_ENABLED || !client) return null;
    // The Typesense SDK's generateScopedSearchKey is not reflected in all
    // type definitions; use any cast as an intentional workaround.
    return (client.keys() as any).generateScopedSearchKey(
      process.env.TYPESENSE_API_KEY ?? '',
      {
        filter_by: 'isActive:true',
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      }
    );
  }
}

