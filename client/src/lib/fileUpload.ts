/**
 * 📎 FILE UPLOAD UTILITY FOR CHAT ATTACHMENTS
 * 
 * WHY: Upload various file types (documents, audio, video) to Cloudinary
 * DECISION: Support multiple file types for chat attachments
 */

import type { MessageAttachment } from './chatService';

// ==================== INTERFACES ====================

export interface FileUploadOptions {
  folder?: string;
  maxSizeBytes?: number;
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
  isVoiceMessage?: boolean;
}

// ==================== CONFIGURATION ====================

const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'ml_default';

const DEFAULT_OPTIONS: FileUploadOptions = {
  folder: 'chat-attachments',
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
  resourceType: 'auto'
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

function getResourceType(mimeType: string): 'image' | 'video' | 'raw' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'raw';
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

// ==================== UPLOAD FUNCTION ====================

/**
 * Upload any file type to Cloudinary
 */
export async function uploadFileToCloudinary(
  file: File,
  options: FileUploadOptions = {}
): Promise<MessageAttachment> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  
  // Validate file
  validateFile(file, mergedOptions);

  // Determine resource type
  const resourceType = mergedOptions.resourceType === 'auto' 
    ? getResourceType(file.type)
    : mergedOptions.resourceType;

  // Create form data
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', mergedOptions.folder || 'chat-attachments');
  
  if (resourceType) {
    formData.append('resource_type', resourceType);
  }

  // Upload to Cloudinary
  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Upload failed' } }));
    throw new Error(error.error?.message || 'Failed to upload file');
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
    url: result.secure_url,
    publicId: result.public_id,
    name: file.name,
    size: file.size,
    mimeType: file.type,
  };

  // Add duration for audio/video if available
  if (result.duration) {
    attachment.duration = result.duration;
  }

  return attachment;
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
    } catch (error) {
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
        
        // Convert to File
        const audioFile = new File(
          [audioBlob], 
          `voice-${Date.now()}.webm`, 
          { type: 'audio/webm' }
        );

        // Cleanup
        this.cleanup();
        
        resolve(audioFile);
      };

      this.mediaRecorder.stop();
    });
  }

  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

// ==================== HELPER FUNCTIONS ====================

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎥';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📊';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('compressed')) return '📦';
  return '📎';
}

