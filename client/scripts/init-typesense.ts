import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeTypesense, healthCheckTypesense } from '../src/modules/search/typesenseClient';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Load .env file
dotenv.config({ path: path.join(rootDir, '.env') });

async function run() {
  console.log('🚀 Starting Typesense Initialization...\n');
  const startTime = Date.now();

  try {
    // 1. Health check: ensure Typesense is reachable
    console.log(`📡 Checking Typesense connectivity at ${process.env.TYPESENSE_HOST || 'localhost'}:${process.env.TYPESENSE_PORT || 8108}...`);
    const isHealthy = await healthCheckTypesense(10_000);
    
    if (!isHealthy) {
      throw new Error(
        `Typesense is not reachable. Make sure it's running at ${process.env.TYPESENSE_HOST || 'localhost'}:${process.env.TYPESENSE_PORT || 8108}. ` +
        `Start with: docker run -p 8108:8108 -p 8107:8107 typesense/typesense:latest --data-dir=/data --api-key=xyz --enable-cors`
      );
    }
    console.log(`✅ Typesense is healthy\n`);

    // 2. Initialize collections
    console.log('📝 Initializing collections...');
    const results = await initializeTypesense();

    // 3. Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Typesense initialization complete in ${duration}s`);
    console.log(`📊 Summary:`);
    results.forEach((r) => {
      const icon = r.status === 'created' ? '✨' : r.status === 'updated' ? '🔄' : r.status === 'exists' ? '✅' : '❌';
      console.log(`   ${icon} ${r.name}: ${r.status}${r.message ? ` (${r.message})` : ''}`);
    });

    process.exit(0);
  } catch (err: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`\n❌ Typesense initialization failed after ${duration}s:`);
    console.error(`   ${err.message}`);
    console.error(`\n💡 Troubleshooting Tips:`);
    console.error(`   1. Ensure Typesense is running: docker run -p 8108:8108 -p 8107:8107 typesense/typesense:latest --data-dir=/data --api-key=xyz --enable-cors`);
    console.error(`   2. Check .env file has TYPESENSE_HOST, TYPESENSE_PORT, TYPESENSE_PROTOCOL, TYPESENSE_API_KEY`);
    console.error(`   3. Verify firewall/network: curl http://localhost:8108/health`);
    console.error(`\n${err.stack}`);
    process.exit(1);
  }
}

run();
