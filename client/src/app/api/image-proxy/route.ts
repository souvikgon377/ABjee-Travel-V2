import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUrl = searchParams.get('url');

    if (!rawUrl || !rawUrl.trim()) {
      return NextResponse.json({ error: 'Missing url query parameter' }, { status: 400 });
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
    }

    if (!ALLOWED_PROTOCOLS.has(targetUrl.protocol)) {
      return NextResponse.json({ error: 'Only http/https URLs are allowed' }, { status: 400 });
    }

    const upstream = await fetch(targetUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        // A normal browser UA prevents some CDNs from rejecting the request.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream fetch failed with status ${upstream.status}` },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const bytes = await upstream.arrayBuffer();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to proxy image' },
      { status: 500 },
    );
  }
}
