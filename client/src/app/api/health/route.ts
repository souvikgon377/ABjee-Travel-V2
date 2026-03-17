import { ok } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET() {
  return ok({
    status: "OK",
    message: "ABjee Travel API is running",
    timestamp: new Date().toISOString(),
  });
}
