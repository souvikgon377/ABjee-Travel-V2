/**
 * 🖼️ R2 IMAGE UPLOAD UTILITY WITH SHA-256 HASHING
 * 
 * WHY: Upload images to Cloudflare R2 with deduplication using SHA-256 hashing
 * DECISION: Hash images before upload to prevent duplicates and verify integrity
 */

// ==================== INTERFACES ====================

export interface ImageUploadResult {
  url: string;
  key: string;
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
  maxSizeBytes?: number;
  allowedFormats?: string[];
  convertToWebP?: boolean;
  webpQuality?: number;
  maxImageDimension?: number;
}

// ==================== CONFIGURATION ====================

const R2_ENDPOINT = process.env.NEXT_PUBLIC_R2_ENDPOINT;
const R2_BUCKET_NAME = process.env.NEXT_PUBLIC_R2_BUCKET_NAME || 'abjee-travel-storage';
const _R2_ACCOUNT_ID = process.env.NEXT_PUBLIC_R2_ACCOUNT_ID;

const DEFAULT_OPTIONS: ImageUploadOptions = {
  folder: 'chat-rooms',
  maxSizeBytes: 5 * 1024 * 1024, // 5MB
  allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  convertToWebP: false,
  webpQuality: 0.82,
};

function clampQuality(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.82;
  return Math.min(0.95, Math.max(0.45, value));
}

function canvasToWebPBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode image as WebP'));
          return;
        }
        resolve(blob);
      },
      'image/webp',
      quality,
    );
  });
}

async function convertImageToWebP(file: File, options: ImageUploadOptions): Promise<File> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image for compression'));
      image.src = objectUrl;
    });

    let width = img.naturalWidth;
    let height = img.naturalHeight;
    const maxDimension = options.maxImageDimension;
    if (typeof maxDimension === 'number' && maxDimension > 0) {
      const largestSide = Math.max(width, height);
      if (largestSide > maxDimension) {
        const scale = maxDimension / largestSide;
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to initialize canvas for image compression');
    }

    ctx.drawImage(img, 0, 0, width, height);

    const maxSize = options.maxSizeBytes || DEFAULT_OPTIONS.maxSizeBytes!;
    let quality = clampQuality(options.webpQuality);
    let blob = await canvasToWebPBlob(canvas, quality);

    // Step quality down to satisfy max upload size when possible.
    for (let i = 0; i < 6 && blob.size > maxSize && quality > 0.5; i++) {
      quality = Math.max(0.45, quality - 0.08);
      blob = await canvasToWebPBlob(canvas, quality);
    }

    const originalName = file.name.replace(/\.[^/.]+$/, '');
    return new File([blob], `${originalName}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

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
 * WHY: Get image dimensions from file
 * DECISION: Use Image API to extract width and height
 */
async function getImageDimensions(file: File): Promise<{ width: number; height: number; format: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const format = file.type.split('/')[1] || 'unknown';
        resolve({ width: img.width, height: img.height, format });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
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
 * WHY: Upload image to R2 with SHA-256 hash for deduplication
 * DECISION: 
 * - Hash file before upload to identify duplicates
 * - Use server-side API for security
 * - Store hash in metadata for future verification
 * - Return comprehensive metadata for database storage
 */
export async function uploadImageToR2(
  file: File, 
  options: ImageUploadOptions = {}
): Promise<ImageUploadResult> {
  
  // Check if R2 is configured
  if (!R2_ENDPOINT || !R2_BUCKET_NAME) {
    throw new Error('R2 is not configured. Please check your environment variables.');
  }
  
  // Merge options with defaults
  const uploadOptions = { ...DEFAULT_OPTIONS, ...options };

  // Convert to WebP before validating size so oversized originals can still be optimized.
  const uploadFile = uploadOptions.convertToWebP
    ? await convertImageToWebP(file, uploadOptions)
    : file;
  
  // Validate file
  validateFile(uploadFile, uploadOptions);
  
  // Calculate SHA-256 hash
  const hash = await calculateSHA256(uploadFile);
  
  // Get image dimensions
  const dimensions = await getImageDimensions(uploadFile);
  
  // Generate unique key with timestamp
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const fileExtension = uploadFile.name.split('.').pop()?.toLowerCase() || 'jpg';
  const folder = uploadOptions.folder || DEFAULT_OPTIONS.folder!;
  const key = `${folder}/${timestamp}-${randomId}.${fileExtension}`;
  
  // Prepare form data
  const formData = new FormData();
  formData.append('file', uploadFile);
  formData.append('key', key);
  formData.append('hash', hash);
  
  try {
    // Upload to server endpoint which handles R2 upload
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      
      if ((process.env.NODE_ENV === "development")) {
        console.error('R2 upload error:', error);
      }
      
      throw new Error(error.error || 'Failed to upload image. Please try again.');
    }
    
    const data = await response.json();
    
    // Return structured result
    return {
      url: data.url,
      key: data.key,
      publicId: data.key,
      hash: hash,
      width: dimensions.width,
      height: dimensions.height,
      format: dimensions.format,
      bytes: uploadFile.size,
      createdAt: new Date().toISOString()
    };
    
  } catch (error: any) {
    console.error('Image upload error:', error);
    throw new Error(`Failed to upload image: ${error.message}`);
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
    const result = await uploadImageToR2(files[i], options);
    results.push(result);
    
    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }
  
  return results;
}

/**
 * WHY: Delete image from R2
 * NOTE: This requires backend implementation with R2 credentials
 */
export async function deleteImageFromR2(_key: string): Promise<void> {
  // TODO: Implement backend API call to delete image from R2
  // This requires R2 API token and must be done server-side
  // const response = await fetch(`/api/upload`, { method: 'DELETE', body: JSON.stringify({ key }) });
  if ((process.env.NODE_ENV === "development")) {
    console.warn('Image deletion must be implemented on backend');
  }
  throw new Error('Image deletion is not yet implemented');
}
