import { Redis } from '@upstash/redis';

async function checkKeys() {
  const url = 'https://fair-cardinal-85456.upstash.io';
  const token = 'gQAAAAAAAU3QAAIgcDE3NjQ3OGNmY2Y1Yzk0NDBkYmQyMGRlY2IxZGI2NThhMw';

  const redis = new Redis({
    url,
    token,
  });
  
  const tokenKeys = ['idx:token:goa'];
  try {
    const redisIds = await redis.sinter(...tokenKeys);
    console.log(`sinter(...tokenKeys) ->`, redisIds);
  } catch (err) {
    console.error('Error sinter:', err);
  }
}

checkKeys().catch(console.error);
