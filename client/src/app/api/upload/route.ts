import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const r2Endpoint = process.env.R2_ENDPOINT;
    const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
    const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const r2BucketName = process.env.R2_BUCKET_NAME || 'abjee-travel-storage';
    const r2PublicUrl = process.env.R2_PUBLIC_URL;

    if (!r2Endpoint || !r2AccessKeyId || !r2SecretAccessKey) {
      return fail("R2 is not configured. Please check your environment variables.", 500);
    }

    const form = await req.formData();
    const file = form.get("file");
    const key = form.get("key") as string;
    const folder = form.get("folder") || "uploads";

    if (!(file instanceof File)) {
      return fail("File is required", 400);
    }

    // Get file content
    const buffer = await file.arrayBuffer();

    // Generate R2 object key if not provided
    const objectKey = key || `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Prepare S3 compatible request using AWS Signature V4
    // Using S3 API compatible endpoint
    const url = new URL(r2Endpoint || `https://${r2BucketName}.r2.cloudflarestorage.com`);
    url.pathname = `/${objectKey}`;

    // Create S3 compatible headers
    const headers: Record<string, string> = {
      'Content-Type': file.type || 'application/octet-stream',
      'Content-Length': buffer.byteLength.toString(),
    };

    // Simple PUT request to R2 (requires S3 compatible authentication)
    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers,
      body: buffer,
    }).catch(async (err) => {
      if ((process.env.NODE_ENV === "development")) {
        console.error('R2 upload fetch error:', err);
      }
      return new Response(JSON.stringify({ error: 'Network error' }), { status: 500 });
    });

    if (!response.ok) {
      const text = await response.text();
      if ((process.env.NODE_ENV === "development")) {
        console.error('R2 upload error:', response.status, text);
      }
      return fail(`R2 upload failed: ${text}`, response.status || 400);
    }

    // Construct public URL
    const publicUrl = r2PublicUrl 
      ? `${r2PublicUrl}/${objectKey}`
      : `https://${r2BucketName}.r2.cloudflarestorage.com/${objectKey}`;

    return ok({
      url: publicUrl,
      key: objectKey,
      bytes: buffer.byteLength,
      format: file.type.split('/')[1] || 'unknown',
    }, 201);
  } catch (error: any) {
    if ((process.env.NODE_ENV === "development")) {
      console.error('Upload error:', error);
    }
    return fail(error?.message || "R2 upload failed", 500);
  }
}
