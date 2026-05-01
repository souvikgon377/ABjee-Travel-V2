import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

// Import after loading env
const { getRedis } = await import('../src/lib/server/redis.ts');

async function checkRedis() {
  const redis = getRedis();
  if (!redis) {
    console.error('Redis connection failed');
    return;
  }

  const version = await redis.get('places:version');
  const shardCount = await redis.get('places:min:shards');
  
  console.log(`Version: ${version}`);
  console.log(`Shard Count: ${shardCount}`);
  
  if (shardCount) {
    const count = parseInt(shardCount);
    let totalShardsFound = 0;
    for (let i = 0; i < count; i++) {
        const shard = await redis.get(`places:min:shard:${i}`);
        if (shard) {
            totalShardsFound += 1;
        }
    }
    console.log(`Actual Shards Found: ${totalShardsFound}`);
  }
}

checkRedis().catch(console.error);
