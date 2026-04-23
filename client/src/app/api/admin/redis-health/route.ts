import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { resolveRedisRestConfig } from '@/lib/server/redis';

export const runtime = 'nodejs';

const { url: REDIS_URL, token: REDIS_TOKEN } = resolveRedisRestConfig();
const REDIS_SOURCE = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_ioURL
  ? 'upstash'
  : process.env.REDIS_REST_URL
    ? 'redis_rest'
    : 'none';

const redisRequest = async (command: string, args: Array<string | number>) => {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Redis env vars are missing');
  }

  const endpoint = `${REDIS_URL.replace(/\/$/, '')}/${command}/${args.map((arg) => encodeURIComponent(String(arg))).join('/')}`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
    },
    cache: 'no-store',
  });

  const payloadText = await response.text();
  let payload: { result?: unknown; error?: unknown } = {};

  try {
    payload = payloadText ? (JSON.parse(payloadText) as { result?: unknown; error?: unknown }) : {};
  } catch {
    payload = { error: payloadText };
  }

  if (!response.ok) {
    throw new Error(`Redis ${command} failed: status ${response.status}`);
  }

  return payload;
};

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const env = {
      redisUrlSet: Boolean(REDIS_URL),
      redisTokenSet: Boolean(REDIS_TOKEN),
      source: REDIS_SOURCE,
    };

    if (!REDIS_URL || !REDIS_TOKEN) {
      return ok({
        env,
        ping: {
          ok: false,
          error: 'Redis URL/token is missing',
        },
        cacheRoundTrip: {
          ok: false,
          error: 'Skipped because Redis URL/token is missing',
        },
      });
    }

    const pingStartedAt = Date.now();
    const pingPayload = await redisRequest('ping', []);
    const pingLatencyMs = Date.now() - pingStartedAt;

    const healthKey = `redis:health:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const expectedValue = JSON.stringify({
      source: 'admin-redis-health',
      timestamp: new Date().toISOString(),
    });

    const setPayload = await redisRequest('setex', [healthKey, 60, expectedValue]);
    const getPayload = await redisRequest('get', [healthKey]);
    await redisRequest('del', [healthKey]);

    const rawValue = typeof getPayload?.result === 'string' ? getPayload.result : '';
    const cacheMatches = rawValue === expectedValue;

    return ok({
      env,
      ping: {
        ok: true,
        result: pingPayload?.result ?? null,
        latencyMs: pingLatencyMs,
      },
      cacheRoundTrip: {
        ok: cacheMatches,
        setResult: setPayload?.result ?? null,
        getReturnedString: typeof getPayload?.result === 'string',
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    const message = error instanceof Error ? error.message : 'Unknown Redis health error';
    return fail('Failed to run Redis health check', 500, {
      detail: message,
    });
  }
}
