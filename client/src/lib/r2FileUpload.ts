/**
 * 📎 R2 FILE UPLOAD UTILITY FOR CHAT ATTACHMENTS
 * 
 * WHY: Upload various file types (documents, audio, video) to Cloudflare R2
 * DECISION: Support multiple file types for chat attachments
 */

import type { MessageAttachment } from './chatService';

// ==================== INTERFACES ====================

export interface FileUploadOptions {
  folder?: string;
  maxSizeBytes?: number;
  isVoiceMessage?: boolean;
}

// ==================== CONFIGURATION ====================

const _R2_BUCKET_NAME = process.env.NEXT_PUBLIC_R2_BUCKET_NAME || 'abjee-travel-storage';

const DEFAULT_OPTIONS: FileUploadOptions = {
  folder: 'chat-attachments',
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
};

// ==================== FILE TYPE DETECTION ====================

function getAttachmentType(mimeType: string): MessageAttachment['type'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) {
    // Voice messages will be specifically marked
    return 'audio';
  }
  return 'document';
}

// ==================== VALIDATION ====================

function validateFile(file: File, options: FileUploadOptions): void {
  if (!file) {
    throw new Error('No file provided');
  }

  const maxSize = options.maxSizeBytes || DEFAULT_OPTIONS.maxSizeBytes!;
  if (file.size > maxSize) {
    throw new Error(`File size exceeds maximum of ${Math.round(maxSize / (1024 * 1024))}MB`);
  }

  if (file.size === 0) {
    throw new Error('File is empty');
  }
}

/**
 * Compress an image file to stay under a target size.
 * Uses canvas + JPEG re-encoding with iterative quality reduction.
 */
export async function compressImageFile(
  file: File,
  options: { maxSizeBytes?: number; maxDimension?: number } = {}
): Promise<File> {
  const targetMax = options.maxSizeBytes ?? 1024 * 1024;
  const maxDimension = options.maxDimension ?? 1600;

  if (!file.type.startsWith('image/')) {
    return file;
  }

  if (file.size <= targetMax) {
    return file;
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image for compression'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = dataUrl;
  });

  let width = image.width;
  let height = image.height;

  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.round((height / width) * maxDimension);
      width = maxDimension;
    } else {
      width = Math.round((width / height) * maxDimension);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(image, 0, 0, width, height);

  let quality = 0.9;
  let blob: Blob | null = null;
  while (quality >= 0.4) {
    // eslint-disable-next-line no-await-in-loop
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });

    if (blob && blob.size <= targetMax) {
      const baseName = file.name.replace(/\.[^.]+$/, '');
      return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
    }

    quality -= 0.1;
  }

  if (blob) {
    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  }

  return file;
}

// ==================== UPLOAD FUNCTION ====================

/**
 * Upload any file type to R2
 */
export async function uploadFileToR2(
  file: File,
  options: FileUploadOptions = {}
): Promise<MessageAttachment> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  
  // Validate file
  validateFile(file, mergedOptions);

  // Create form data
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', mergedOptions.folder || 'chat-attachments');
  
  try {
    // Upload to server endpoint which handles R2 upload
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error?.message || error.error || 'Failed to upload file');
    }

    const result = await response.json();

    // Determine attachment type
    let attachmentType = getAttachmentType(file.type);
    if (options.isVoiceMessage) {
      attachmentType = 'voice';
    }

    // Return MessageAttachment
    const attachment: MessageAttachment = {
      type: attachmentType,
      url: result.url,
      publicId: result.key,
      name: file.name,
      size: file.size,
      mimeType: file.type,
    };

    // Add duration for audio/video if available
    if (result.duration) {
      attachment.duration = result.duration;
    }

    return attachment;
  } catch (error: any) {
    console.error('File upload error:', error);
    throw error;
  }
}

// ==================== VOICE RECORDING ====================

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async startRecording(): Promise<void> {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create media recorder
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.audioChunks = [];

      // Collect audio data
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Start recording
      this.mediaRecorder.start();
    } catch {
      throw new Error('Failed to access microphone. Please grant permission.');
    }
  }

  async stopRecording(): Promise<File> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        // Create blob from chunks
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        // Create file from blob
        const timestamp = Date.now();
        const file = new File([audioBlob], `voice-${timestamp}.webm`, { type: 'audio/webm' });
        
        // Clean up
        this.audioChunks = [];
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
        }

        resolve(file);
      };

      this.mediaRecorder.stop();
    });
  }
}

// ==================== UTILITY FUNCTIONS ====================

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎥';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📈';
  return '📎';
}
