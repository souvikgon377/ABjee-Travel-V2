import { NextResponse } from "next/server";

export const ok = (data: unknown, status = 200) =>
  NextResponse.json({ success: true, data }, { status });

export const fail = (message: string, status = 400, extra?: Record<string, unknown>) =>
  NextResponse.json({ success: false, message, ...(extra || {}) }, { status });

/**
 * Add Cache-Control headers to a response.
 * @param response The NextResponse object
 * @param maxAge Seconds to cache publicly (default 60)
 * @param swrAge Seconds for stale-while-revalidate (default 300)
 */
export const withCacheHeaders = (
  response: NextResponse, 
  maxAge: number = 60, 
  swrAge: number = 300
) => {
  response.headers.set(
    "Cache-Control", 
    `public, s-maxage=${maxAge}, stale-while-revalidate=${swrAge}`
  );
  return response;
};
