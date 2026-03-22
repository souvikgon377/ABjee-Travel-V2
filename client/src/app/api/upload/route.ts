import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      return fail("Cloudinary is not configured", 500);
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return fail("File is required", 400);
    }

    const mimeType = file.type || "";
    const resourceType = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("video/")
        ? "video"
        : "raw";

    const payload = new FormData();
    payload.append("file", file);
    payload.append("upload_preset", uploadPreset);
    payload.append("folder", String(form.get("folder") || "chat-rooms"));

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
      method: "POST",
      body: payload,
    });

    if (!response.ok) {
      const err = await response.json().catch(async () => ({ raw: await response.text() }));
      const message = err?.error?.message || err?.message || err?.raw || "Cloudinary upload failed";
      return fail(`Cloudinary upload failed: ${message}`, 400);
    }

    const data = await response.json();
    return ok({
      url: data.secure_url,
      publicId: data.public_id,
      width: data.width,
      height: data.height,
      bytes: data.bytes,
      format: data.format,
      createdAt: data.created_at,
    }, 201);
  } catch (error: any) {
    return fail(error?.message || "Upload failed", 500);
  }
}
