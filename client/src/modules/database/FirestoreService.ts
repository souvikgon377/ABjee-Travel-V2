import { adminDb, FieldValue, Timestamp } from '@/lib/server/firebaseAdminFirestore';
import { 
  CollectionReference, 
  Query, 
  DocumentSnapshot, 
  QuerySnapshot,
  DocumentData,
  WhereFilterOp,
  OrderByDirection
} from 'firebase-admin/firestore';

export interface PaginationOptions {
  limit?: number;
  lastDocId?: string;
  orderByField?: string;
  orderDirection?: OrderByDirection;
}

export interface QueryFilter {
  field: string;
  operator: WhereFilterOp;
  value: any;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  lastId: string | null;
  hasMore: boolean;
}

export class FirestoreService {
  /**
   * Performs a paginated query with cursor support
   */
  static async queryPaginated<T = any>(
    collectionName: string,
    options: PaginationOptions = {},
    filters: QueryFilter[] = []
  ): Promise<PaginatedResult<T>> {
    const { 
      limit = 20, 
      lastDocId, 
      orderByField = 'updatedAt', 
      orderDirection = 'desc' 
    } = options;

    let query: Query = adminDb.collection(collectionName);

    // Apply filters
    for (const filter of filters) {
      query = query.where(filter.field, filter.operator, filter.value);
    }

    // Apply ordering
    query = query.orderBy(orderByField, orderDirection);

    // Apply cursor
    if (lastDocId) {
      const lastDoc = await adminDb.collection(collectionName).doc(lastDocId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    // Get results + 1 to check for more
    const snapshot = await query.limit(limit + 1).get();
    
    console.log(`[Firestore] QUERY: collection=${collectionName}, limit=${limit}, lastDocId=${lastDocId || 'none'}`);
    console.log(`[Firestore] READS: ${snapshot.docs.length} documents fetched.`);

    const docs = snapshot.docs;
    const hasMore = docs.length > limit;
    const resultDocs = hasMore ? docs.slice(0, limit) : docs;

    const data = resultDocs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    })) as T[];

    return {
      data,
      total: -1, // Getting total count is expensive, should be done separately if needed
      lastId: resultDocs.length > 0 ? resultDocs[resultDocs.length - 1].id : null,
      hasMore
    };
  }

  /**
   * Performs a lightweight projection query
   */
  static async queryProjection<T = any>(
    collectionName: string,
    fields: string[],
    filters: QueryFilter[] = [],
    limit: number = 100
  ): Promise<T[]> {
    let query: Query = adminDb.collection(collectionName);

    for (const filter of filters) {
      query = query.where(filter.field, filter.operator, filter.value);
    }

    const snapshot = await query.select(...fields).limit(limit).get();
    
    console.log(`[Firestore] PROJECTION: collection=${collectionName}, fields=[${fields.join(', ')}], limit=${limit}`);
    console.log(`[Firestore] READS: ${snapshot.docs.length} documents (projection)`);

    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    })) as T[];
  }

  /**
   * Atomic batch update
   */
  static async batchUpdate(collectionName: string, updates: { id: string, data: any }[]) {
    const batch = adminDb.batch();
    
    for (const update of updates) {
      const ref = adminDb.collection(collectionName).doc(update.id);
      batch.set(ref, {
        ...update.data,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }

    await batch.commit();
    console.log(`[Firestore] BATCH WRITE: collection=${collectionName}, count=${updates.length}`);
    console.log(`[Firestore] WRITES: ${updates.length}`);
  }

  /**
   * Get total count for a collection/query (Optimized using count() if available)
   */
  static async getCount(collectionName: string, filters: QueryFilter[] = []): Promise<number> {
    let query: Query = adminDb.collection(collectionName);
    for (const filter of filters) {
      query = query.where(filter.field, filter.operator, filter.value);
    }
    
    const countSnapshot = await query.count().get();
    return countSnapshot.data().count;
  }
}
