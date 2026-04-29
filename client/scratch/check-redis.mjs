import { resolveRedisRestConfig } from './src/lib/server/redis.js';
import dotenv from 'dotenv';
dotenv.config();

const { url: REDIS_URL, token: REDIS_TOKEN } = resolveRedisRestConfig();

async function check() {
  const response = await fetch(`${REDIS_URL}/scard/idx:test:all_ids`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const data = await response.json();
  console.log('Redis SCARD idx:test:all_ids:', data.result);
}
check();
