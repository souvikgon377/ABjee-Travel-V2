import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

async function seedOnce() {
  const isExport = process.argv.includes('--export');
  
  const result = await esbuild.build({
    entryPoints: [path.join(rootDir, 'src/lib/server/touristSearchUtils.ts'), path.join(rootDir, 'src/lib/server/sharedPlacesCache.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    outdir: 'out',
    external: ['ioredis', '@upstash/redis', 'crypto', 'fs', 'path', 'firebase-admin'],
  });

  const utilsCode = result.outputFiles.find(f => f.path.includes('touristSearchUtils')).text;
  const cacheCode = result.outputFiles.find(f => f.path.includes('sharedPlacesCache')).text;
  
  const moduleCache = { exports: {} };
  new Function('exports', 'require', 'module', cacheCode)(moduleCache.exports, require, moduleCache);
  
  const utilsModule = { exports: {} };
  new Function('exports', 'require', 'module', utilsCode)(utilsModule.exports, require, utilsModule);

  const { getSharedPlacesCache } = moduleCache.exports;
  const { upsertPlaceIndex } = utilsModule.exports;

  console.log('Loading places from cache...');
  const cache = await getSharedPlacesCache('rebuild-script');
  const places = cache.places || [];

  if (places.length === 0) {
    console.error('No places found.');
    process.exit(1);
  }

  console.log(`Found ${places.length} places. Beginning block seed_once (up to 15 tokens/place, no prefix index)...`);

  let count = 0;
  // Upsert sequentially since pipeline is internal to upsertPlaceIndex
  for (const place of places) {
    await upsertPlaceIndex(place);
    count++;
    if (count % 50 === 0) console.log(`Seeded ${count} places...`);
  }

  console.log(`Successfully completed seed_once of ${count} places into Incremental Index.`);
  process.exit(0);
}

seedOnce().catch(err => {
    console.error(err);
    process.exit(1);
});
