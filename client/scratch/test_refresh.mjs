import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { refreshCacheInBackground } = await import('../src/lib/server/sharedPlacesCache.ts');

async function testRefresh() {
  console.log('Starting refresh...');
  const places = await refreshCacheInBackground(true, 'manual_test');
  console.log(`Refresh finished. Found ${places.length} places.`);
  if (places.length > 0) {
    console.log('Sample place:', places[0].name);
  }
}

testRefresh().catch(console.error);
