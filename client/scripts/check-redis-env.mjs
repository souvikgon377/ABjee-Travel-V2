import fs from 'node:fs';

const envPath = 'd:/Projects/Abjee Next/AbJee-Travel/client/.env';

function parseEnv(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;

    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }
  return out;
}

async function main() {
  if (!fs.existsSync(envPath)) {
    console.log('REDIS_CHECK: .env file missing');
    process.exit(1);
  }

  const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
  const redisUrl = (env.UPSTASH_REDIS_REST_URL || env.REDIS_REST_URL || '').replace(/\/$/, '');
  const redisToken = env.UPSTASH_REDIS_REST_TOKEN || env.REDIS_REST_TOKEN || '';

  console.log(`REDIS_CHECK: URL set = ${Boolean(redisUrl)}`);
  console.log(`REDIS_CHECK: TOKEN set = ${Boolean(redisToken)}`);

  if (!redisUrl || !redisToken) {
    console.log('REDIS_CHECK: Missing Redis URL/token in .env');
    process.exit(1);
  }

  try {
    const response = await fetch(`${redisUrl}/ping`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.log(`REDIS_CHECK: Ping failed with status ${response.status}`);
      process.exit(1);
    }

    const payloadText = await response.text();
    console.log('REDIS_CHECK: Ping succeeded');
    console.log(`REDIS_CHECK: Raw response = ${payloadText}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`REDIS_CHECK: Ping failed - ${message}`);
    process.exit(1);
  }
}

void main();
