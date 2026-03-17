import { NextResponse } from "next/server";

export const ok = (data: unknown, status = 200) =>
  NextResponse.json({ success: true, data }, { status });

export const fail = (message: string, status = 400, extra?: Record<string, unknown>) =>
  NextResponse.json({ success: false, message, ...(extra || {}) }, { status });
