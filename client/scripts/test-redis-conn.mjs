import dotenv from 'dotenv';
import axios from 'axios';

// Load local .env from client/ folder
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;

if (!REDIS_URL || !REDIS_TOKEN) {
  console.error('[test-redis] Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in .env');
  process.exit(2);
}

(async () => {
  try {
    console.log('[test-redis] Testing connectivity to Upstash REST at', REDIS_URL);
    const key = `healthcheck-${Date.now()}`;

    // Try SET then GET to confirm read/write
    const setRes = await axios.post(`${REDIS_URL}/set/${encodeURIComponent(key)}`, { value: 'ok' }, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      timeout: 10000,
    });
    console.log('[test-redis] SET response status:', setRes.status, 'data:', setRes.data);

    const getRes = await axios.get(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      timeout: 10000,
    });
    console.log('[test-redis] GET response status:', getRes.status, 'data:', getRes.data);

    // Cleanup: DEL
    try {
      const delRes = await axios.post(`${REDIS_URL}/del/${encodeURIComponent(key)}`, {}, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
        timeout: 10000,
      });
      console.log('[test-redis] DEL response status:', delRes.status, 'data:', delRes.data);
    } catch (e) {
      console.warn('[test-redis] Cleanup DEL failed:', e?.message || e);
    }

    console.log('[test-redis] Upstash connectivity looks good.');
    process.exit(0);
  } catch (error) {
    console.error('[test-redis] Connectivity test failed:', error?.response?.status, error?.response?.data || error?.message || error);
    process.exit(1);
  }
})();
