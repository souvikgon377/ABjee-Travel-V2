import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Database, Zap, Activity, Bot } from 'lucide-react';
import { adminAPI } from '@/lib/api';

interface SystemStatusProps {
  refreshTrigger?: number;
}

export const SystemStatus = memo(({ refreshTrigger = 0 }: SystemStatusProps) => {
  const [statusItems, setStatusItems] = useState([
    { label: 'Firebase Auth', status: 'Checking...', color: 'text-gray-500', icon: Shield, percentage: 0 },
    { label: 'Firestore DB', status: 'Checking...', color: 'text-gray-500', icon: Database, percentage: 0 },
    { label: 'Realtime DB', status: 'Checking...', color: 'text-gray-500', icon: Zap, percentage: 0 },
    { label: 'Gemini API', status: 'Checking...', color: 'text-gray-500', icon: Bot, percentage: 0 },
    { label: 'Response Time', status: 'Checking...', color: 'text-gray-500', icon: Activity, percentage: 0 },
  ]);
  const [quotaTelemetry, setQuotaTelemetry] = useState<{
    generatedAt: string;
    datasetCounts: {
      users: number;
      stories: number;
      touristPlaces: number;
      itineraries: number;
      notifications: number;
      subscriptions: number;
      payments: number;
    };
    risk: { score: number; level: string; note: string };
    safeguards: { exportPageSize: number; maxExportRowsPerSection: number; adminPollIntervalSeconds: number };
  } | null>(null);
  const [redisTesting, setRedisTesting] = useState(false);
  const [redisError, setRedisError] = useState('');
  const [redisHealth, setRedisHealth] = useState<{
    env?: {
      redisUrlSet?: boolean;
      redisTokenSet?: boolean;
      source?: string;
    };
    ping?: {
      ok?: boolean;
      result?: string | null;
      latencyMs?: number;
      error?: string;
    };
    cacheRoundTrip?: {
      ok?: boolean;
      error?: string;
    };
  } | null>(null);

  const handleTestRedis = async () => {
    setRedisTesting(true);
    setRedisError('');

    try {
      const response = await adminAPI.getRedisHealth();
      const payload = response?.data?.data;
      setRedisHealth(payload || null);
      if (!payload) {
        setRedisError('Redis health response was empty.');
      }
    } catch (error: any) {
      setRedisHealth(null);
      const detail = error?.response?.data?.detail;
      const message = error?.response?.data?.message;
      setRedisError(detail || message || 'Redis health check failed.');
    } finally {
      setRedisTesting(false);
    }
  };

  useEffect(() => {
    if (!refreshTrigger) return;

    const checkStatus = async () => {
      const results = [
        { label: 'Firebase Auth', icon: Shield, ok: false, detail: 'Offline', pct: 0 },
        { label: 'Firestore DB', icon: Database, ok: false, detail: 'Offline', pct: 0 },
        { label: 'Realtime DB', icon: Zap, ok: false, detail: 'Offline', pct: 0 },
        { label: 'Gemini API', icon: Bot, ok: false, detail: 'Offline', pct: 0 },
        { label: 'Response Time', icon: Activity, ok: false, detail: 'Unknown', pct: 0 },
      ];

      try {
        const serverRes = await adminAPI.getSystemStatus();
        const payload = serverRes?.data?.data;

        if (payload) {
          const firestoreMs = Number(payload?.firestore?.ms || 0);
          const rtdbMs = Number(payload?.realtimeDb?.ms || 0);
          const totalMs = Number(payload?.responseTimeMs || 0);

          results[0].ok = payload.firebaseAuth === true;
          results[0].detail = results[0].ok ? 'Healthy' : 'Degraded';
          results[0].pct = results[0].ok ? 100 : 50;

          results[1].ok = payload?.firestore?.ok === true;
          results[1].detail = results[1].ok ? 'Healthy' : 'Offline';
          results[1].pct = results[1].ok ? 100 : 0;

          results[2].ok = payload?.realtimeDb?.ok === true;
          results[2].detail = results[2].ok ? `${rtdbMs}ms` : 'Offline';
          results[2].pct = results[2].ok ? 100 : 0;

          const geminiMs = Number(payload?.gemini?.ms || 0);
          results[3].ok = payload?.gemini?.ok === true;
          results[3].detail = results[3].ok ? `${geminiMs}ms` : String(payload?.gemini?.detail || 'Offline');
          results[3].pct = results[3].ok ? 100 : 0;

          const rtForUi = totalMs > 0 ? totalMs : Math.max(firestoreMs, rtdbMs);
          results[4].ok = rtForUi < 600;
          results[4].detail = `${rtForUi}ms`;
          results[4].pct = Math.max(0, Math.min(100, Math.round(100 - (rtForUi / 20))));

          setStatusItems(results.map((result) => ({
            label: result.label,
            status: result.detail,
            color: result.ok ? 'text-green-500' : 'text-red-500',
            icon: result.icon,
            percentage: result.pct,
          })));
        }
      } catch {
        // Keep default checking state if server call fails.
      }

      try {
        const telemetryRes = await adminAPI.getQuotaTelemetry();
        const telemetry = telemetryRes?.data?.data;
        if (telemetry) {
          setQuotaTelemetry(telemetry);
        }
      } catch {
        setQuotaTelemetry(null);
      }
    };

    void checkStatus();
  }, [refreshTrigger]);

  if (!refreshTrigger) {
    return (
      <div className="border-border bg-card/40 rounded-xl border p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">System Status</h3>
          <button
            type="button"
            onClick={() => void handleTestRedis()}
            disabled={redisTesting}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {redisTesting ? 'Testing Redis...' : 'Test Redis'}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Click Refresh Dashboard to load system health and quota telemetry.
        </p>
        {(redisHealth || redisError) && (
          <div className="mt-3 rounded-lg border border-border/70 bg-background/60 p-3 text-xs">
            {redisError ? (
              <p className="text-red-500">Redis: {redisError}</p>
            ) : (
              <div className="space-y-1 text-muted-foreground">
                <p className={redisHealth?.ping?.ok ? 'text-green-500' : 'text-red-500'}>
                  Ping: {redisHealth?.ping?.ok ? `OK (${redisHealth?.ping?.latencyMs ?? 0}ms)` : redisHealth?.ping?.error || 'Failed'}
                </p>
                <p className={redisHealth?.cacheRoundTrip?.ok ? 'text-green-500' : 'text-red-500'}>
                  Cache round-trip: {redisHealth?.cacheRoundTrip?.ok ? 'OK' : redisHealth?.cacheRoundTrip?.error || 'Failed'}
                </p>
                <p>
                  Env: URL {redisHealth?.env?.redisUrlSet ? 'set' : 'missing'}, token {redisHealth?.env?.redisTokenSet ? 'set' : 'missing'}, source {redisHealth?.env?.source || 'unknown'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-border bg-card/40 rounded-xl border p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">System Status</h3>
        <button
          type="button"
          onClick={() => void handleTestRedis()}
          disabled={redisTesting}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {redisTesting ? 'Testing Redis...' : 'Test Redis'}
        </button>
      </div>
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
                <span className={`min-w-15 text-right text-sm font-medium ${item.color}`}>
                  {item.status}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
      {(redisHealth || redisError) && (
        <div className="mt-4 rounded-lg border border-border/70 bg-background/60 p-3 text-xs">
          {redisError ? (
            <p className="text-red-500">Redis: {redisError}</p>
          ) : (
            <div className="space-y-1 text-muted-foreground">
              <p className={redisHealth?.ping?.ok ? 'text-green-500' : 'text-red-500'}>
                Ping: {redisHealth?.ping?.ok ? `OK (${redisHealth?.ping?.latencyMs ?? 0}ms)` : redisHealth?.ping?.error || 'Failed'}
              </p>
              <p className={redisHealth?.cacheRoundTrip?.ok ? 'text-green-500' : 'text-red-500'}>
                Cache round-trip: {redisHealth?.cacheRoundTrip?.ok ? 'OK' : redisHealth?.cacheRoundTrip?.error || 'Failed'}
              </p>
              <p>
                Env: URL {redisHealth?.env?.redisUrlSet ? 'set' : 'missing'}, token {redisHealth?.env?.redisTokenSet ? 'set' : 'missing'}, source {redisHealth?.env?.source || 'unknown'}
              </p>
            </div>
          )}
        </div>
      )}
      {quotaTelemetry && (
        <div className="mt-5 rounded-lg border border-border/70 bg-background/60 p-3">
          <p className="text-sm font-semibold">Quota Telemetry</p>
          <p className="mt-1 text-xs text-muted-foreground">Risk: {quotaTelemetry.risk.level} ({quotaTelemetry.risk.score}/100)</p>
          <p className="text-xs text-muted-foreground">{quotaTelemetry.risk.note}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <span>Users: {quotaTelemetry.datasetCounts.users}</span>
            <span>Stories: {quotaTelemetry.datasetCounts.stories}</span>
            <span>Places: {quotaTelemetry.datasetCounts.touristPlaces}</span>
            <span>Itineraries: {quotaTelemetry.datasetCounts.itineraries}</span>
            <span>Notifications: {quotaTelemetry.datasetCounts.notifications}</span>
            <span>Subscriptions: {quotaTelemetry.datasetCounts.subscriptions}</span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Safe caps: page {quotaTelemetry.safeguards.exportPageSize}, per-section {quotaTelemetry.safeguards.maxExportRowsPerSection}, poll {quotaTelemetry.safeguards.adminPollIntervalSeconds}s.
          </p>
        </div>
      )}
    </div>
  );
});

SystemStatus.displayName = 'SystemStatus';
