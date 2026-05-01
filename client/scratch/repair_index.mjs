import nextEnv from '@next/env';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Redis } from '@upstash/redis';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const getServiceAccount = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: String(parsed.private_key).replace(/\\n/g, '\n'),
    };
  }

  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
};

const serviceAccount = getServiceAccount();
if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });
}

const db = getFirestore();
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function compress(data) {
  const buf = Buffer.from(JSON.stringify(data));
  const compressed = await gzip(buf);
  return compressed.toString('base64');
}

function normalize(str = '') {
  return String(str).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildMinimal(p) {
  const id = p.id || p.Id || p._id || (p.name && p.area ? `tp_${normalize(p.name + p.area)}` : null);
  if (!id) return null;

  return {
    id: String(id),
    name: p.name || p.Name || 'Unnamed',
    city: p.city || p.City || p.area || p.Area || 'Unknown',
    state: p.state || p.State || 'Unknown',
    country: p.country || p.Country || 'India',
    category: p.category || p.Category || 'Other',
    coverImage: p.coverImage || p.image || '',
    mediaCount: Array.isArray(p.media) ? p.media.length : (p.mediaCount || 0),
    media: p.media || [],
    extraInfo: p.extraInfo || [],
    description: p.description || p.Description || '',
    updatedAt: p.updatedAt || Date.now()
  };
}

async function repair() {
  console.log('--- REPAIR START ---');
  const snapshot = await db.collection('touristPlaces').get();
  console.log(`Loaded ${snapshot.size} places from Firestore.`);
  
  const places = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const minBatch = places.map(buildMinimal).filter(p => p !== null);
  console.log(`Minimal build finished: ${minBatch.length} items.`);

  const SHARD_SIZE = 500;
  const shardCount = Math.ceil(minBatch.length / SHARD_SIZE);
  console.log(`Creating ${shardCount} shards...`);

  for (let i = 0; i < shardCount; i++) {
    const shardData = minBatch.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE);
    const compressed = await compress(shardData);
    console.log(`Uploading shard ${i} (${shardData.length} items)...`);
    await redis.set(`places:min:shard:${i}`, compressed);
  }

  const newVersion = String(Date.now());
  console.log(`Finalizing version: ${newVersion}`);
  const multi = redis.multi();
  multi.set('places:min:shards', String(shardCount));
  multi.set('places:version', newVersion);
  await multi.exec();

  console.log('--- REPAIR SUCCESS ---');
}

repair().catch(console.error);
