import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { GET } = await import('../src/app/api/admin/search-health/route.ts');

async function testHealth() {
  console.log('Fetching Search Health...');
  const res = await GET();
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

testHealth().catch(console.error);
