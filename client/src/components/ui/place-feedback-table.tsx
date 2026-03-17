import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { Button } from '@/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, MapPin, MessageSquare, Star, User } from 'lucide-react';

type FeedbackType = 'review' | 'comment';

type FeedbackItem = {
  id: string;
  type: FeedbackType;
  placeId: string;
  placeName: string;
  text: string;
  author: string;
  userId: string;
  rating?: number;
  mediaCount?: number;
  mediaKey?: string;
  createdAt?: unknown;
};

type UserDetails = {
  id: string;
  displayName?: string;
  email?: string;
  username?: string;
  role?: string;
};

interface PlaceFeedbackTableProps {
  externalSearchQuery?: string;
}

const ITEMS_PER_PAGE = 12;

function toMillis(value: unknown): number {
  if (!value) return 0;

  const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };
  if (typeof maybeTimestamp.toDate === 'function') {
    return maybeTimestamp.toDate().getTime();
  }

  if (typeof maybeTimestamp.seconds === 'number') {
    return maybeTimestamp.seconds * 1000;
  }

  if (typeof value === 'number') return value;

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function formatDate(value: unknown): string {
  const ts = toMillis(value);
  if (!ts) return 'Unknown time';
  return new Date(ts).toLocaleString();
}

export const PlaceFeedbackTable = memo(({ externalSearchQuery = '' }: PlaceFeedbackTableProps) => {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [usersById, setUsersById] = useState<Record<string, UserDetails>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | FeedbackType>('all');
  const [page, setPage] = useState(1);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [placesSnap, usersSnap] = await Promise.all([
        getDocs(collection(firestoreDb, 'touristPlaces')),
        getDocs(collection(firestoreDb, 'users')),
      ]);

      const placePairs = placesSnap.docs.map((d) => {
        const data = d.data() as { name?: string };
        return [d.id, data.name?.trim() || 'Unknown place'] as const;
      });
      const placeNameById = Object.fromEntries(placePairs);

      const usersMap: Record<string, UserDetails> = {};
      usersSnap.docs.forEach((d) => {
        const data = d.data() as {
          displayName?: string;
          email?: string;
          username?: string;
          role?: string;
        };
        usersMap[d.id] = {
          id: d.id,
          displayName: data.displayName,
          email: data.email,
          username: data.username,
          role: data.role,
        };
      });
      setUsersById(usersMap);

      const perPlaceResults = await Promise.all(
        placesSnap.docs.map(async (placeDoc) => {
          const placeId = placeDoc.id;
          const placeName = placeNameById[placeId] || 'Unknown place';

          const [reviewsSnap, commentsSnap] = await Promise.all([
            getDocs(collection(firestoreDb, 'touristPlaces', placeId, 'reviews')),
            getDocs(collection(firestoreDb, 'touristPlaces', placeId, 'mediaComments')),
          ]);

          const reviewItems: FeedbackItem[] = reviewsSnap.docs.map((reviewDoc) => {
            const data = reviewDoc.data() as {
              text?: string;
              author?: string;
              userId?: string;
              rating?: number;
              media?: unknown[];
              createdAt?: unknown;
            };

            return {
              id: reviewDoc.id,
              type: 'review',
              placeId,
              placeName,
              text: data.text || '(No text)',
              author: data.author || 'Traveller',
              userId: data.userId || 'anonymous',
              rating: typeof data.rating === 'number' ? data.rating : undefined,
              mediaCount: Array.isArray(data.media) ? data.media.length : 0,
              createdAt: data.createdAt,
            };
          });

          const commentItems: FeedbackItem[] = commentsSnap.docs.map((commentDoc) => {
            const data = commentDoc.data() as {
              text?: string;
              author?: string;
              userId?: string;
              mediaKey?: string;
              createdAt?: unknown;
            };

            return {
              id: commentDoc.id,
              type: 'comment',
              placeId,
              placeName,
              text: data.text || '(No text)',
              author: data.author || 'Traveller',
              userId: data.userId || 'anonymous',
              mediaKey: data.mediaKey,
              createdAt: data.createdAt,
            };
          });

          return [...reviewItems, ...commentItems];
        })
      );

      const merged = perPlaceResults
        .flat()
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

      setItems(merged);
      setPage(1);
    } catch (err: unknown) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Failed to load place feedback:', err);
      }
      const msg = err instanceof Error ? err.message : 'Failed to load reviews/comments.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const filteredItems = useMemo(() => {
    let next = items;

    if (typeFilter !== 'all') {
      next = next.filter((item) => item.type === typeFilter);
    }

    const normalizedSearch = externalSearchQuery.trim().toLowerCase();
    if (!normalizedSearch) return next;

    return next.filter((item) => {
      const user = usersById[item.userId];
      const haystack = [
        item.placeName,
        item.text,
        item.author,
        item.userId,
        user?.displayName,
        user?.username,
        user?.email,
        user?.role,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [items, typeFilter, externalSearchQuery, usersById]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));

  const pagedItems = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, page, totalPages]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const reviewCount = filteredItems.filter((item) => item.type === 'review').length;
  const commentCount = filteredItems.filter((item) => item.type === 'comment').length;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-zinc-900/95 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.35)] sm:p-6">
      <div className="pointer-events-none absolute -top-24 -right-20 h-52 w-52 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-52 w-52 rounded-full bg-rose-400/20 blur-3xl" />

      <div className="relative mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-extrabold tracking-tight text-transparent bg-gradient-to-r from-cyan-300 via-sky-300 to-rose-300 bg-clip-text">
            Reviews & Comments
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2.5 py-1 font-medium text-cyan-200">
              {filteredItems.length} entries
            </span>
            <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-200">
              {reviewCount} reviews
            </span>
            <span className="rounded-full border border-blue-300/25 bg-blue-500/10 px-2.5 py-1 font-medium text-blue-200">
              {commentCount} comments
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setTypeFilter('all');
              setPage(1);
            }}
            className={typeFilter === 'all' ? 'rounded-full border border-cyan-300/30 bg-cyan-500/25 text-cyan-100 hover:bg-cyan-500/35' : 'rounded-full border border-white/20 bg-white/5 text-slate-200 hover:bg-white/10'}
          >
            All
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setTypeFilter('review');
              setPage(1);
            }}
            className={typeFilter === 'review' ? 'rounded-full border border-amber-300/30 bg-amber-500/25 text-amber-100 hover:bg-amber-500/35' : 'rounded-full border border-white/20 bg-white/5 text-slate-200 hover:bg-white/10'}
          >
            Reviews
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setTypeFilter('comment');
              setPage(1);
            }}
            className={typeFilter === 'comment' ? 'rounded-full border border-blue-300/30 bg-blue-500/25 text-blue-100 hover:bg-blue-500/35' : 'rounded-full border border-white/20 bg-white/5 text-slate-200 hover:bg-white/10'}
          >
            Comments
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={fetchFeedback}
            disabled={loading}
            className="rounded-full border border-white/20 bg-white/5 text-slate-100 hover:bg-white/10"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="relative py-16 text-center">
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="mx-auto mb-4 h-12 w-12 rounded-full bg-cyan-400/25 blur-sm"
          />
          <div className="mx-auto -mt-12 h-10 w-10 animate-spin rounded-full border-4 border-cyan-300/40 border-t-cyan-200" />
          <p className="mt-4 text-sm text-slate-200">Loading reviews and comments...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/15 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : pagedItems.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-8 text-center text-sm text-slate-200">
          No matching reviews/comments found.
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {pagedItems.map((item, index) => {
              const user = usersById[item.userId];

              return (
                <motion.div
                  key={`${item.type}-${item.placeId}-${item.id}`}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: index * 0.03, duration: 0.22 }}
                  className={`rounded-xl border p-4 shadow-lg transition-colors ${
                    item.type === 'review'
                      ? 'border-amber-300/20 bg-gradient-to-r from-amber-500/10 to-slate-900/30'
                      : 'border-blue-300/20 bg-gradient-to-r from-blue-500/10 to-slate-900/30'
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.type === 'review'
                          ? 'bg-amber-500/20 text-amber-100'
                          : 'bg-blue-500/20 text-blue-100'
                      }`}
                    >
                      {item.type === 'review' ? <Star className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                      {item.type}
                    </span>

                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2.5 py-1 text-xs font-medium text-rose-100">
                      <MapPin className="h-3.5 w-3.5" />
                      {item.placeName}
                    </span>

                    {typeof item.rating === 'number' && (
                      <span className="rounded-full bg-amber-500/20 px-2 py-1 text-xs text-amber-100">Rating: {item.rating}/5</span>
                    )}

                    {item.mediaCount && item.mediaCount > 0 && (
                      <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-200">Media: {item.mediaCount}</span>
                    )}

                    {item.mediaKey && (
                      <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-200">Media key: {item.mediaKey}</span>
                    )}
                  </div>

                  <p className="mb-3 text-sm leading-relaxed text-slate-100">{item.text}</p>

                  <div className="flex flex-col gap-1 text-xs text-slate-300 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1">
                      <User className="h-3.5 w-3.5" />
                      Author: {item.author}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-1">User ID: {item.userId}</span>
                    <span className="rounded-full bg-white/10 px-2 py-1">Time: {formatDate(item.createdAt)}</span>
                    {user?.displayName && <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-emerald-100">Profile: {user.displayName}</span>}
                    {user?.username && <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-emerald-100">Username: {user.username}</span>}
                    {user?.email && <span className="rounded-full bg-indigo-500/20 px-2 py-1 text-indigo-100">Email: {user.email}</span>}
                    {user?.role && <span className="rounded-full bg-fuchsia-500/20 px-2 py-1 text-fuchsia-100">Role: {user.role}</span>}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          <div className="mt-4 flex items-center justify-between rounded-lg border border-white/15 bg-white/5 p-3">
            <p className="text-xs text-slate-200">
              Page {Math.min(page, totalPages)} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

PlaceFeedbackTable.displayName = 'PlaceFeedbackTable';

