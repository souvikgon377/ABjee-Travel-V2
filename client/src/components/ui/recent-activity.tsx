import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { User, MessageSquare, UserPlus, Search } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { database } from '@/lib/firebase';
import { Input } from '@/components/ui/input';

type ActivityType = {
  id: string;
  userId: string | null;
  action: string;
  user: string;
  timestamp: Date;
  time: string;
  icon: typeof User;
  color: string;
};

type UserProfile = {
  id: string;
  displayName: string;
  username: string;
  email: string;
  area: string;
  state: string;
  country: string;
  city: string;
};

function normalize(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function getDisplayName(profile: UserProfile): string {
  return profile.displayName || profile.username || profile.email || 'Unknown user';
}

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
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
      try {
        const combined: ActivityType[] = [];
        const identityToUserId = new Map<string, string>();
        const loadedProfiles: UserProfile[] = [];

        // Source 1: User profiles and registration activity from Firestore.
        try {
          const usersSnap = await getDocs(collection(firestoreDb, 'users'));
          usersSnap.forEach((doc) => {
            const d = doc.data();
            const ts: Date = d.createdAt?.toDate?.() ?? (d.createdAt ? new Date(d.createdAt) : new Date());

            const profile: UserProfile = {
              id: doc.id,
              displayName: d.displayName || `${d.firstName || ''} ${d.lastName || ''}`.trim(),
              username: d.username || '',
              email: d.email || '',
              area: d.area || d.address || '',
              state: d.state || d.province || '',
              country: d.country || '',
              city: d.city || '',
            };

            loadedProfiles.push(profile);

            [
              profile.id,
              profile.displayName,
              profile.username,
              profile.email,
            ].forEach((identity) => {
              const key = normalize(identity);
              if (key) identityToUserId.set(key, profile.id);
            });

            combined.push({
              id: `register-${doc.id}`,
              userId: doc.id,
              action: `New user registered: ${d.displayName || d.email || 'Unknown'}`,
              user: d.email || d.username || 'Unknown',
              timestamp: ts,
              time: getTimeAgo(ts),
              icon: UserPlus,
              color: 'text-blue-500',
            });
          });
        } catch {
          // Ignore profile source failures to keep dashboard usable.
        }

        // Source 2: Messages across RTDB chatrooms.
        try {
          const roomsSnap = await get(ref(database, 'chatrooms'));
          const roomsData = roomsSnap.val();
          if (roomsData) {
            Object.entries(roomsData).forEach(([roomId, room]: [string, any]) => {
              const msgs = room?.messages;
              if (!msgs || typeof msgs !== 'object') return;

              Object.entries(msgs).forEach(([messageId, msg]: [string, any]) => {
                if (!msg?.timestamp) return;
                const label = msg.username || msg.email || 'Unknown';
                const userId =
                  identityToUserId.get(normalize(msg.userId || '')) ||
                  identityToUserId.get(normalize(label)) ||
                  null;
                const ts = new Date(msg.timestamp);

                combined.push({
                  id: `msg-${roomId}-${messageId}`,
                  userId,
                  action: `Message in "${room.name || 'room'}": ${String(msg.text || 'attachment').slice(0, 50)}`,
                  user: label,
                  timestamp: ts,
                  time: getTimeAgo(ts),
                  icon: MessageSquare,
                  color: 'text-green-500',
                });
              });
            });
          }
        } catch {
          // Ignore RTDB chat source failures.
        }

        // Source 3: Online/offline events from RTDB status nodes.
        try {
          const statusSnap = await get(ref(database, 'status'));
          const statusData = statusSnap.val();
          if (statusData) {
            Object.entries(statusData).forEach(([statusUserId, s]: [string, any]) => {
              if (s?.username && s?.lastSeen) {
                const userId =
                  identityToUserId.get(normalize(statusUserId)) ||
                  identityToUserId.get(normalize(s.username)) ||
                  null;
                const ts = new Date(s.lastSeen);

                combined.push({
                  id: `status-${statusUserId}-${ts.getTime()}`,
                  userId,
                  action: `User came online: ${s.username}`,
                  user: s.username,
                  timestamp: ts,
                  time: getTimeAgo(ts),
                  icon: User,
                  color: 'text-purple-500',
                });
              }
            });
          }
        } catch {
          // Ignore status source failures.
        }

        // Sort newest first and keep the full stream for filtering/drill-down.
        combined.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setActivities(combined);
        setProfiles(loadedProfiles);

        if (!selectedUserId && loadedProfiles.length > 0) {
          setSelectedUserId(loadedProfiles[0].id);
        }
      } catch (error) {
        if ((process.env.NODE_ENV === "development")) console.error('Failed to fetch activity:', error);
      } finally {
        setLoading(false);
      }
  }, [selectedUserId]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  const filteredProfiles = useMemo(() => {
    const q = normalize(searchQuery);
    if (!q) return profiles;

    return profiles.filter((profile) => {
      const haystack = [
        profile.displayName,
        profile.username,
        profile.email,
        profile.area,
        profile.state,
        profile.country,
        profile.city,
      ]
        .map(normalize)
        .join(' ');
      return haystack.includes(q);
    });
  }, [profiles, searchQuery]);

  const selectedUserActivities = useMemo(() => {
    if (!selectedUserId) return activities;

    const selectedProfile = profiles.find((p) => p.id === selectedUserId);
    if (!selectedProfile) return [];

    const selectedAliases = new Set(
      [selectedProfile.id, selectedProfile.displayName, selectedProfile.username, selectedProfile.email]
        .map(normalize)
        .filter(Boolean)
    );

    return activities.filter((activity) => {
      if (activity.userId && activity.userId === selectedUserId) return true;
      return selectedAliases.has(normalize(activity.user));
    });
  }, [activities, profiles, selectedUserId]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedUserId) || null,
    [profiles, selectedUserId]
  );

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

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by name, area, state, or country"
            className="pl-10"
          />
        </div>
        <div className="text-muted-foreground flex items-center justify-start text-sm md:justify-end">
          {filteredProfiles.length} user(s) matched
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="border-border rounded-lg border p-3 lg:col-span-1">
          <p className="mb-3 text-sm font-medium">Users</p>
          <div className="max-h-105 space-y-2 overflow-y-auto pr-1">
            {filteredProfiles.map((profile) => {
              const isSelected = profile.id === selectedUserId;

              return (
                <button
                  type="button"
                  key={profile.id}
                  onClick={() => setSelectedUserId(profile.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    isSelected
                      ? 'border-primary bg-accent/70'
                      : 'border-border hover:bg-accent/40'
                  }`}
                >
                  <p className="truncate text-sm font-medium">{getDisplayName(profile)}</p>
                  <p className="text-muted-foreground truncate text-xs">{profile.email || profile.username}</p>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {[profile.area || profile.city, profile.state, profile.country]
                      .filter(Boolean)
                      .join(', ') || 'No location data'}
                  </p>
                </button>
              );
            })}
            {filteredProfiles.length === 0 && (
              <p className="text-muted-foreground py-6 text-center text-sm">No users found for this search.</p>
            )}
          </div>
        </div>

        <div className="border-border rounded-lg border p-3 lg:col-span-2">
          <p className="mb-3 text-sm font-medium">
            {selectedProfile
              ? `All Activity: ${getDisplayName(selectedProfile)}`
              : 'All Activity'}
          </p>
          <div className="max-h-105 space-y-3 overflow-y-auto pr-1">
            {selectedUserActivities.map((activity, index) => {
              const Icon = activity.icon;

              return (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="hover:bg-accent/50 flex items-center gap-3 rounded-lg p-2 transition-colors"
                >
                  <div className="bg-accent/50 rounded-lg p-2">
                    <Icon className={`h-4 w-4 ${activity.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{activity.action}</div>
                    <div className="text-muted-foreground truncate text-xs">{activity.user}</div>
                  </div>
                  <div className="text-muted-foreground shrink-0 text-xs">{activity.time}</div>
                </motion.div>
              );
            })}
            {selectedUserActivities.length === 0 && (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No activity found for the selected user.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

RecentActivity.displayName = 'RecentActivity';

