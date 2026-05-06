import { QueueService, QueueJob } from '../queue/QueueService';
import client from './typesenseClient';

const normalizeSearchField = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface PlaceSyncData {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  popularity?: number;
  updatedAt: any;
  category?: string;
  coverImage?: string;
}

export class SyncService {
  /**
   * Sync a newly created place to Typesense.
   */
  static async syncOnCreate(place: PlaceSyncData) {
    return this.syncPlace(place);
  }

  /**
   * Sync an updated place to Typesense.
   */
  static async syncOnUpdate(place: PlaceSyncData) {
    return this.syncPlace(place);
  }

  /**
   * Remove a place from Typesense by ID.
   */
  static async syncOnDelete(id: string) {
    return this.delete('tourist_places', id);
  }

  /**
   * High-level sync: Pushes to queue for asynchronous processing.
   */
  static async syncPlace(place: PlaceSyncData) {
    await QueueService.push({
      type: 'SYNC',
      collection: 'tourist_places',
      id: place.id,
      data: place
    });
  }

  static async syncUser(user: any) {
    await QueueService.push({
      type: 'SYNC',
      collection: 'users',
      id: user.id,
      data: user
    });
  }

  static async delete(collection: string, id: string) {
    await QueueService.push({
      type: 'DELETE',
      collection,
      id
    });
  }

  /**
   * Check if Typesense is reachable (quick health check).
   */
  private static async isTypesenseAvailable(): Promise<boolean> {
    try {
      // Quick health check: try to retrieve a collection
      await client.collections('tourist_places').retrieve();
      return true;
    } catch (error: any) {
      // Connection refused, timeout, or other network error
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        return false;
      }
      // For other errors (404, etc), Typesense is technically available, just missing the collection
      return true;
    }
  }

  /**
   * Worker Logic: Processes jobs from the queue and interacts with Typesense.
   * This should be called by a background worker / cron / middleware.
   * 
   * If Typesense is unavailable, jobs remain in the queue for retry when it comes back.
   */
  static async processQueue() {
    const isAvailable = await this.isTypesenseAvailable();
    
    if (!isAvailable) {
      console.warn('[SyncService] Typesense is unavailable. Skipping queue processing. Jobs will be retried when Typesense is back online.');
      return;
    }

    await QueueService.processNext(async (job: QueueJob) => {
      if (job.type === 'SYNC') {
        const doc = this.transformForTypesense(job.collection, job.data);
        await client.collections(job.collection).documents().upsert(doc);
        console.info(`[SyncService] ✅ Synced ${job.collection}/${job.id}`);
      } else if (job.type === 'DELETE') {
        await client.collections(job.collection).documents(job.id).delete();
        console.info(`[SyncService] ✅ Deleted ${job.collection}/${job.id}`);
      }
    });
  }

  /**
   * Prepares raw Firestore data for Typesense indexing.
   */
  private static transformForTypesense(collection: string, data: any) {
    const base = {
      id: data.id,
      updatedAt: this.toTimestamp(data.updatedAt),
    };

    if (collection === 'tourist_places') {
      const name = String(data.name || '').trim();
      const city = String(data.city || data.area || '').trim();
      const state = String(data.state || '').trim();
      const country = String(data.country || '').trim();
      const area = String(data.area || data.city || '').trim();
      const description = String(data.description || '').trim();
      const locationSearch = normalizeSearchField([country, state, city, area].filter(Boolean).join(' '));

      return {
        ...base,
        name,
        name_lower: normalizeSearchField(name),
        city,
        area,
        state,
        country,
        category: data.category || 'Other',
        isActive: data.isActive !== false,
        location_search: locationSearch,
        location_lower: locationSearch,
        description,
        description_lower: normalizeSearchField(description),
        coverImage: data.coverImage || '',
        popularity: data.popularity || 0,
      };
    }

    if (collection === 'users') {
      return {
        ...base,
        displayName: data.displayName,
        email: data.email,
        role: data.role,
        status: data.status || 'active',
      };
    }

    return { ...base, ...data };
  }

  private static toTimestamp(value: any): number {
    if (!value) return Date.now();
    if (typeof value === 'number') return value;
    if (value.seconds) return value.seconds;
    if (value instanceof Date) return Math.floor(value.getTime() / 1000);
    return Date.now();
  }
}
