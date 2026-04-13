import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MessageCircle,
  Heart,
  BookOpen,
  User,
  MapPin,
  AlertCircle,
  Flame,
  Clock3,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { firestoreDb } from '@/lib/firebaseFirestore';
import {
  collection,
  collectionGroup,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';

interface TripStoryAdminRow {
  id: string;
  title: string;
  destination: string;
  authorName: string;
  authorEmail?: string;
  authorId?: string;
  travelType?: string;
  duration?: string;
  budget?: string;
  likes: string[];
  commentCount: number;
  photos?: Array<{ url: string }>;
  videos?: Array<{ url: string }>;
  createdAt?: any;
}

interface TripStoryCommentRow {
  id: string;
  storyId: string;
  userName: string;
  text: string;
  createdAt?: any;
}

interface TripStoryAction {
  id: string;
  actionType: 'story-created' | 'comment-added' | 'story-liked';
  storyId: string;
  storyTitle: string;
  actor: string;
  description: string;
  createdAt?: Date | null;
}

type ActionFilter = 'all' | TripStoryAction['actionType'];

interface ActionStyle {
  label: string;
  icon: LucideIcon;
  pillClass: string;
}

const ACTION_STYLES: Record<TripStoryAction['actionType'], ActionStyle> = {
  'story-created': {
    label: 'Story Published',
    icon: BookOpen,
    pillClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  'comment-added': {
    label: 'Comment Added',
    icon: MessageCircle,
    pillClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  'story-liked': {
    label: 'Story Liked',
    icon: Heart,
    pillClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
};

function safeDate(value: any): Date | null {
  if (!value) return null;
  if (value?.toDate && typeof value.toDate === 'function') {
    return value.toDate();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value: any): string {
  const date = safeDate(value);
  if (!date) return 'Unknown';
  return date.toLocaleString();
}

const PANEL_CARD_CLASS =
  'border-border/70 bg-card/90 backdrop-blur-sm shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl';

export function TripStoriesAdminPanel() {
  const [stories, setStories] = useState<TripStoryAdminRow[]>([]);
  const [comments, setComments] = useState<TripStoryCommentRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeActionFilter, setActiveActionFilter] = useState<ActionFilter>('all');
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState('');

  useEffect(() => {
    const storiesQuery = query(
      collection(firestoreDb, 'stories'),
      orderBy('createdAt', 'desc'),
      limit(500)
    );

    const unsubscribe = onSnapshot(
      storiesQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            title: data.title ?? 'Untitled Story',
            destination: data.destination ?? 'Unknown destination',
            authorName: data.authorName ?? 'Unknown user',
            authorEmail: data.authorEmail,
            authorId: data.authorId,
            travelType: data.travelType,
            duration: data.duration,
            budget: data.budget,
            likes: Array.isArray(data.likes) ? data.likes : [],
            commentCount: typeof data.commentCount === 'number' ? data.commentCount : 0,
            photos: Array.isArray(data.photos) ? data.photos : [],
            videos: Array.isArray(data.videos) ? data.videos : [],
            createdAt: data.createdAt,
          } as TripStoryAdminRow;
        });

        setStories(rows);
        setStoriesLoading(false);
      },
      () => {
        setStories([]);
        setStoriesLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const commentsQuery = query(
      collectionGroup(firestoreDb, 'comments'),
      orderBy('createdAt', 'desc'),
      limit(1000)
    );

    const unsubscribe = onSnapshot(
      commentsQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            storyId: docSnap.ref.parent.parent?.id ?? '',
            userName: data.userName ?? 'Unknown user',
            text: data.text ?? '',
            createdAt: data.createdAt,
          } as TripStoryCommentRow;
        });

        setComments(rows);
        setCommentsError('');
        setCommentsLoading(false);
      },
      (error) => {
        setComments([]);
        setCommentsLoading(false);
        setCommentsError(error?.message || 'Unable to load comments.');
      }
    );

    return unsubscribe;
  }, []);

  const storyTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    stories.forEach((story) => map.set(story.id, story.title));
    return map;
  }, [stories]);

  const summary = useMemo(() => {
    const totalLikes = stories.reduce((count, story) => count + story.likes.length, 0);
    const totalComments = comments.length > 0
      ? comments.length
      : stories.reduce((count, story) => count + story.commentCount, 0);
    const uniqueAuthors = new Set(stories.map((story) => story.authorId || story.authorEmail || story.authorName));

    return {
      totalStories: stories.length,
      totalLikes,
      totalComments,
      uniqueAuthors: uniqueAuthors.size,
    };
  }, [stories, comments]);

  const recentActions = useMemo(() => {
    const createdActions: TripStoryAction[] = stories.map((story) => ({
      id: `create-${story.id}`,
      actionType: 'story-created',
      storyId: story.id,
      storyTitle: story.title,
      actor: story.authorName,
      description: `${story.authorName} published a story`,
      createdAt: safeDate(story.createdAt),
    }));

    const commentActions: TripStoryAction[] = comments.map((comment) => ({
      id: `comment-${comment.id}`,
      actionType: 'comment-added',
      storyId: comment.storyId,
      storyTitle: storyTitleMap.get(comment.storyId) ?? 'Unknown story',
      actor: comment.userName,
      description: `${comment.userName} commented on a story`,
      createdAt: safeDate(comment.createdAt),
    }));

    const likeActions: TripStoryAction[] = stories.flatMap((story) =>
      story.likes.map((likedUserId) => ({
        id: `like-${story.id}-${likedUserId}`,
        actionType: 'story-liked',
        storyId: story.id,
        storyTitle: story.title,
        actor: likedUserId,
        description: `${likedUserId} liked a story`,
        createdAt: safeDate(story.createdAt),
      }))
    );

    return [...createdActions, ...commentActions, ...likeActions]
      .sort((a, b) => {
        const aTime = a.createdAt?.getTime() ?? 0;
        const bTime = b.createdAt?.getTime() ?? 0;
        return bTime - aTime;
      })
      .slice(0, 120);
  }, [stories, comments, storyTitleMap]);

  const filteredStories = useMemo(() => {
    const queryText = searchTerm.trim().toLowerCase();
    if (!queryText) return stories;

    return stories.filter((story) => {
      const haystack = [story.title, story.destination, story.authorName, story.authorEmail]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(queryText);
    });
  }, [stories, searchTerm]);

  const filteredRecentActions = useMemo(() => {
    const queryText = searchTerm.trim().toLowerCase();

    return recentActions.filter((action) => {
      const matchesFilter = activeActionFilter === 'all' || action.actionType === activeActionFilter;
      if (!matchesFilter) return false;
      if (!queryText) return true;

      const haystack = `${action.storyTitle} ${action.actor} ${action.description}`.toLowerCase();
      return haystack.includes(queryText);
    });
  }, [recentActions, activeActionFilter, searchTerm]);

  const filteredComments = useMemo(() => {
    const queryText = searchTerm.trim().toLowerCase();
    if (!queryText) return comments;

    return comments.filter((comment) => {
      const storyTitle = storyTitleMap.get(comment.storyId) ?? '';
      const haystack = `${comment.userName} ${comment.text} ${storyTitle}`.toLowerCase();
      return haystack.includes(queryText);
    });
  }, [comments, searchTerm, storyTitleMap]);

  const topDestinations = useMemo(() => {
    const countMap = new Map<string, number>();
    stories.forEach((story) => {
      const destination = story.destination || 'Unknown';
      countMap.set(destination, (countMap.get(destination) ?? 0) + 1);
    });

    return Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [stories]);

  const engagementPerStory = useMemo(() => {
    if (summary.totalStories === 0) return '0.0';
    const score = (summary.totalLikes + summary.totalComments) / summary.totalStories;
    return score.toFixed(1);
  }, [summary]);

  return (
    <div className="relative mx-auto max-w-370 space-y-6 overflow-x-clip rounded-3xl px-2 py-2 sm:px-0 xl:space-y-7">
      <motion.div
        className="pointer-events-none absolute -top-24 -left-16 h-56 w-56 rounded-full bg-blue-500/15 blur-3xl"
        animate={{ x: [0, 22, 0], y: [0, 20, 0], scale: [1, 1.09, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute -right-20 top-24 h-64 w-64 rounded-full bg-rose-500/15 blur-3xl"
        animate={{ x: [0, -24, 0], y: [0, -18, 0], scale: [1, 1.11, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="relative rounded-2xl border border-border/70 bg-linear-to-r from-blue-500/12 via-violet-500/12 to-rose-500/12 p-5 shadow-lg xl:px-7 xl:py-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
          <motion.span
            className="h-2 w-2 rounded-full bg-emerald-500"
            animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.2, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          />
          Live data stream
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Trip Stories Control Room</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Monitor story submissions, likes, comments, and user activity across Trip Stories.
        </p>
        <motion.div
          className="mt-3 h-1 w-40 rounded-full bg-linear-to-r from-blue-500 via-violet-500 to-rose-500"
          animate={{ width: ['10rem', '12rem', '10rem'] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4 xl:gap-5">
        <motion.div whileHover={{ y: -4 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.01 }}>
        <Card className={PANEL_CARD_CLASS}>
          <CardHeader className="pb-2">
            <CardDescription>Total Stories</CardDescription>
            <CardTitle className="flex items-center justify-between text-2xl text-blue-600 dark:text-blue-400">
              {summary.totalStories}
              <BookOpen className="h-5 w-5 text-blue-500/80" />
            </CardTitle>
          </CardHeader>
        </Card>
        </motion.div>
        <motion.div whileHover={{ y: -4 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}>
        <Card className={PANEL_CARD_CLASS}>
          <CardHeader className="pb-2">
            <CardDescription>Total Likes</CardDescription>
            <CardTitle className="flex items-center justify-between text-2xl text-rose-600 dark:text-rose-400">
              {summary.totalLikes}
              <Heart className="h-5 w-5 text-rose-500/80" />
            </CardTitle>
          </CardHeader>
        </Card>
        </motion.div>
        <motion.div whileHover={{ y: -4 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
        <Card className={PANEL_CARD_CLASS}>
          <CardHeader className="pb-2">
            <CardDescription>Total Comments</CardDescription>
            <CardTitle className="flex items-center justify-between text-2xl text-violet-600 dark:text-violet-400">
              {summary.totalComments}
              <MessageCircle className="h-5 w-5 text-violet-500/80" />
            </CardTitle>
          </CardHeader>
        </Card>
        </motion.div>
        <motion.div whileHover={{ y: -4 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <Card className={PANEL_CARD_CLASS}>
          <CardHeader className="pb-2">
            <CardDescription>Active Story Authors</CardDescription>
            <CardTitle className="flex items-center justify-between text-2xl text-emerald-600 dark:text-emerald-400">
              {summary.uniqueAuthors}
              <User className="h-5 w-5 text-emerald-500/80" />
            </CardTitle>
          </CardHeader>
        </Card>
        </motion.div>
      </div>

      <motion.div
        className="grid grid-cols-1 gap-3 lg:grid-cols-3 xl:gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="rounded-xl border border-primary/15 bg-background/75 p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Engagement Per Story</p>
          <p className="mt-1 inline-flex items-center gap-2 text-lg font-semibold text-foreground">
            <Flame className="h-4 w-4 text-orange-500" />
            {engagementPerStory}
          </p>
        </div>
        <div className="rounded-xl border border-primary/15 bg-background/75 p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Top Destination</p>
          <p className="mt-1 inline-flex items-center gap-2 text-lg font-semibold text-foreground">
            <MapPin className="h-4 w-4 text-blue-500" />
            {topDestinations[0]?.[0] ?? 'No data yet'}
          </p>
        </div>
        <div className="rounded-xl border border-primary/15 bg-background/75 p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Last Updated</p>
          <p className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-foreground">
            <Clock3 className="h-4 w-4 text-violet-500" />
            {new Date().toLocaleTimeString()}
          </p>
        </div>
      </motion.div>

      <motion.div
        className="rounded-xl border border-primary/15 bg-background/70 p-3 shadow-sm xl:px-4 xl:py-3.5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
            Search across stories, actions, and comments
          </p>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search story title, destination, user..."
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary sm:max-w-sm"
          />
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:items-start">
        <Card className={PANEL_CARD_CLASS}>
          <CardHeader>
            <CardTitle>Story Submissions</CardTitle>
            <CardDescription>Every published Trip Story with engagement signals.</CardDescription>
          </CardHeader>
          <CardContent>
            {storiesLoading ? (
              <p className="text-sm text-muted-foreground">Loading stories...</p>
            ) : filteredStories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stories found.</p>
            ) : (
              <div className="space-y-3 xl:max-h-144 xl:overflow-auto xl:pr-1">
                {filteredStories.map((story, index) => (
                  <motion.div
                    key={story.id}
                    className="rounded-xl border border-border/80 bg-background/70 p-3 transition-colors hover:border-primary/30"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.02, 0.25) }}
                    whileHover={{ x: 2 }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-foreground">{story.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {story.destination}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {story.authorName}
                          </span>
                          <span>{formatDateTime(story.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-1 text-rose-600 dark:text-rose-400">
                          <Heart className="h-3.5 w-3.5" />
                          {story.likes.length}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-1 text-blue-600 dark:text-blue-400">
                          <MessageCircle className="h-3.5 w-3.5" />
                          {story.commentCount}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Media: {(story.photos?.length ?? 0)} photos, {(story.videos?.length ?? 0)} videos
                    </div>
                    {story.likes.length > 0 ? (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Liked by: {story.likes.slice(0, 8).join(', ')}{story.likes.length > 8 ? ' ...' : ''}
                      </div>
                    ) : null}
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={PANEL_CARD_CLASS}>
          <CardHeader>
            <CardTitle>Recent Actions</CardTitle>
            <CardDescription>Latest Trip Stories user activity feed.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2">
              {(['all', 'story-created', 'comment-added', 'story-liked'] as ActionFilter[]).map((filterKey) => {
                const isActive = activeActionFilter === filterKey;
                const filterLabel = filterKey === 'all' ? 'All' : ACTION_STYLES[filterKey].label;

                return (
                  <button
                    key={filterKey}
                    onClick={() => setActiveActionFilter(filterKey)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      isActive
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border/70 bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    }`}
                  >
                    {filterLabel}
                  </button>
                );
              })}
            </div>

            {storiesLoading && commentsLoading ? (
              <p className="text-sm text-muted-foreground">Loading actions...</p>
            ) : filteredRecentActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity found.</p>
            ) : (
              <div className="space-y-3 max-h-140 overflow-auto pr-1 xl:max-h-152">
                <AnimatePresence initial={false}>
                  {filteredRecentActions.map((action, index) => {
                    const style = ACTION_STYLES[action.actionType];
                    const ActionIcon = style.icon;

                    return (
                      <motion.div
                        key={action.id}
                        className="rounded-xl border border-border/80 bg-background/70 p-3"
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ delay: Math.min(index * 0.012, 0.2) }}
                        whileHover={{ x: 3 }}
                        layout
                      >
                        <div className={`mb-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${style.pillClass}`}>
                          <ActionIcon className="h-3.5 w-3.5" />
                          {style.label}
                        </div>
                        <div className="flex items-start gap-2">
                          <BookOpen className="mt-0.5 h-4 w-4 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{action.description}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{action.storyTitle}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {action.createdAt ? action.createdAt.toLocaleString() : 'Timestamp unavailable'}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className={PANEL_CARD_CLASS}>
        <CardHeader>
          <CardTitle>Comments Log</CardTitle>
          <CardDescription>All comments posted in Trip Stories.</CardDescription>
        </CardHeader>
        <CardContent>
          {commentsError ? (
            <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-4 w-4" />
              <span className="break-all">{commentsError}</span>
            </div>
          ) : null}

          {commentsLoading ? (
            <p className="text-sm text-muted-foreground">Loading comments...</p>
          ) : filteredComments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments found.</p>
          ) : (
            <div className="space-y-3 max-h-104 overflow-auto pr-1 xl:max-h-96">
              {filteredComments.map((comment, index) => (
                <motion.div
                  key={comment.id}
                  className="rounded-xl border border-border/80 bg-background/70 p-3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.01, 0.2) }}
                  whileHover={{ x: 2 }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{comment.userName}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{comment.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Story: {storyTitleMap.get(comment.storyId) ?? comment.storyId}
                  </p>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
