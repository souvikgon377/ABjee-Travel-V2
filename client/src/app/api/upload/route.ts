import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { fail } from "@/lib/server/http";

export const runtime = "nodejs";

function readEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeFolder(folderValue: unknown): string {
  const raw = typeof folderValue === "string" ? folderValue : "uploads";
  const cleaned = raw.trim().replace(/^\/+|\/+$/g, "");
  return cleaned || "uploads";
}

function normalizeObjectKey(key: string): string {
  return key.replace(/^\/+/, "");
}

function resolvePublicAssetBaseUrl(): string {
  const rawUrl = readEnv("NEXT_PUBLIC_R2_ASSET_BASE_URL", "R2_PUBLIC_URL");

  if (!rawUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(rawUrl);

    if (parsedUrl.hostname.endsWith("r2.cloudflarestorage.com")) {
      return "";
    }

    return parsedUrl.origin.replace(/\/+$/, "");
  } catch {
    return rawUrl.replace(/\/+$/, "");
  }
}

function sanitizeMetadataValue(value: string): string {
  // S3 metadata headers must be ASCII-safe and cannot contain control chars.
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/[\r\n]/g, " ")
    .trim()
    .slice(0, 240);
}

export async function POST(req: NextRequest) {
  try {
    const r2AccountId = readEnv("R2_ACCOUNT_ID", "NEXT_PUBLIC_R2_ACCOUNT_ID");
    const r2Endpoint = readEnv("R2_ENDPOINT", "NEXT_PUBLIC_R2_ENDPOINT") ||
      (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : "");
    const r2AccessKeyId = readEnv("R2_ACCESS_KEY_ID", "NEXT_PUBLIC_R2_ACCESS_KEY_ID");
    const r2SecretAccessKey = readEnv("R2_SECRET_ACCESS_KEY", "NEXT_PUBLIC_R2_SECRET_ACCESS_KEY");
    const r2BucketName = readEnv("R2_BUCKET_NAME", "NEXT_PUBLIC_R2_BUCKET_NAME") || "abjee-travel-storage";
    const r2PublicUrl = resolvePublicAssetBaseUrl();

    if (!r2Endpoint || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) {
      return fail("R2 is not configured. Please set R2_ACCOUNT_ID/R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.", 500, {
        error: "R2 is not configured. Please set R2_ACCOUNT_ID/R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.",
      });
    }

    if (!r2PublicUrl) {
      return fail(
        "R2 public asset URL is not configured. Set NEXT_PUBLIC_R2_ASSET_BASE_URL or R2_PUBLIC_URL to a public R2 domain or custom CDN domain, not the r2.cloudflarestorage.com API endpoint.",
        500,
        {
          error: "R2 public asset URL is not configured. Set NEXT_PUBLIC_R2_ASSET_BASE_URL or R2_PUBLIC_URL to a public R2 domain or custom CDN domain, not the r2.cloudflarestorage.com API endpoint.",
        },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    const key = form.get("key") as string;
    const folder = normalizeFolder(form.get("folder"));

    if (!(file instanceof File)) {
      return fail("File is required", 400, { error: "File is required" });
    }

    // Get file content
    const buffer = Buffer.from(await file.arrayBuffer());

    // Generate R2 object key if not provided
    const generatedKey = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const objectKey = normalizeObjectKey(key || generatedKey);

    const r2Client = new S3Client({
      region: "auto",
      endpoint: r2Endpoint,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    });

    await r2Client.send(new PutObjectCommand({
      Bucket: r2BucketName,
      Key: objectKey,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
      CacheControl: "public, max-age=31536000",
      Metadata: {
        originalName: sanitizeMetadataValue(file.name || "upload.bin") || "upload.bin",
      },
    }));

    // Construct public URL
    const publicUrl = `${r2PublicUrl}/${objectKey}`;

    const payload = {
      url: publicUrl,
      key: objectKey,
      bytes: buffer.byteLength,
      format: (file.type || "application/octet-stream").split("/")[1] || "unknown",
    };

    // Keep response compatible for both legacy callers (payload.url) and newer callers (payload.data.url).
    return NextResponse.json(
      { success: true, ...payload, data: payload },
      { status: 201 },
    );
  } catch (error: any) {
    if ((process.env.NODE_ENV === "development")) {
      console.error("Upload error:", error);
    }

    const message = error?.message || "R2 upload failed";
    const statusCode =
      typeof error?.$metadata?.httpStatusCode === "number"
        ? error.$metadata.httpStatusCode
        : 500;

    return fail(message, statusCode >= 400 ? statusCode : 500, {
      error: message,
      code: error?.name,
    });
  }
}
