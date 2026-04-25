import { Redis } from '@upstash/redis';

async function clearCache() {
  const url = 'https://fair-cardinal-85456.upstash.io';
  const token = 'gQAAAAAAAU3QAAIgcDE3NjQ3OGNmY2Y1Yzk0NDBkYmQyMGRlY2IxZGI2NThhMw';

  const redis = new Redis({
    url,
    token,
  });
  
  console.log('Connected to Upstash Redis');
  
  const keys = await redis.keys('places:v4:*');
  console.log(`Found ${keys.length} keys to delete`);
  
  if (keys.length > 0) {
    // Upstash SDK del accepts an array as spread arguments or separate arguments
    await redis.del(...keys);
    console.log('Deleted keys successfully');
  }
}

clearCache().catch(console.error);
