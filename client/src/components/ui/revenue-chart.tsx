import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { BarChart3, Calendar } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';

export const RevenueChart = memo(() => {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRevenueData = useCallback(async () => {
    try {
      const paymentsSnap = await getDocs(
        query(collection(firestoreDb, 'subscriptionPayments'), where('status', '==', 'paid')),
      );
      const revenueByMonth: Record<string, number> = {};
      paymentsSnap.forEach((doc) => {
        const payment = doc.data() as Record<string, any>;
        const amountFromPaise = typeof payment.amountInPaise === 'number' ? payment.amountInPaise / 100 : null;
        const amount = typeof amountFromPaise === 'number'
          ? amountFromPaise
          : (typeof payment.amount === 'number' ? payment.amount : 0);

        const createdAt: Date = payment.verifiedAt
          ? new Date(payment.verifiedAt)
          : (payment.createdAt?.toDate?.() ?? (payment.createdAt ? new Date(payment.createdAt) : new Date()));
        const key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
        revenueByMonth[key] = (revenueByMonth[key] || 0) + amount;
      });

      const lastSix: { month: string; value: number; monthKey: string }[] = [];
      const baseMonth = new Date();
      baseMonth.setDate(1);

      for (let i = 5; i >= 0; i--) {
        const d = new Date(baseMonth);
        d.setMonth(baseMonth.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-US', { month: 'short' });
        lastSix.push({ month: label, value: parseFloat((revenueByMonth[key] || 0).toFixed(2)), monthKey: key });
      }

      const maxValue = Math.max(...lastSix.map(x => x.value), 1);
      const withMeta = lastSix.map((item, index) => {
        const prev = index > 0 ? lastSix[index - 1].value : item.value;
        const growth = prev > 0 ? Math.round(((item.value - prev) / prev) * 100) : 0;
        return { ...item, growth, color: growth >= 0 ? 'bg-green-500' : 'bg-red-500', maxValue };
      });

      setChartData(withMeta);
    } catch (error) {
      if ((process.env.NODE_ENV === "development")) console.error('Failed to fetch revenue data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRevenueData(); }, [fetchRevenueData]);

  // Derive summary stats without extra state
  const { totalRevenue, maxValue, avgRevenue, totalGrowth } = useMemo(() => {
    const total = parseFloat(chartData.reduce((s, x) => s + x.value, 0).toFixed(2));
    const max = Math.max(...chartData.map(d => d.value), 1);
    const avg = chartData.length > 0 ? total / chartData.length : 0;
    const growth = chartData.length > 1
      ? ((chartData[chartData.length - 1].value - chartData[0].value) / (chartData[0].value || 1)) * 100
      : 0;
    return { totalRevenue: total, maxValue: max, avgRevenue: avg, totalGrowth: growth };
  }, [chartData]);

  if (loading) {
    return (
      <div className="border-border bg-card/40 rounded-xl border p-6">
        <div className="text-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading revenue data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border bg-card/40 rounded-xl border p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="h-5 w-5 text-green-500" />
            Revenue Analytics
          </h3>
          <p className="text-muted-foreground text-sm">
            Monthly revenue performance
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Calendar className="mr-2 h-4 w-4" />
          Last 6 months
        </Button>
      </div>

      {/* Fixed Chart Area */}
      <div className="relative mb-4 h-64 rounded-lg p-4">
        <div className="flex h-full items-end justify-between gap-3">
          {chartData.map((item, index) => (
            <div
              key={item.monthKey}
              className="group flex flex-1 flex-col items-center"
            >
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${(item.value / maxValue) * 180}px` }}
                transition={{ duration: 1, delay: index * 0.1 }}
                className={`w-full ${item.color} relative min-h-5 cursor-pointer rounded-t-lg transition-opacity hover:opacity-80`}
              >
                {/* Tooltip */}
                <div className="border-border bg-popover absolute -top-16 left-1/2 z-10 -translate-x-1/2 transform rounded-lg border px-3 py-2 text-sm whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  <div className="font-medium">
                    ${item.value.toLocaleString()}
                  </div>
                  <div
                    className={`text-xs ${item.growth > 0 ? 'text-green-500' : 'text-red-500'}`}
                  >
                    {item.growth > 0 ? '+' : ''}
                    {item.growth}%
                  </div>
                </div>
              </motion.div>
              <div className="text-muted-foreground mt-2 text-center text-xs font-medium">
                {item.month}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="border-border/50 grid grid-cols-3 gap-4 border-t pt-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-500">
            ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-muted-foreground text-xs">Total Revenue</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-bold ${totalGrowth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalGrowth >= 0 ? '+' : ''}{totalGrowth.toFixed(1)}%
          </div>
          <div className="text-muted-foreground text-xs">Growth Rate</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-500">
            ${avgRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-muted-foreground text-xs">Average</div>
        </div>
      </div>
    </div>
  );
});

RevenueChart.displayName = 'RevenueChart';

