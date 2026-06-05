import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { MetricsService } from '@/modules/analytics/MetricsService';
import { getInMemorySnapshot } from '@/lib/server/sharedPlacesCache';
import { hasTouristPlacePhotos } from '@/lib/touristPlaceMedia';

export interface FallbackSearchOptions {
  query?: string;
  page?: number;
  limit?: number;
  category?: string;
  contentFilter?: 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated';
  location?: string;
  isActive?: boolean;
}

export interface FallbackResult {
  results: any[];
  totalCount: number;
  hasMore: boolean;
  source: 'firestore' | 'snapshot' | 'error';
  latencyMs: number;
  method: 'optimized' | 'token' | 'prefix' | 'safe';
  firestoreReads?: number;
}

/**
 * FallbackHandler - Multi-layer Firestore fallback strategy
 * 
 * When Typesense is unavailable, this handler provides graceful fallback:
 * 1. Optimized prefix queries on indexed fields (name_lower, location_search)
 * 2. Firestore snapshot cache for instant results
 * 3. Safe limited query (10 docs) as last resort
 * 
 * Handles missing composite indexes gracefully by catching FAILED_PRECONDITION.
 */
export class FallbackHandler {
  private static readonly SAFE_LIMIT = 10;
  private static readonly FETCH_LIMIT = 20;
  private static readonly SAFE_BROWSE_READ_LIMIT = 500;
  private static readonly MAX_TOKEN_QUERY_VALUES = 10;

