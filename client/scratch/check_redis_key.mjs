import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { getRedis } = await import('../src/lib/server/redis.ts');

async function checkKeySize() {
  const redis = getRedis();
  if (!redis) return;

  const data = await redis.get('prod:tour:places:all');
  if (data) {
    console.log(`Key 'prod:tour:places:all' found.`);
    console.log(`Type: ${typeof data}`);
    if (Array.isArray(data)) {
        console.log(`Array Length: ${data.length}`);
        if (data.length > 0) {
            console.log(`Sample: ${data[0].name}`);
        }
    } else {
        console.log(`Data: ${JSON.stringify(data).slice(0, 100)}...`);
    }
  } else {
    console.log(`Key 'prod:tour:places:all' NOT found.`);
  }
}

checkKeySize().catch(console.error);
