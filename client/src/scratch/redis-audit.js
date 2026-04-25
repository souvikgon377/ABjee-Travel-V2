import { Redis } from '@upstash/redis';

async function auditRedis() {
  const url = 'https://fair-cardinal-85456.upstash.io';
  const token = 'gQAAAAAAAU3QAAIgcDE3NjQ3OGNmY2Y1Yzk0NDBkYmQyMGRlY2IxZGI2NThhMw';

  const redis = new Redis({
    url,
    token,
  });
  
  console.log('--- Redis Audit (Places V4) ---');
  
  try {
    const keys = await redis.keys('places:v4:*');
    console.log(`Places V4 Keys: ${keys.length}`);
    
    if (keys.length > 0) {
      const sampleKeys = keys.slice(0, 10);
      for (const key of sampleKeys) {
        const ttl = await redis.ttl(key);
        console.log(`Key: ${key.substring(0, 80)}..., TTL: ${ttl}`);
      }
    }
  } catch (e) {
    console.error('Audit failed:', e);
  }
}

auditRedis().catch(console.error);
