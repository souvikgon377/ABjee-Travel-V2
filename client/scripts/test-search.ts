import { getRedis } from '@/lib/server/redis';
import { adminSearch } from '@/lib/server/touristSearchUtils';

async function test() {
  const r = getRedis();
  if (!r) {
    console.error("Redis not available");
    return;
  }
  
  const m = await r.smembers('idx:test:token:kolkata');
  console.log(`SMEMBERS kolkata: ${m.length}`);
  
  const res = await adminSearch({ search: 'kolkata', location: '', filter: 'all', page: 1, limit: 30 });
  console.log(`adminSearch kolkata: ${res.data.length} - ${res.total}`);
}
test();