import { memo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Database, Zap, Activity } from 'lucide-react';
import { ref, get } from 'firebase/database';
import { getCountFromServer, collection } from 'firebase/firestore';
import { database, firestoreDb } from '@/lib/firebase';

export const SystemStatus = memo(() => {
  const [statusItems, setStatusItems] = useState([
    { label: 'Firebase Auth',   status: 'Checking...', color: 'text-gray-500', icon: Shield,   percentage: 0 },
    { label: 'Firestore DB',    status: 'Checking...', color: 'text-gray-500', icon: Database, percentage: 0 },
    { label: 'Realtime DB',     status: 'Checking...', color: 'text-gray-500', icon: Zap,      percentage: 0 },
    { label: 'Response Time',   status: 'Checking...', color: 'text-gray-500', icon: Activity, percentage: 0 },
  ]);

  useEffect(() => {
    const checkStatus = async () => {
      const results = [
        { label: 'Firebase Auth',   icon: Shield,   ok: false, detail: 'Offline', pct: 0 },
        { label: 'Firestore DB',    icon: Database, ok: false, detail: 'Offline', pct: 0 },
        { label: 'Realtime DB',     icon: Zap,      ok: false, detail: 'Offline', pct: 0 },
        { label: 'Response Time',   icon: Activity, ok: false, detail: 'Unknown', pct: 0 },
      ];

      // Check Firestore connectivity
      const fsStart = Date.now();
      try {
        await getCountFromServer(collection(firestoreDb, 'users'));
        const fsMs = Date.now() - fsStart;
        results[0].ok = true; results[0].detail = 'Healthy'; results[0].pct = 100; // Auth OK if Firestore OK
        results[1].ok = true; results[1].detail = 'Healthy'; results[1].pct = 100;
        results[3].ok = fsMs < 600; results[3].detail = `${fsMs}ms`;
        results[3].pct = Math.max(0, Math.min(100, Math.round(100 - (fsMs / 20))));
      } catch {
        results[0].detail = 'Degraded'; results[0].pct = 50;
        results[1].detail = 'Offline';  results[1].pct = 0;
      }

      // Check RTDB connectivity
      try {
        const rtStart = Date.now();
        await get(ref(database, '.info/connected'));
        const rtMs = Date.now() - rtStart;
        results[2].ok = true; results[2].detail = `${rtMs}ms`; results[2].pct = 100;
      } catch {
        results[2].detail = 'Offline'; results[2].pct = 0;
      }

      setStatusItems(results.map(r => ({
        label:      r.label,
        status:     r.detail,
        color:      r.ok ? 'text-green-500' : 'text-red-500',
        icon:       r.icon,
        percentage: r.pct,
      })));
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000);
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
                  className={`text-sm font-medium ${item.color} min-w-15 text-right`}
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
