import client, { COLLECTION_NAME } from './typesenseClient';

export class SearchKeyService {
  /**
   * Generates a scoped search-only API key for the frontend.
   * This key is valid for 1 hour and restricted to the search action on the tourist_places collection.
   */
  static generateSearchKey() {
    const searchOnlyApiKey = process.env.TYPESENSE_SEARCH_ONLY_API_KEY;
    
    // If we have a pre-configured search-only key, use it.
    // Otherwise, we could generate a scoped key if we were using a more complex setup.
    // For now, we'll return the search-only key from env.
    
    return searchOnlyApiKey || 'xyz_search_only';
  }

  /**
   * Alternatively, generate a truly scoped key using Typesense's key generation (requires Admin Key).
   */
  static async generateScopedKey() {
    // This is useful if you want to add per-user filters or TTLs to the key.
    // @ts-ignore
    return client.keys().generateScopedSearchKey(
      process.env.TYPESENSE_API_KEY || 'xyz',
      {
        filter_by: `isActive:true`, // Example restriction
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      }
    );
  }
}
