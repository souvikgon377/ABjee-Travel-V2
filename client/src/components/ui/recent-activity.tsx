import { memo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Download, Settings, Users, UserPlus } from 'lucide-react';
import { adminAPI } from '@/lib/api';

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

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const response = await adminAPI.getActivity({ limit: 5 });
        const activityData = response.data.data.activities.map((activity: any) => ({
          action: activity.description,
          user: activity.user,
          time: getTimeAgo(activity.timestamp),
          icon: activity.type === 'user_registered' ? UserPlus : User,
          color: 'text-blue-500',
        }));
        setActivities(activityData);
      } catch (error) {
        console.error('Failed to fetch activity:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, []);

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
