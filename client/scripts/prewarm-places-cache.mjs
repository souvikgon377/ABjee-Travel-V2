const baseUrl = (process.env.PREWARM_BASE_URL || '').trim();
const bearerToken = (process.env.PREWARM_ADMIN_BEARER || '').trim();

if (!baseUrl) {
  console.error('[Prewarm] Missing PREWARM_BASE_URL');
  process.exit(1);
}

if (!bearerToken) {
  console.error('[Prewarm] Missing PREWARM_ADMIN_BEARER');
  process.exit(1);
}

const target = `${baseUrl.replace(/\/$/, '')}/api/update-cache`;

try {
  const response = await fetch(target, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearerToken}`,
      'content-type': 'application/json',
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('[Prewarm] Failed:', response.status, payload);
    process.exit(1);
  }

  console.log('[Prewarm] CACHE UPDATED', payload);
} catch (error) {
  console.error('[Prewarm] Request failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
