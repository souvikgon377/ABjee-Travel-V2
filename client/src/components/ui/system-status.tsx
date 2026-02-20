import { memo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Database, Zap, Activity } from 'lucide-react';
import { adminAPI } from '@/lib/api';

export const SystemStatus = memo(() => {
  const [statusItems, setStatusItems] = useState([
    {
      label: 'Server Status',
      status: 'Loading...',
      color: 'text-gray-500',
      icon: Shield,
      percentage: 0,
    },
    {
      label: 'Database',
      status: 'Loading...',
      color: 'text-gray-500',
      icon: Database,
      percentage: 0,
    },
    {
      label: 'API Response',
      status: 'Loading...',
      color: 'text-gray-500',
      icon: Zap,
      percentage: 0,
    },
    {
      label: 'Storage',
      status: 'Loading...',
      color: 'text-gray-500',
      icon: Activity,
      percentage: 0,
    },
  ]);

  useEffect(() => {
    const fetchSystemStatus = async () => {
      try {
        const response = await adminAPI.getSystemStatus();
        const data = response.data.data;

        setStatusItems([
          {
            label: 'Server Status',
            status: data.server.status === 'operational' ? 'Online' : 'Offline',
            color: data.server.status === 'operational' ? 'text-green-500' : 'text-red-500',
            icon: Shield,
            percentage: data.server.status === 'operational' ? 100 : 0,
          },
          {
            label: 'Database',
            status: data.database.connected ? 'Healthy' : 'Disconnected',
            color: data.database.connected ? 'text-green-500' : 'text-red-500',
            icon: Database,
            percentage: data.database.connected ? 100 : 0,
          },
          {
            label: 'API Response',
            status: data.api.responseTime < 200 ? 'Fast' : 'Slow',
            color: data.api.responseTime < 200 ? 'text-green-500' : 'text-yellow-500',
            icon: Zap,
            percentage: Math.min(100, Math.max(0, 100 - (data.api.responseTime / 10))),
          },
          {
            label: 'Storage',
            status: '45% Used',
            color: 'text-green-500',
            icon: Activity,
            percentage: 45,
          },
        ]);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Failed to fetch system status:', error);
        }
      }
    };

    fetchSystemStatus();
    const interval = setInterval(fetchSystemStatus, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);
  return (
    <div className="border-border bg-card/40 rounded-xl border p-6">
      <h3 className="mb-4 text-xl font-semibold">System Status</h3>
      <div className="space-y-4">
        {statusItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="hover:bg-accent/50 flex cursor-pointer items-center justify-between rounded-lg p-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-4 w-4 ${item.color}`} />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-muted h-2 w-16 overflow-hidden rounded-full">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.percentage}%` }}
                    transition={{ duration: 1, delay: index * 0.1 }}
                    className={`h-full rounded-full ${item.color.replace('text-', 'bg-')}`}
                  />
                </div>
                <span
                  className={`text-sm font-medium ${item.color} min-w-[60px] text-right`}
                >
                  {item.status}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
});

SystemStatus.displayName = 'SystemStatus';
