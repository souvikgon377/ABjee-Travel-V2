/**
 * 🖼️ IMAGE UPLOAD UTILITY WITH SHA-256 HASHING
 * 
 * WHY: Upload images to Cloudinary with deduplication using SHA-256 hashing
 * DECISION: Hash images before upload to prevent duplicates and verify integrity
 */

// ==================== INTERFACES ====================

export interface ImageUploadResult {
  url: string;
  publicId: string;
  hash: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  createdAt: string;
}

export interface ImageUploadOptions {
  folder?: string;
  transformation?: string;
  maxSizeBytes?: number;
  allowedFormats?: string[];
}

// ==================== CONFIGURATION ====================

const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'ml_default'; // Fallback to default

const DEFAULT_OPTIONS: ImageUploadOptions = {
  folder: 'chat-rooms',
  maxSizeBytes: 5 * 1024 * 1024, // 5MB
  allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif']
};

// ==================== HELPER FUNCTIONS ====================

/**
 * WHY: Calculate SHA-256 hash of file to uniquely identify it
 * DECISION: Use Web Crypto API for secure, browser-native hashing
 */
async function calculateSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * WHY: Validate file before upload to prevent errors
 * DECISION: Check size, format, and validity
 */
function validateFile(file: File, options: ImageUploadOptions): void {
  // Check if file exists
  if (!file) {
    throw new Error('No file provided');
  }

  // Check file size
  const maxSize = options.maxSizeBytes || DEFAULT_OPTIONS.maxSizeBytes!;
  if (file.size > maxSize) {
    throw new Error(`File size exceeds maximum of ${maxSize / (1024 * 1024)}MB`);
  }

  // Check file format
  const allowedFormats = options.allowedFormats || DEFAULT_OPTIONS.allowedFormats!;
  const fileExtension = file.name.split('.').pop()?.toLowerCase();
  if (!fileExtension || !allowedFormats.includes(fileExtension)) {
    throw new Error(`File format must be one of: ${allowedFormats.join(', ')}`);
  }

  // Check MIME type
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }
}

/**
 * WHY: Create a preview URL for the image before upload
 * DECISION: Use URL.createObjectURL for instant preview
 */
export function createImagePreview(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * WHY: Clean up preview URLs to prevent memory leaks
 * DECISION: Revoke object URLs when no longer needed
 */
export function revokeImagePreview(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

// ==================== MAIN UPLOAD FUNCTION ====================

/**
 * WHY: Upload image to Cloudinary with SHA-256 hash for deduplication
 * DECISION: 
 * - Hash file before upload to identify duplicates
 * - Use unsigned upload with preset for security
 * - Store hash in metadata for future verification
 * - Return comprehensive metadata for database storage
 */
export async function uploadImageToCloudinary(
  file: File, 
  options: ImageUploadOptions = {}
): Promise<ImageUploadResult> {
  // Merge options with defaults
  const uploadOptions = { ...DEFAULT_OPTIONS, ...options };

  // Validate file
  validateFile(file, uploadOptions);

  // Calculate SHA-256 hash
  const hash = await calculateSHA256(file);

  // If Cloudinary is configured, use the legacy Cloudinary flow
  if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY) {
    // Prepare form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);

    // Add folder if specified
    if (uploadOptions.folder) {
      formData.append('folder', uploadOptions.folder);
    }

    // Add SHA-256 hash to metadata for verification and deduplication
    formData.append('context', `sha256=${hash}`);

    // Add tags for organization
    formData.append('tags', 'chat-room,user-upload');

    try {
      // Upload to Cloudinary
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: 'POST',
          body: formData
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));

        if ((process.env.NODE_ENV === 'development')) {
          console.error('Cloudinary upload error:', error);
        }

        // Provide user-friendly error message
        if (error.error?.message?.includes('Upload preset') || error.error?.message?.includes('preset')) {
          throw new Error('Upload configuration error. Please contact support or try again later.');
        }

        throw new Error(error.error?.message || 'Failed to upload image. Please try again.');
      }

      const data = await response.json();

      // Return structured result
      return {
        url: data.secure_url,
        publicId: data.public_id,
        hash: hash,
        width: data.width,
        height: data.height,
        format: data.format,
        bytes: data.bytes,
        createdAt: data.created_at
      };
    } catch (error: any) {
      console.error('Image upload error:', error);
      throw new Error(`Failed to upload image: ${error?.message || String(error)}`);
    }
  }

  // Cloudinary not configured — fallback to R2 server upload endpoint
  try {
    // Compute image dimensions before upload
    const { width, height } = await (async () => {
      return new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image();
        img.onload = () => {
          resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
        };
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = URL.createObjectURL(file);
      });
    })();

    const formData = new FormData();
    formData.append('file', file);
    if (uploadOptions.folder) formData.append('folder', uploadOptions.folder);

    // Optionally provide a deterministic key using the hash
    const key = `${uploadOptions.folder || 'uploads'}/${hash}-${Date.now()}`;
    formData.append('key', key);

    const resp = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body?.error || body?.message || 'R2 upload failed');
    }

    const payload = await resp.json();

    // Normalize response to ImageUploadResult
    const now = new Date().toISOString();
    return {
      url: payload?.url || payload?.data?.url || '',
      publicId: payload?.key || payload?.data?.key || key,
      hash,
      width: width || 0,
      height: height || 0,
      format: payload?.format || payload?.data?.format || (file.type.split('/')[1] || 'unknown'),
      bytes: payload?.bytes || payload?.data?.bytes || (file.size || 0),
      createdAt: now,
    };
  } catch (error: any) {
    console.error('R2 upload error:', error);
    throw new Error(`Failed to upload image to R2: ${error?.message || String(error)}`);
  }
}

/**
 * WHY: Helper to check if an image with same hash already exists
 * DECISION: Use hash comparison to detect duplicates
 * NOTE: This requires backend API to search by hash in database
 */
export async function checkImageDuplicate(_hash: string): Promise<boolean> {
  try {
    // TODO: Implement backend API call to check if hash exists
    // const response = await fetch(`/api/images/check-duplicate/${hash}`);
    // return response.ok;
    return false;
  } catch (error) {
    if ((process.env.NODE_ENV === "development")) {
      console.error('Duplicate check error:', error);
    }
    return false;
  }
}

/**
 * WHY: Upload multiple images with progress tracking
 * DECISION: Upload sequentially to avoid rate limits and provide progress
 */
export async function uploadMultipleImages(
  files: File[],
  options: ImageUploadOptions = {},
  onProgress?: (current: number, total: number) => void
): Promise<ImageUploadResult[]> {
  
  const results: ImageUploadResult[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const result = await uploadImageToCloudinary(files[i], options);
    results.push(result);
    
    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }
  
  return results;
}

/**
 * WHY: Delete image from Cloudinary
 * NOTE: This requires backend implementation with API secret
 */
export async function deleteImageFromCloudinary(_publicId: string): Promise<void> {
  // TODO: Implement backend API call to delete image
  // This requires API secret and must be done server-side
  // const response = await fetch(`/api/images/delete/${publicId}`, { method: 'DELETE' });
  if ((process.env.NODE_ENV === "development")) {
    console.warn('Image deletion must be implemented on backend');
  }
  throw new Error('Image deletion is not yet implemented');
}