  private static normalizeText(value: unknown): string {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static queryTokens(value: unknown): string[] {
    return Array.from(
      new Set(
        this.normalizeText(value)
          .split(' ')
          .filter((token) => token.length >= 2)
      )
    ).slice(0, this.MAX_TOKEN_QUERY_VALUES);
  }

  private static normalizeForSearch(row: any) {
    return {
      ...row,
      name_lower: String(row?.name_lower || row?.name || '').toLowerCase(),
      location_lower: String(
        row?.location_lower ||
          row?.location_search ||
          [row?.area, row?.city, row?.state, row?.country].filter(Boolean).join(' ')
      ).toLowerCase(),
      description_lower: String(row?.description_lower || row?.description || '').toLowerCase(),
    };
  }

  private static toMillis(value: any): number {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') {
      return value < 10_000_000_000 ? value * 1000 : value;
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value === 'object') {
      if (typeof value.toDate === 'function') return value.toDate().getTime();
      if (typeof value.seconds === 'number') {
        return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1_000_000);
      }
    }
    return 0;
  }

  private static matchesContentFilter(doc: any, filter: FallbackSearchOptions['contentFilter']): boolean {
    if (!filter || filter === 'all') return true;

    const hasPhotos = hasTouristPlacePhotos(doc);

    if (filter === 'photos-added') return hasPhotos;
    if (filter === 'photos-not-added') return !hasPhotos;
    if (filter === 'recently-updated') {
      const updatedAt = this.toMillis(doc.updatedAt);
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      return Boolean(updatedAt && updatedAt >= sevenDaysAgo);
    }

    return true;
  }

  private static postFilter(rows: any[], options: FallbackSearchOptions): any[] {
    const searchText = [options.query, options.location].filter(Boolean).join(' ').toLowerCase().trim();
    const tokens = searchText ? searchText.split(/\s+/).filter(Boolean) : [];

    return rows.filter((doc: any) => {
      if (options.isActive !== undefined && doc.isActive !== options.isActive) return false;
      if (!this.matchesContentFilter(doc, options.contentFilter)) return false;
      if (
        options.category &&
        options.category !== 'all' &&
        String(doc.category || '').toLowerCase() !== String(options.category).toLowerCase()
      ) {
        return false;
      }

      if (!searchText) return true;

      const haystack = [
        String(doc.name_lower || doc.name || '').toLowerCase(),
        String(doc.location_lower || doc.location_search || '').toLowerCase(),
        String(doc.description_lower || doc.description || '').toLowerCase(),
        String(doc.city || '').toLowerCase(),
        String(doc.state || '').toLowerCase(),
        String(doc.country || '').toLowerCase(),
        String(doc.area || '').toLowerCase(),
        String(doc.searchName || '').toLowerCase(),
        String(doc.searchArea || '').toLowerCase(),
        String(doc.searchState || '').toLowerCase(),
        String(doc.searchCountry || '').toLowerCase(),
      ];

      for (let i = 0; i < haystack.length; i++) {
        if (haystack[i] && haystack[i].includes(searchText)) return true;
      }

      if (tokens.length > 0) {
        for (let i = 0; i < tokens.length; i++) {
          let matched = false;
          for (let j = 0; j < haystack.length; j++) {
            if (haystack[j] && haystack[j].includes(tokens[i])) {
              matched = true;
              break;
            }
          }
          if (!matched) return false;
        }
        return true;
      }

      return false;
    });
  }

  /**
   * Detect if error is due to missing composite index
   */
  private static isIndexError(err: any): boolean {
    if (!err) return false;
    const code = err.code || err.status || err.statusCode;
    const msg = String(err.message || err.toString() || '').toLowerCase();
    return (
      code === 9 ||
      code === 'FAILED_PRECONDITION' ||
      /requires an index/.test(msg) ||
      /failed_precondition/.test(msg)
    );
  }

  /**
   * Apply equality filters (category, location, isActive) to query
   */
  private static applyEqualityFilters(ref: any, options: FallbackSearchOptions): any {
    let q = ref;
    if (options.isActive !== undefined) {
      q = q.where('isActive', '==', options.isActive);
    }
    if (options.category && options.category !== 'all') {
      const cat = options.category;
      const capitalized = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
      const variations = [...new Set([cat, cat.toLowerCase(), capitalized])];
      q = q.where('category', 'in', variations);
    }
    return q;
  }

  /**
   * Safe limited query fallback (10 docs max)
   * Used when indexes are missing or as last resort
   */
  private static async safeFallbackQuery(
    baseRef: any,
    options: FallbackSearchOptions,
    readLimit: number = this.SAFE_LIMIT
  ): Promise<any[]> {
    try {
      const safeRef = this.applyEqualityFilters(baseRef, options).limit(readLimit);
      const snap = await safeRef.get();
      const rows = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      console.log('[FallbackHandler] Safe limited query returned results', {
        count: rows.length,
        method: 'safe_limited_query',
        readLimit,
      });
      return rows;
    } catch (safeErr) {
      console.error('[FallbackHandler] Safe fallback query failed:', safeErr);
      return [];
    }
  }

  /**
   * Optimized prefix search on indexed fields
   * Uses range operators: field >= query AND field <= query + '\uf8ff'
   */
  private static async runPrefixQuery(
    field: string,
    prefix: string,
    options: FallbackSearchOptions
  ): Promise<any[]> {
    const page = Math.max(1, options.page || 1);
    const requestedLimit = Math.max(1, Math.min(100, options.limit || this.FETCH_LIMIT));
    const fetchLimit = Math.min(100, (requestedLimit * page) + 1);

    try {
      let qRef: any = adminDb.collection('touristPlaces');
      qRef = this.applyEqualityFilters(qRef, options);
      qRef = qRef
        .where(field, '>=', prefix)
        .where(field, '<=', `${prefix}\uf8ff`)
        .limit(fetchLimit);

      const snap = await qRef.get();
      const results = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      console.log('[FallbackHandler] Prefix query succeeded', {
        field,
        prefix,
        count: results.length,
        readLimit: fetchLimit,
      });

      return results;
    } catch (err: any) {
      if (this.isIndexError(err)) {
        console.warn(`[FallbackHandler] Index required for prefix query on ${field}, falling back to safe query`);
        return this.safeFallbackQuery(adminDb.collection('touristPlaces'), options);
      }
      throw err;
    }
  }

  /**
   * Primary Firestore fallback for real search terms.
   *
   * `array-contains-any` uses the per-document `search_tokens` index, so Firestore
   * only returns candidate documents that can actually match the user's text.
   */
  private static async runTokenQuery(
    tokens: string[],
    options: FallbackSearchOptions
  ): Promise<any[]> {
    const page = Math.max(1, options.page || 1);
    const requestedLimit = Math.max(1, Math.min(100, options.limit || this.FETCH_LIMIT));
    const fetchLimit = Math.min(100, (requestedLimit * page) + 1);

    try {
      let qRef: any = adminDb.collection('touristPlaces');
      qRef = this.applyEqualityFilters(qRef, options)
        .where('search_tokens', 'array-contains-any', tokens.slice(0, this.MAX_TOKEN_QUERY_VALUES))
        .limit(fetchLimit);

      const snap = await qRef.get();
      const results = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      console.log('[FallbackHandler] Token query succeeded', {
        tokens: tokens.slice(0, this.MAX_TOKEN_QUERY_VALUES),
        count: results.length,
        firestoreReads: results.length,
        readLimit: fetchLimit,
      });

      return results;
    } catch (err: any) {
      if (this.isIndexError(err)) {
        console.warn('[FallbackHandler] Index required for search_tokens query; using prefix fallback');
        return [];
      }
      throw err;
    }
  }

  /**
   * Optimized Firestore search using prefix queries
   * Searches across multiple fields and deduplicates
   */
  static async optimizedSearch(options: FallbackSearchOptions): Promise<FallbackResult> {
    const tStart = Date.now();
    const query = String(options.query || '').trim();
    const searchText = [options.query, options.location].filter(Boolean).join(' ');
    const prefix = this.normalizeText(query || options.location || '');
    const tokens = this.queryTokens(searchText);
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));

    console.log('[FallbackHandler] Starting optimized search', {
      query: prefix || '(empty)',
      page,
      limit,
    });

    try {
      // Direct document access if caller provided an id
      const exactId = (options as any).id;
      if (exactId) {
        try {
          const docSnap = await adminDb.collection('touristPlaces').doc(String(exactId)).get();
          if (!docSnap.exists) {
            return {
              results: [],
              totalCount: 0,
              hasMore: false,
              source: 'firestore',
              latencyMs: Date.now() - tStart,
              method: 'optimized',
              firestoreReads: 1,
            };
          }
          const data = { id: docSnap.id, ...docSnap.data() };
          return {
            results: [data],
            totalCount: 1,
            hasMore: false,
            source: 'firestore',
            latencyMs: Date.now() - tStart,
            method: 'optimized',
            firestoreReads: 1,
          };
        } catch (err) {
          console.error('[FallbackHandler] Direct doc access failed:', err);
          return {
            results: [],
            totalCount: 0,
            hasMore: false,
            source: 'error',
            latencyMs: Date.now() - tStart,
            method: 'optimized',
          };
        }
      }

      const baseRef = adminDb.collection('touristPlaces');

      // For blank query, always run a bounded query (never full scan).
      if (!prefix) {
        const readLimit = Math.min(this.SAFE_BROWSE_READ_LIMIT, (limit * page) + 1);
        const safeRows = await this.safeFallbackQuery(baseRef, options, readLimit);
        // Ensure equality/content/location/category filters are applied to
        // the safe fallback results so admin filters behave the same when
        // Redis or snapshot data is not available.
        const normalized = safeRows.map((r: any) => this.normalizeForSearch(r));
        const filtered = this.postFilter(normalized, options);
        const startIdx = (page - 1) * limit;
        const endIdx = startIdx + limit;
        const paginated = filtered.slice(startIdx, endIdx);
        const latency = Date.now() - tStart;
        return {
          results: paginated,
          totalCount: filtered.length,
          hasMore: filtered.length > endIdx,
          source: 'firestore',
          latencyMs: latency,
          method: 'safe',
          firestoreReads: safeRows.length,
        };
      }

      // Primary fallback path: query the explicit searchable token index first.
      const tokenRows = tokens.length > 0 ? await this.runTokenQuery(tokens, options) : [];

      if (tokenRows.length === 0) {
        const snapshot = getInMemorySnapshot();
        if (Array.isArray(snapshot) && snapshot.length > 0) {
          return this.fallbackToSnapshot(options);
        }
      }

      // Compatibility path for old docs that have not been backfilled yet.
      // These remain bounded prefix queries, not collection scans.
      const [nameRows, locationRows] = tokenRows.length > 0
        ? [[], []]
        : await Promise.all([
            this.runPrefixQuery('name_lower', prefix, options),
            this.runPrefixQuery('location_lower', prefix, options),
          ]);

      const deduped = new Map<string, any>();
      for (const row of [...tokenRows, ...nameRows, ...locationRows]) {
        const normalized = this.normalizeForSearch(row);
        deduped.set(String(normalized.id), normalized);
      }

      const filtered = this.postFilter(Array.from(deduped.values()), options);
      const startIdx = (page - 1) * limit;
      const endIdx = startIdx + limit;
      const paginated = filtered.slice(startIdx, endIdx);

      const latency = Date.now() - tStart;
      await MetricsService.trackSearch(latency, filtered.length, true);

      return {
        results: paginated,
        totalCount: filtered.length,
        hasMore: endIdx < filtered.length,
        source: 'firestore',
        latencyMs: latency,
        method: tokenRows.length > 0 ? 'token' : 'prefix',
        firestoreReads: tokenRows.length + nameRows.length + locationRows.length,
      };

    } catch (err: any) {
      console.error('[FallbackHandler] Fallback search failed:', err);
      return {
        results: [],
        totalCount: 0,
        hasMore: false,
        source: 'error',
        latencyMs: Date.now() - tStart,
        method: 'optimized',
      };
    }
  }

  /**
   * Fallback to shared snapshot cache
   * No Firestore reads - uses pre-cached data
   */
  static async fallbackToSnapshot(options: FallbackSearchOptions): Promise<FallbackResult> {
    const tStart = Date.now();
    const query = options.query || '';
    const limit = Math.max(1, Math.min(100, options.limit || 10));
    const searchText = [query, options.location].filter(Boolean).join(' ').toLowerCase().trim();

    console.log('[FallbackHandler] Falling back to snapshot cache', {
      query: searchText || '(empty)',
    });

    try {
      // IMPORTANT: Do NOT call getSharedPlacesCache() here.
      // It can trigger Firestore hydration on cold serverless instances.
      const dataset = getInMemorySnapshot();

      if (!Array.isArray(dataset) || dataset.length === 0) {
        const page = Math.max(1, options.page || 1);
        const readLimit = Math.min(this.SAFE_BROWSE_READ_LIMIT, (limit * page) + 1);
        const safeRows = await this.safeFallbackQuery(adminDb.collection('touristPlaces'), options, readLimit);
        // Apply post-filters so admin filters (content/location/category/isActive)
        // are honored even when Redis/snapshot is not available.
        const normalized = safeRows.map((r: any) => this.normalizeForSearch(r));
        const filtered = this.postFilter(normalized, options);
        const startIdx = (page - 1) * limit;
        const endIdx = startIdx + limit;
        const paginated = filtered.slice(startIdx, endIdx);
        const latency = Date.now() - tStart;
        return {
          results: paginated,
          totalCount: filtered.length,
          hasMore: filtered.length > endIdx,
          source: 'firestore',
          latencyMs: latency,
          method: 'safe',
          firestoreReads: safeRows.length,
        };
      }

      // In-memory filtering (NO additional Firestore reads)
      // Highly optimized loop: avoids creating arrays or doing redundant lowercase conversions per document
      const normalizedDataset = dataset.map((row: any) => this.normalizeForSearch(row));
      const filtered = this.postFilter(normalizedDataset, options);

      const page = Math.max(1, options.page || 1);
      const startIdx = (page - 1) * limit;
      const endIdx = startIdx + limit;
      const paginatedResults = filtered.slice(startIdx, endIdx);
      const latency = Date.now() - tStart;

      await MetricsService.trackSearch(latency, filtered.length, true);

      return {
        results: paginatedResults,
        totalCount: filtered.length,
        hasMore: endIdx < filtered.length,
        source: 'snapshot',
        latencyMs: latency,
        method: 'optimized',
      };
    } catch (error) {
      console.error('[FallbackHandler] Snapshot fallback failed:', error);
      return {
        results: [],
        totalCount: 0,
        hasMore: false,
        source: 'error',
        latencyMs: Date.now() - tStart,
        method: 'optimized',
      };
    }
  }
}
