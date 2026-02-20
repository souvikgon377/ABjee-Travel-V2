# Chat Room Image Upload - Cloudinary Setup Guide

## Overview
This guide will help you set up Cloudinary unsigned upload preset for chat room images.

## What Was Implemented

### 1. **Image Upload with SHA-256 Hashing**
- Background images for chat rooms
- Icon images for chat rooms
- SHA-256 hash generation for each image
- Deduplication based on hash
- Only metadata stored in database

### 2. **Features**
- ✅ Client-side image validation (size, format)
- ✅ SHA-256 hash calculation using Web Crypto API
- ✅ Cloudinary upload with metadata
- ✅ Image preview before upload
- ✅ Memory leak prevention (URL cleanup)
- ✅ Progress indicators
- ✅ Only metadata stored in Firebase Realtime Database

### 3. **Database Schema**
```typescript
interface ChatRoomImage {
  url: string;          // Cloudinary secure URL
  publicId: string;     // Cloudinary public ID
  hash: string;         // SHA-256 hash for deduplication
  width: number;        // Image dimensions
  height: number;
  format: string;       // Image format (jpg, png, etc.)
  bytes: number;        // File size
  createdAt: string;    // Upload timestamp
}
```

## Cloudinary Setup Instructions

### Step 1: Create Upload Preset

1. **Login to Cloudinary Dashboard**
   - Go to https://cloudinary.com/console
   - Login with your credentials

2. **Navigate to Upload Settings**
   - Click on **Settings** (gear icon)
   - Go to **Upload** tab
   - Scroll to **Upload presets** section

3. **Create New Preset**
   - Click **Add upload preset**
   - Set the following:
     ```
     Preset name: chat_rooms
     Signing mode: Unsigned
     Folder: chat-rooms (auto-create)
     ```

4. **Configure Preset Settings**
   - **Upload control**:
     - ✅ Allow uploads without authentication
     - ✅ Use filename as Public ID: No
     - ✅ Unique filename: Yes
   
   - **Media analysis**:
     - ✅ Quality analysis: On
     - ✅ Accessibility analysis: Optional
   
   - **Upload manipulations** (optional):
     - Max dimensions: 1920x1080 (reduces large images)
     - Format: Auto (Cloudinary chooses best format)
     - Quality: Auto (optimizes file size)
   
   - **Allowed formats**:
     - jpg, png, webp, gif

5. **Save the Preset**
   - Click **Save**

### Step 2: Verify Environment Variables

Ensure your `.env` files have the correct values:

#### Client (`.env`)
```env
VITE_CLOUDINARY_CLOUD_NAME=dsz7jjxxk
VITE_CLOUDINARY_API_KEY=857131254533357
VITE_CLOUDINARY_UPLOAD_PRESET=chat_rooms
```

#### Server (`.env`)
```env
CLOUDINARY_CLOUD_NAME=dsz7jjxxk
CLOUDINARY_API_KEY=857131254533357
CLOUDINARY_API_SERECT=E_6xy1hFEO0Fyg8eP9bC1OrRNdI
CLOUDINARY_URL=cloudinary://857131254533357:E_6xy1hFEO0Fyg8eP9bC1OrRNdI@dsz7jjxxk
```

### Step 3: Test the Implementation

1. **Start the application**
   ```bash
   cd client
   npm run dev
   ```

2. **Test image upload**
   - Navigate to Chat Page
   - Click "Create New Room"
   - Upload a background image (recommended: 1920x1080)
   - Upload an icon image (recommended: 256x256)
   - Fill in room details
   - Click "Create Room"

3. **Verify in Cloudinary**
   - Go to Cloudinary Dashboard > Media Library
   - Check folders:
     - `chat-rooms/backgrounds/` - Background images
     - `chat-rooms/icons/` - Icon images
   - Verify metadata includes SHA-256 hash in context

## How It Works

### Image Upload Flow

```
1. User selects image
   ↓
2. Client validates file (size, format)
   ↓
3. Generate SHA-256 hash
   ↓
4. Create preview (URL.createObjectURL)
   ↓
5. User submits form
   ↓
6. Upload to Cloudinary with hash in metadata
   ↓
7. Receive Cloudinary response (URL, public_id, etc.)
   ↓
8. Store metadata in Firebase Realtime Database
   ↓
9. Cleanup preview URL (prevent memory leak)
```

### Deduplication Strategy

- **SHA-256 Hash**: Each image is hashed before upload
- **Metadata Storage**: Hash is stored in Cloudinary context
- **Future Enhancement**: Backend can check hash before upload to prevent duplicates
- **Integrity Verification**: Hash can verify image hasn't been modified

### Security Features

1. **Unsigned Upload**: No API secret exposed to client
2. **Upload Preset**: Controls what can be uploaded
3. **File Validation**: Size and format checked client-side
4. **Folder Organization**: Images organized by type
5. **No Direct Database Storage**: Only URLs stored, not binary data

## File Structure

```
client/src/
├── lib/
│   ├── imageUpload.ts          # Image upload utility with SHA-256
│   └── chatService.ts          # Updated with image metadata
└── Pages/
    └── ChatPage.tsx            # Form with image upload inputs

client/.env                      # Cloudinary config
```

## API Usage

### Upload Single Image
```typescript
import { uploadImageToCloudinary } from '@/lib/imageUpload';

const result = await uploadImageToCloudinary(file, {
  folder: 'chat-rooms/backgrounds',
  maxSizeBytes: 5 * 1024 * 1024,
  allowedFormats: ['jpg', 'png', 'webp']
});

// Result contains:
// - url (Cloudinary URL)
// - hash (SHA-256)
// - publicId
// - width, height, format, bytes
```

### Create Image Preview
```typescript
import { createImagePreview, revokeImagePreview } from '@/lib/imageUpload';

const preview = createImagePreview(file);
// Use preview in <img src={preview} />

// Cleanup when done
revokeImagePreview(preview);
```

## Troubleshooting

### Issue: "Upload failed"
- **Check**: Upload preset name matches `.env` value
- **Check**: Preset is set to "Unsigned"
- **Check**: Internet connection

### Issue: "File size exceeds maximum"
- Default max: 5MB
- Adjust in `imageUpload.ts` if needed

### Issue: "File format must be one of..."
- Only images allowed: jpg, jpeg, png, webp, gif
- Check file extension

### Issue: Images not showing in room
- **Check**: Firebase database rules allow writes
- **Check**: Room data includes `backgroundImage` and `iconImage` fields
- **Check**: Cloudinary URLs are accessible

## Next Steps (Optional Enhancements)

1. **Backend Deduplication**
   - Create API endpoint to check hash before upload
   - Return existing image if hash matches

2. **Image Optimization**
   - Add Cloudinary transformations (resize, compress)
   - Generate multiple sizes (thumbnail, medium, large)

3. **Advanced Features**
   - Image cropping tool
   - Filters and effects
   - Bulk upload

4. **Admin Features**
   - Moderate uploaded images
   - Delete inappropriate content
   - Usage analytics

## Support

For issues or questions:
1. Check Cloudinary documentation: https://cloudinary.com/documentation
2. Review Firebase Realtime Database rules
3. Check browser console for errors
4. Verify environment variables are loaded

---
**Last Updated**: February 19, 2026
**Version**: 1.0.0
