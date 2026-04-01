import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const PROJECT_ROOT = process.cwd();
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.webm', '.mov', '.avi', '.m4v']);

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const idx = line.indexOf('=');
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function contentTypeFor(ext) {
  switch (ext.toLowerCase()) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.mp4': return 'video/mp4';
    case '.webm': return 'video/webm';
    case '.mov': return 'video/quicktime';
    case '.avi': return 'video/x-msvideo';
    case '.m4v': return 'video/x-m4v';
    default: return 'application/octet-stream';
  }
}

function walkMediaFiles(dir) {
  const found = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkMediaFiles(fullPath));
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!ASSET_EXTENSIONS.has(ext)) continue;

    const rel = path.relative(PUBLIC_DIR, fullPath).split(path.sep).join('/');
    found.push({ fullPath, rel, ext });
  }

  return found;
}

loadEnvFromFile(path.join(PROJECT_ROOT, '.env.local'));
loadEnvFromFile(path.join(PROJECT_ROOT, '.env'));

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const publicBaseUrl = (process.env.NEXT_PUBLIC_R2_ASSET_BASE_URL || '').replace(/\/+$/, '');

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  console.error('Missing required R2 env vars. Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME');
  process.exit(1);
}

if (!fs.existsSync(PUBLIC_DIR)) {
  console.error(`Public directory not found: ${PUBLIC_DIR}`);
  process.exit(1);
}

const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

const files = walkMediaFiles(PUBLIC_DIR);
if (files.length === 0) {
  console.log('No image/video files found in public/.');
  process.exit(0);
}

console.log(`Uploading ${files.length} media files from public/ to R2 bucket ${bucketName}...`);

for (const file of files) {
  const body = fs.readFileSync(file.fullPath);
  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: file.rel,
    Body: body,
    ContentType: contentTypeFor(file.ext),
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  if (publicBaseUrl) {
    console.log(`uploaded: ${file.rel} -> ${publicBaseUrl}/${file.rel}`);
  } else {
    console.log(`uploaded: ${file.rel}`);
  }
}

console.log('R2 upload completed successfully.');
