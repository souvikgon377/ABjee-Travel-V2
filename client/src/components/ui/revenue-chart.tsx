import { memo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { BarChart3, Calendar } from 'lucide-react';
import { adminAPI } from '@/lib/api';

export const RevenueChart = memo(() => {
  const [chartData, setChartData] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRevenueData = async () => {
      try {
        const response = await adminAPI.getRevenue({ period: 'month' });
        const data = response.data.data.revenue;
        
        // Get last 6 months
        const lastSixMonths = data.slice(-6);
        const maxValue = Math.max(...lastSixMonths.map((d: any) => d.revenue), 1);
        
        const chartDataWithColors = lastSixMonths.map((item: any, index: number) => {
          const prevRevenue = index > 0 ? lastSixMonths[index - 1].revenue : item.revenue;
          const growth = prevRevenue > 0 ? ((item.revenue - prevRevenue) / prevRevenue) * 100 : 0;
          
          return {
            month: item.month,
            value: item.revenue,
            growth: Math.round(growth),
            color: growth >= 0 ? 'bg-green-500' : 'bg-red-500',
            maxValue
          };
        });

        setChartData(chartDataWithColors);
        setTotalRevenue(response.data.data.total);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Failed to fetch revenue data:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRevenueData();
  }, []);

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

  const maxValue = Math.max(...chartData.map(d => d.value), 1);
  const avgRevenue = chartData.length > 0 ? totalRevenue / chartData.length : 0;
  const totalGrowth = chartData.length > 1 ? 
    ((chartData[chartData.length - 1].value - chartData[0].value) / chartData[0].value) * 100 : 0;
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
              key={item.month}
              className="group flex flex-1 flex-col items-center"
            >
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${(item.value / maxValue) * 180}px` }}
                transition={{ duration: 1, delay: index * 0.1 }}
                className={`w-full ${item.color} relative min-h-[20px] cursor-pointer rounded-t-lg transition-opacity hover:opacity-80`}
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
