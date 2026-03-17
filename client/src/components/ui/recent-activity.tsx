import { memo, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { User, MessageSquare, UserPlus } from 'lucide-react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { database } from '@/lib/firebase';

function getTimeAgo(timestamp: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} min ago`;
  return 'Just now';
}

export const RecentActivity = memo(() => {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
      try {
        const combined: any[] = [];

        // ── Source 1: Recent user registrations (Firestore) ────────────────
        try {
          const usersSnap = await getDocs(
            query(collection(firestoreDb, 'users'), orderBy('createdAt', 'desc'), limit(5))
          );
          usersSnap.forEach((doc) => {
            const d = doc.data();
            const ts: Date = d.createdAt?.toDate?.() ?? (d.createdAt ? new Date(d.createdAt) : new Date());
            combined.push({
              action: `New user registered: ${d.displayName || d.email || 'Unknown'}`,
              user: d.email || d.username || 'Unknown',
              timestamp: ts,
              icon: UserPlus,
              color: 'text-blue-500',
            });
          });
        } catch { /* Firestore might not have createdAt index */ }

        // ── Source 2: Recent messages across RTDB chatrooms ────────────────
        try {
          const roomsSnap = await get(ref(database, 'chatrooms'));
          const roomsData = roomsSnap.val();
          if (roomsData) {
            Object.entries(roomsData).forEach(([, room]: [string, any]) => {
              const msgs = room?.messages;
              if (!msgs || typeof msgs !== 'object') return;
              const latest = Object.values(msgs).reduce((a: any, b: any) =>
                ((a?.timestamp || 0) >= (b?.timestamp || 0) ? a : b)
              ) as any;
              if (latest?.username && latest?.timestamp) {
                combined.push({
                  action: `Message in "${room.name || 'room'}": ${(latest.text || 'attachment').slice(0, 50)}`,
                  user: latest.username,
                  timestamp: new Date(latest.timestamp),
                  icon: MessageSquare,
                  color: 'text-green-500',
                });
              }
            });
          }
        } catch { /* RTDB unavailable */ }

        // ── Source 3: Recent admin logins from RTDB status nodes ──────────
        try {
          const statusSnap = await get(ref(database, 'status'));
          const statusData = statusSnap.val();
          if (statusData) {
            Object.values(statusData).forEach((s: any) => {
              if (s?.username && s?.lastSeen) {
                combined.push({
                  action: `User came online: ${s.username}`,
                  user: s.username,
                  timestamp: new Date(s.lastSeen),
                  icon: User,
                  color: 'text-purple-500',
                });
              }
            });
          }
        } catch { /* status not available */ }

        // Sort newest first, take top 8
        combined.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setActivities(combined.slice(0, 8).map(a => ({ ...a, time: getTimeAgo(a.timestamp) })));
      } catch (error) {
        if ((process.env.NODE_ENV === "development")) console.error('Failed to fetch activity:', error);
      } finally {
        setLoading(false);
      }
  }, []);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  if (loading) {
    return (
      <div className="border-border bg-card/40 rounded-xl border p-6">
        <h3 className="mb-4 text-xl font-semibold">Recent Activity</h3>
        <div className="text-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
        </div>
      </div>
    );
  }
  return (
    <div className="border-border bg-card/40 rounded-xl border p-6">
      <h3 className="mb-4 text-xl font-semibold">Recent Activity</h3>
      <div className="space-y-3">
        {activities.map((activity, index) => {
          const Icon = activity.icon;
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="hover:bg-accent/50 flex items-center gap-3 rounded-lg p-2 transition-colors"
            >
              <div className={`bg-accent/50 rounded-lg p-2`}>
                <Icon className={`h-4 w-4 ${activity.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{activity.action}</div>
                <div className="text-muted-foreground truncate text-xs">
                  {activity.user}
                </div>
              </div>
              <div className="text-muted-foreground text-xs">
                {activity.time}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
});

RecentActivity.displayName = 'RecentActivity';

