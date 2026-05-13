import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { User, UserPlus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { adminAPI } from '@/lib/api';

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

export const RecentActivity = memo(() => {
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    try {
      const response = await adminAPI.getActivityOverview();
      const payload = response?.data?.data as {
        profiles?: UserProfile[];
        activities?: Array<{
          id: string;
          userId: string | null;
          action: string;
          user: string;
          timestamp: string;
          time: string;
          color: string;
          kind: 'registration' | 'presence';
        }>;
      };

      const loadedProfiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
      const loadedActivities: ActivityType[] = Array.isArray(payload?.activities)
        ? payload.activities.map((item) => ({
            id: item.id,
            userId: item.userId,
            action: item.action,
            user: item.user,
            timestamp: new Date(item.timestamp),
            time: item.time,
            icon: item.kind === 'registration' ? UserPlus : User,
            color: item.color || (item.kind === 'registration' ? 'text-blue-500' : 'text-purple-500'),
          }))
        : [];

      setActivities(loadedActivities);
      setProfiles(loadedProfiles);

      if (!selectedUserId && loadedProfiles.length > 0) {
        setSelectedUserId(loadedProfiles[0].id);
      }
    } catch (error) {
      if ((process.env.NODE_ENV === 'development')) console.error('Failed to fetch activity:', error);
      setActivities([]);
      setProfiles([]);
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

