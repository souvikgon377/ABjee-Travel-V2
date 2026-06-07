import { QueueService, QueueJob } from '../queue/QueueService';
import client from './typesenseClient';
import { getTouristPlacePhotoCount } from '@/lib/touristPlaceMedia';

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
  description?: string;
  googleMapsUrl?: string;
  media?: any;
  photos?: any;
  videos?: any;
  mediaCount?: number;
  isActive?: boolean;
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
    // If Typesense is available, prefer immediate upsert so search remains current
    try {
      const tsAvailable = await this.isTypesenseAvailable();
      if (tsAvailable) {
        const doc = this.transformForTypesense('tourist_places', place);
        try {
          await client.collections('tourist_places').documents().upsert(doc);
          console.info(`[SyncService] 🔁 Directly synced tourist_places/${place.id}`);
          return;
        } catch (err: any) {
          console.warn('[SyncService] Direct upsert failed despite Typesense availability:', err?.message || err);

          // If the failure is due to missing Typesense collections, try to
          // initialize the collections and retry the upsert once. This helps
          // when pointing the app to a fresh Typesense instance on a VPS.
          const isTypesenseNotFound =
            (err && (err as any).httpStatus === 404) || (err && (err as any).status === 404) ||
            String((err && (err as any).message) || '').includes('Collection not found') ||
            String((err && (err as any).message) || '').includes('ObjectNotFound');

          if (isTypesenseNotFound) {
            try {
              const { initializeTypesense } = await import('./typesenseClient');
              const initRes = await initializeTypesense();
              console.info('[SyncService] initializeTypesense result:', initRes);
              // Retry upsert once
              await client.collections('tourist_places').documents().upsert(doc);
              console.info(`[SyncService] 🔁 Directly synced tourist_places/${place.id} after initialize`);
              return;
            } catch (retryErr) {
              console.warn('[SyncService] Retry after initializeTypesense failed:', retryErr);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[SyncService] Typesense availability check failed:', err);
    }

    // Fallback: enqueue for later processing (Redis/local queue)
    await QueueService.push({
      type: 'SYNC',
      collection: 'tourist_places',
      id: place.id,
      data: place
    });
  }

  static async syncUser(user: any) {
    try {
      const tsAvailable = await this.isTypesenseAvailable();
      if (tsAvailable) {
        const doc = this.transformForTypesense('users', user);
        try {
          await client.collections('users').documents().upsert(doc);
          console.info(`[SyncService] 🔁 Directly synced users/${user.id}`);
          return;
        } catch (err: any) {
          console.warn('[SyncService] Direct user upsert failed:', err?.message || err);

          const isTypesenseNotFound =
            (err && (err as any).httpStatus === 404) || (err && (err as any).status === 404) ||
            String((err && (err as any).message) || '').includes('Collection not found') ||
            String((err && (err as any).message) || '').includes('ObjectNotFound');

          if (isTypesenseNotFound) {
            try {
              const { initializeTypesense } = await import('./typesenseClient');
              await initializeTypesense();
              await client.collections('users').documents().upsert(doc);
              console.info(`[SyncService] 🔁 Directly synced users/${user.id} after initialize`);
              return;
            } catch (retryErr) {
              console.warn('[SyncService] Retry after initializeTypesense for users failed:', retryErr);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[SyncService] Typesense availability check failed for users:', err);
    }

    await QueueService.push({
      type: 'SYNC',
      collection: 'users',
      id: user.id,
      data: user
    });
  }

  static async syncTravelDestination(destination: any) {
    try {
      const tsAvailable = await this.isTypesenseAvailable();
      if (tsAvailable) {
        const doc = this.transformForTypesense('travel_destinations', destination);
        try {
          await client.collections('travel_destinations').documents().upsert(doc);
          console.info(`[SyncService] 🔁 Directly synced travel_destinations/${destination.id}`);
          return;
        } catch (err: any) {
          console.warn('[SyncService] Direct travel destination upsert failed:', err?.message || err);

          const isTypesenseNotFound =
            (err && (err as any).httpStatus === 404) || (err && (err as any).status === 404) ||
            String((err && (err as any).message) || '').includes('Collection not found') ||
            String((err && (err as any).message) || '').includes('ObjectNotFound');

          if (isTypesenseNotFound) {
            try {
              const { initializeTypesense } = await import('./typesenseClient');
              await initializeTypesense();
              await client.collections('travel_destinations').documents().upsert(doc);
              console.info(`[SyncService] 🔁 Directly synced travel_destinations/${destination.id} after initialize`);
              return;
            } catch (retryErr) {
              console.warn('[SyncService] Retry after initializeTypesense for travel destinations failed:', retryErr);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[SyncService] Typesense availability check failed for travel destinations:', err);
    }

    await QueueService.push({
      type: 'SYNC',
      collection: 'travel_destinations',
      id: destination.id,
      data: destination
    });
  }

  static async syncAdvertisement(ad: any) {
    try {
      const tsAvailable = await this.isTypesenseAvailable();
      if (tsAvailable) {
        const doc = this.transformForTypesense('advertisements', ad);
        try {
          await client.collections('advertisements').documents().upsert(doc);
          console.info(`[SyncService] 🔁 Directly synced advertisements/${ad.id}`);
          return;
        } catch (err: any) {
          console.warn('[SyncService] Direct advertisement upsert failed:', err?.message || err);

          const isTypesenseNotFound =
            (err && (err as any).httpStatus === 404) || (err && (err as any).status === 404) ||
            String((err && (err as any).message) || '').includes('Collection not found') ||
            String((err && (err as any).message) || '').includes('ObjectNotFound');

          if (isTypesenseNotFound) {
            try {
              const { initializeTypesense } = await import('./typesenseClient');
              await initializeTypesense();
              await client.collections('advertisements').documents().upsert(doc);
              console.info(`[SyncService] 🔁 Directly synced advertisements/${ad.id} after initialize`);
              return;
            } catch (retryErr) {
              console.warn('[SyncService] Retry after initializeTypesense for advertisements failed:', retryErr);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[SyncService] Typesense availability check failed for advertisements:', err);
    }

    await QueueService.push({
      type: 'SYNC',
      collection: 'advertisements',
      id: ad.id,
      data: ad
    });
  }

  static async delete(collection: string, id: string) {
    try {
      const tsAvailable = await this.isTypesenseAvailable();
      if (tsAvailable) {
        try {
          await client.collections(collection).documents(id).delete();
          console.info(`[SyncService] 🔁 Directly deleted ${collection}/${id}`);
          return;
        } catch (err: any) {
          console.warn('[SyncService] Direct delete failed despite Typesense availability:', err?.message || err);

          const isTypesenseNotFound =
            (err && (err as any).httpStatus === 404) || (err && (err as any).status === 404) ||
            String((err && (err as any).message) || '').includes('Collection not found') ||
            String((err && (err as any).message) || '').includes('ObjectNotFound');

          if (isTypesenseNotFound) {
            try {
              const { initializeTypesense } = await import('./typesenseClient');
              await initializeTypesense();
              await client.collections(collection).documents(id).delete();
              console.info(`[SyncService] 🔁 Directly deleted ${collection}/${id} after initialize`);
              return;
            } catch (retryErr) {
              console.warn('[SyncService] Retry after initializeTypesense for delete failed:', retryErr);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[SyncService] Typesense availability check failed for delete:', err);
    }

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
    // If the Typesense module was disabled at import-time, treat as unavailable
    // (module-level flag avoids long timeouts on cold-starts).
    try {
      // `client` may be a stub when Typesense is disabled — guard against that.
      if (!client) return false;
      // Quick health check: try to retrieve a collection
      await client.collections('tourist_places').retrieve();
      return true;
    } catch (error: any) {
      // Connection refused, timeout, or other network error
      if (error && (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT')) {
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
      const mediaCount = getTouristPlacePhotoCount(data);

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
        mediaCount,
        googleMapsUrl: data.googleMapsUrl || '',
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
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        username: data.username || '',
        photoURL: data.photoURL || data.avatar || data.profileImage || '',
      };
    }

    if (collection === 'travel_destinations') {
      const place = String(data.place || '').trim();
      const country = String(data.country || '').trim();
      const places = Array.isArray(data.places) ? data.places : [];
      const locationSearch = normalizeSearchField([country, place, ...places].join(' '));

      return {
        ...base,
        place,
        country,
        introduction: String(data.introduction || data.overview || '').trim(),
        itinerary: String(data.itinerary || '').trim(),
        name_lower: normalizeSearchField(place),
        location_search: locationSearch,
        location_lower: normalizeSearchField([place, ...places, country].join(' ')),
      };
    }

    if (collection === 'advertisements') {
      const name = String(data.name || '').trim();
      const description = String(data.description || '').trim();
      return {
        ...base,
        name,
        name_lower: normalizeSearchField(name),
        mobileNumber: data.mobileNumber || '',
        country: data.country || '',
        state: data.state || '',
        area: data.area || '',
        category: data.category || '',
        description,
        description_lower: normalizeSearchField(description),
        photoUrl: data.photoUrl || '',
        idProofUrl: data.idProofUrl || '',
        idProofPublicId: data.idProofPublicId || '',
        idProofHash: data.idProofHash || '',
        additionalIdProofs: data.additionalIdProofs ? (typeof data.additionalIdProofs === 'string' ? data.additionalIdProofs : JSON.stringify(data.additionalIdProofs)) : '[]',
        adminComment: data.adminComment || '',
        ownerEmail: data.ownerEmail || '',
        ownerName: data.ownerName || '',
        ownerPhoneNumber: data.ownerPhoneNumber || '',
        status: data.status || 'pending',
        approvalStatus: data.approvalStatus || 'pending',
        createdAt: this.toTimestamp(data.createdAt),
        approvedAt: data.approvedAt ? this.toTimestamp(data.approvedAt) : null,
        subscriptionExpiresAt: data.subscriptionExpiresAt ? this.toTimestamp(data.subscriptionExpiresAt) : 4102444800,
        rating: typeof data.rating === 'number' ? data.rating : 0,
        comments: data.comments ? (typeof data.comments === 'string' ? data.comments : JSON.stringify(data.comments)) : '[]',
      };
    }

    return { ...base, ...data };
  }

  private static toTimestamp(value: any): number {
    if (!value) return Math.floor(Date.now() / 1000);
    if (typeof value === 'number') {
      return value > 10_000_000_000 ? Math.floor(value / 1000) : value;
    }
    if (value.seconds) return value.seconds;
    if (value.toDate && typeof value.toDate === 'function') {
      return Math.floor(value.toDate().getTime() / 1000);
    }
    if (value instanceof Date) return Math.floor(value.getTime() / 1000);
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!isNaN(parsed)) {
        return Math.floor(parsed / 1000);
      }
    }
    return Math.floor(Date.now() / 1000);
  }
}
