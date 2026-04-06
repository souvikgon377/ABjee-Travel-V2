import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import HomePage from '@/screens/HomePage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export default async function HomeRoute() {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get('host');
    const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';

    const settingsResponse = await fetch(new URL('/api/public/settings', `${protocol}://${host}`), {
      cache: 'no-store',
    });

    const settingsPayload = await settingsResponse.json().catch(() => null);
    const homePageEnabled = settingsPayload?.success ? settingsPayload?.data?.homePageEnabled : true;

    if (homePageEnabled === false) {
      redirect('/chat');
    }
  } catch (error) {
    // Re-throw Next.js redirect errors - check for digest which is how Next.js marks redirects
    if ((error as any)?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    // Fail open if the setting cannot be read.
  }

  return <HomePage />;
}
