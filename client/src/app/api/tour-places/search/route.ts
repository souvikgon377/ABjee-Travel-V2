import { NextRequest } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { fail, ok } from '@/lib/server/http';
import { getSearchCache, setSearchCache } from '@/lib/server/searchCache';

export const runtime = 'nodejs';

const SEARCH_COLLECTION = 'touristPlaces';
const DEFAULT_PAGE_SIZE = 4;
const MAX_PAGE_SIZE = 4;
const SEARCH_DEBOUNCE_MIN_LENGTH = 3;
const CACHE_TTL_SECONDS = 90;

type SearchField = 'name' | 'area' | 'state' | 'country';
type SearchIndexField = 'searchName' | 'searchArea' | 'searchState' | 'searchCountry';

type CursorValue = { value: string; id: string } | null;

type CursorSet = Partial<Record<SearchIndexField, CursorValue>>;

type SearchCursor = {
  seenIds?: string[];
  normalized?: CursorSet;
  raw?: CursorSet;
};

const NORMALIZED_FIELDS: Array<{ source: SearchField; index: SearchIndexField }> = [
  { source: 'name', index: 'searchName' },
  { source: 'area', index: 'searchArea' },
  { source: 'state', index: 'searchState' },
  { source: 'country', index: 'searchCountry' },
];

const normalizeQuery = (value: string) => value.trim().replace(/\s+/g, ' ');

const toPrefixQueryValue = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const toNormalizedPrefixQueryValue = (value: string) => value.toLowerCase();

const parseCursor = (rawCursor: string | null): SearchCursor => {
  if (!rawCursor) return {};

  try {
    const decoded = Buffer.from(rawCursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as SearchCursor;
    return {
      seenIds: Array.isArray(parsed.seenIds) ? parsed.seenIds.filter((id): id is string => typeof id === 'string') : [],
      normalized: parsed.normalized || {},
    };
  } catch {
    return {};
  }
};

const trimSeenIds = (ids: string[]) => ids.slice(-200);

const serializeCursor = (cursor: SearchCursor) =>
  Buffer.from(
    JSON.stringify({
      seenIds: trimSeenIds(cursor.seenIds || []),
      normalized: cursor.normalized || {},
    }),
    'utf8',
  ).toString('base64url');

const mapDoc = (docSnap: FirebaseFirestore.QueryDocumentSnapshot) => ({
  id: docSnap.id,
  ...(docSnap.data() as Record<string, unknown>),
});

const queryFieldBatch = async ({
  fieldPath,
  prefix,
  cursor,
  pageSize,
}: {
  fieldPath: SearchIndexField;
  prefix: string;
  cursor: CursorValue;
  pageSize: number;
}) => {
  let ref = adminDb
    .collection(SEARCH_COLLECTION)
    .where(fieldPath, '>=', prefix)
    .where(fieldPath, '<=', `${prefix}\uf8ff`)
    .orderBy(fieldPath)
    .orderBy(FieldPath.documentId())
    .limit(pageSize);

  if (cursor) {
    ref = ref.startAfter(cursor.value, cursor.id);
  }

  const snapshot = await ref.get();
  const docs = snapshot.docs.map(mapDoc);
  const lastDoc = snapshot.docs[snapshot.docs.length - 1];

  return {
    docs,
    nextCursor:
      snapshot.docs.length === pageSize && lastDoc
        ? { value: String(lastDoc.get(fieldPath) ?? ''), id: lastDoc.id }
        : null,
  };
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      query?: unknown;
      lastDoc?: unknown;
      pageSize?: unknown;
    };

    const queryValue = normalizeQuery(typeof body.query === 'string' ? body.query : '');
    const normalizedQuery = toNormalizedPrefixQueryValue(queryValue);
    const lastDoc = typeof body.lastDoc === 'string' ? body.lastDoc : null;
    const pageSizeRaw = Number(body.pageSize ?? DEFAULT_PAGE_SIZE);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(pageSizeRaw) ? Math.floor(pageSizeRaw) : DEFAULT_PAGE_SIZE));

    if (queryValue.length < SEARCH_DEBOUNCE_MIN_LENGTH) {
      return ok({
        results: [],
        lastDoc: null,
        hasMore: false,
        searchTerm: queryValue,
      });
    }

    const cacheKey = `search:${normalizedQuery}:after:${lastDoc || 'start'}`;
    const cached = await getSearchCache<{ results: Array<Record<string, unknown>>; lastDoc: string | null; hasMore: boolean; searchTerm: string }>(cacheKey);
    if (cached) {
      return ok({
        ...cached,
        cacheStatus: 'hit',
      });
    }

    const cursor = parseCursor(lastDoc);
    const seenIds = new Set(cursor.seenIds || []);
    const nextCursor: SearchCursor = {
      seenIds: trimSeenIds(cursor.seenIds || []),
      normalized: { ...(cursor.normalized || {}) },
    };

    const results: Array<Record<string, unknown>> = [];
    let hasMore = false;

    for (const field of NORMALIZED_FIELDS) {
      if (results.length >= pageSize) {
        hasMore = true;
        break;
      }

      let fieldCursor = cursor.normalized?.[field.index] || null;
      let fieldHasMore = true;

      while (fieldHasMore && results.length < pageSize) {
        const remaining = pageSize - results.length;
        const batch = await queryFieldBatch({
          fieldPath: field.index,
          prefix: normalizedQuery,
          cursor: fieldCursor,
          pageSize: remaining,
        });

        nextCursor.normalized = {
          ...(nextCursor.normalized || {}),
          [field.index]: batch.nextCursor,
        };

        if (batch.docs.length === 0) {
          fieldHasMore = false;
          break;
        }

        for (const place of batch.docs) {
          if (seenIds.has(place.id)) {
            continue;
          }

          seenIds.add(place.id);
          results.push(place);

          if (results.length >= pageSize) {
            break;
          }
        }

        if (!batch.nextCursor) {
          fieldHasMore = false;
        } else {
          hasMore = true;
          fieldCursor = batch.nextCursor;
        }
      }

      if (fieldHasMore) {
        hasMore = true;
      }
    }

    nextCursor.seenIds = trimSeenIds(Array.from(seenIds));

    const nextLastDoc = results.length > 0 ? serializeCursor(nextCursor) : null;

    const responsePayload = {
      results,
      lastDoc: nextLastDoc,
      hasMore,
      searchTerm: queryValue,
    };

    await setSearchCache(cacheKey, responsePayload, CACHE_TTL_SECONDS);

    return ok({
      ...responsePayload,
      cacheStatus: 'miss',
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Tourist place search failed:', error);
    }

    return fail('Failed to search tourist places', 500);
  }
}