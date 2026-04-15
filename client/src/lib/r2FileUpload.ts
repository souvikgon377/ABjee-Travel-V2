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

/**
 * Trim a video to a maximum duration (default: 60 seconds).
 * Falls back to original file when trimming is unsupported or fails.
 */
export async function trimVideoFile(
  file: File,
  options: {
    startTimeSeconds?: number;
    maxDurationSeconds?: number;
    maxSizeBytes?: number;
    maxWidth?: number;
    maxHeight?: number;
    frameRate?: number;
    minVideoBitsPerSecond?: number;
    maxVideoBitsPerSecond?: number;
    videoBitsPerSecond?: number;
    audioBitsPerSecond?: number;
  } = {}
): Promise<File> {
  const startTimeSeconds = Math.max(0, Math.floor(options.startTimeSeconds ?? 0));
  const maxDurationSeconds = options.maxDurationSeconds ?? 60;
  const maxSizeBytes = options.maxSizeBytes ?? 10 * 1024 * 1024;
  const maxWidth = options.maxWidth ?? 1280;
  const maxHeight = options.maxHeight ?? 720;
  const frameRate = options.frameRate ?? 24;
  const minVideoBitsPerSecond = options.minVideoBitsPerSecond ?? 450_000;
  const maxVideoBitsPerSecond = options.maxVideoBitsPerSecond ?? 1_600_000;
  const audioBitsPerSecond = options.audioBitsPerSecond ?? 96_000;

  if (!file.type.startsWith('video/')) {
    return file;
  }

  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  let sourceStream: MediaStream | null = null;
  let outputStream: MediaStream | null = null;

  try {
    const video = document.createElement('video');
    video.src = objectUrl;
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Failed to load video for trimming'));
      };
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
    });

    const durationSeconds = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!durationSeconds) {
      return file;
    }

    if (durationSeconds <= maxDurationSeconds && startTimeSeconds === 0) {
      return file;
    }

    const effectiveStart = Math.min(startTimeSeconds, Math.max(0, Math.floor(durationSeconds - 1)));
    const effectiveDuration = Math.max(1, Math.min(maxDurationSeconds, Math.floor(durationSeconds - effectiveStart)));

    const sourceWidth = video.videoWidth || 0;
    const sourceHeight = video.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) {
      return file;
    }

    const widthRatio = maxWidth / sourceWidth;
    const heightRatio = maxHeight / sourceHeight;
    const ratio = Math.min(1, widthRatio, heightRatio);
    const targetWidth = Math.max(2, Math.floor(sourceWidth * ratio));
    const targetHeight = Math.max(2, Math.floor(sourceHeight * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return file;
    }

    const canvasStream = canvas.captureStream(frameRate);
    outputStream = new MediaStream(canvasStream.getVideoTracks());

    const captureFn = ((video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }).captureStream)
      || ((video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }).mozCaptureStream);

    if (typeof captureFn === 'function') {
      sourceStream = captureFn.call(video);
      sourceStream.getAudioTracks().forEach((track) => outputStream?.addTrack(track));
    }

    const mimeCandidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';

    const requestedVideoBits = options.videoBitsPerSecond;
    const adaptiveVideoBitsPerSecond = requestedVideoBits ?? Math.max(
      minVideoBitsPerSecond,
      Math.min(
        maxVideoBitsPerSecond,
        Math.floor((((maxSizeBytes * 8) / effectiveDuration) - audioBitsPerSecond) * 0.88)
      )
    );

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(outputStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: adaptiveVideoBitsPerSecond,
      audioBitsPerSecond,
    });

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    let rafId = 0;
    const drawFrame = () => {
      if (video.paused || video.ended) return;
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      rafId = window.requestAnimationFrame(drawFrame);
    };

    const trimmedBlob = await new Promise<Blob>((resolve, reject) => {
      let stopTimer: number | null = null;
      let didFinalize = false;

      const finalize = () => {
        if (didFinalize) return;
        didFinalize = true;
        if (rafId) window.cancelAnimationFrame(rafId);
        if (stopTimer !== null) {
          window.clearTimeout(stopTimer);
          stopTimer = null;
        }
        video.pause();
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      recorder.onerror = () => reject(new Error('Video trimming failed'));
      recorder.onstop = () => {
        try {
          resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
        } catch {
          reject(new Error('Failed to finalize trimmed video'));
        }
      };

      video.onended = finalize;

      const beginRecording = () => {
        recorder.start(1000);
        video.play().then(() => {
          drawFrame();
          stopTimer = window.setTimeout(() => {
            finalize();
          }, effectiveDuration * 1000 + 200);
        }).catch(() => {
          finalize();
          reject(new Error('Video playback failed during trimming'));
        });
      };

      if (effectiveStart > 0) {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          beginRecording();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = effectiveStart;
      } else {
        video.currentTime = 0;
        beginRecording();
      }
    });

    if (!trimmedBlob.size || trimmedBlob.size >= file.size) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([trimmedBlob], `${baseName}-trimmed.webm`, { type: trimmedBlob.type || 'video/webm' });
  } catch {
    return file;
  } finally {
    outputStream?.getTracks().forEach((track) => track.stop());
    sourceStream?.getTracks().forEach((track) => track.stop());
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Compress a video file using browser MediaRecorder.
 * Falls back to original file when compression is unsupported or fails.
 */
export async function compressVideoFile(
  file: File,
  options: {
    maxSizeBytes?: number;
    maxWidth?: number;
    maxHeight?: number;
    frameRate?: number;
    minVideoBitsPerSecond?: number;
    maxVideoBitsPerSecond?: number;
    audioBitsPerSecond?: number;
  } = {}
): Promise<File> {
  const targetMax = options.maxSizeBytes ?? 10 * 1024 * 1024;
  const maxWidth = options.maxWidth ?? 1280;
  const maxHeight = options.maxHeight ?? 720;
  const frameRate = options.frameRate ?? 24;
  const minVideoBitsPerSecond = options.minVideoBitsPerSecond ?? 450_000;
  const maxVideoBitsPerSecond = options.maxVideoBitsPerSecond ?? 1_600_000;
  const audioBitsPerSecond = options.audioBitsPerSecond ?? 96_000;

  if (!file.type.startsWith('video/')) {
    return file;
  }

  if (file.size <= targetMax) {
    return file;
  }

  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  let sourceStream: MediaStream | null = null;

  try {
    const video = document.createElement('video');
    video.src = objectUrl;
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Failed to load video for compression'));
      };
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
    });

    const sourceWidth = video.videoWidth || 0;
    const sourceHeight = video.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) {
      return file;
    }

    const widthRatio = maxWidth / sourceWidth;
    const heightRatio = maxHeight / sourceHeight;
    const ratio = Math.min(1, widthRatio, heightRatio);
    const targetWidth = Math.max(2, Math.floor(sourceWidth * ratio));
    const targetHeight = Math.max(2, Math.floor(sourceHeight * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return file;
    }

    const canvasStream = canvas.captureStream(frameRate);
    const outputStream = new MediaStream(canvasStream.getVideoTracks());

    const captureFn = ((video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }).captureStream)
      || ((video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }).mozCaptureStream);

    if (typeof captureFn === 'function') {
      sourceStream = captureFn.call(video);
      sourceStream.getAudioTracks().forEach((track) => outputStream.addTrack(track));
    }

    const mimeCandidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';

    const durationSeconds = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 10;
    // Keep headroom so container overhead does not push the file over the size target.
    const effectiveTargetBits = Math.floor(((targetMax * 8) / durationSeconds) * 0.85);
    const targetBitsPerSecond = Math.max(
      minVideoBitsPerSecond,
      Math.min(maxVideoBitsPerSecond, effectiveTargetBits)
    );

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(outputStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: targetBitsPerSecond,
      audioBitsPerSecond,
    });

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    let rafId = 0;
    const drawFrame = () => {
      if (video.paused || video.ended) return;
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      rafId = window.requestAnimationFrame(drawFrame);
    };

    const compressedBlob = await new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('Video compression failed'));
      recorder.onstop = () => {
        try {
          resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
        } catch {
          reject(new Error('Failed to finalize compressed video'));
        }
      };

      video.onended = () => {
        if (rafId) window.cancelAnimationFrame(rafId);
        if (recorder.state !== 'inactive') recorder.stop();
      };

      recorder.start(1000);
      video.currentTime = 0;
      video.play().then(() => {
        drawFrame();
      }).catch(() => {
        if (recorder.state !== 'inactive') recorder.stop();
        reject(new Error('Video playback failed during compression'));
      });
    });

    outputStream.getTracks().forEach((track) => track.stop());
    sourceStream?.getTracks().forEach((track) => track.stop());

    if (!compressedBlob.size || compressedBlob.size >= file.size) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([compressedBlob], `${baseName}.webm`, { type: compressedBlob.type || 'video/webm' });
  } catch {
    return file;
  } finally {
    sourceStream?.getTracks().forEach((track) => track.stop());
    URL.revokeObjectURL(objectUrl);
  }
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
        this.cleanup();

        resolve(file);
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

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
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
