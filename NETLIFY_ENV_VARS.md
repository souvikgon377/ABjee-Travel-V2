# Netlify Environment Variables Setup

After deploying to Netlify, add these environment variables in your Netlify dashboard:

## How to Add Environment Variables

1. Go to your Netlify site dashboard
2. Navigate to **Site settings** → **Environment variables**
3. Click **Add a variable** and add each one below:

---

## Required Environment Variables

### Backend API
```
VITE_SERVER_URL = https://abjee-travel.onrender.com
```

### App Configuration
```
VITE_APP_NAME = ABjee Travel
VITE_APP_VERSION = 1.0.0
```

### Feature Flags
```
VITE_ENABLE_CHAT = true
VITE_ENABLE_TRAVEL_PARTNERS = true
VITE_ENABLE_SUBSCRIPTIONS = true
```

### Production Settings
```
VITE_DEBUG_MODE = false
```

### Firebase Configuration
```
VITE_FIREBASE_API_KEY = AIzaSyD2RQGDQWj6uv5zZfcNOwjbi8wX6vv61Ss
VITE_FIREBASE_AUTH_DOMAIN = abjee-travel-4fc38.firebaseapp.com
VITE_FIREBASE_PROJECT_ID = abjee-travel-4fc38
VITE_FIREBASE_STORAGE_BUCKET = abjee-travel-4fc38.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID = 1042055167342
VITE_FIREBASE_APP_ID = 1:1042055167342:web:4c9e26116cd60e9459d57f
VITE_FIREBASE_MEASUREMENT_ID = G-VCZ3KW7NY1
VITE_FIREBASE_DATABASE_URL = https://abjee-travel-4fc38-default-rtdb.asia-southeast1.firebasedatabase.app
```

### Cloudinary Configuration
```
VITE_CLOUDINARY_CLOUD_NAME = dsz7jjxxk
VITE_CLOUDINARY_API_KEY = 857131254533357
VITE_CLOUDINARY_UPLOAD_PRESET = chat_rooms
```

---

## Bulk Import (Faster Method)

You can copy-paste all variables at once using Netlify's bulk import:

1. Go to **Site settings** → **Environment variables**
2. Click **Import from .env file**
3. Paste this:

```env
VITE_SERVER_URL=https://abjee-travel.onrender.com
VITE_APP_NAME=ABjee Travel
VITE_APP_VERSION=1.0.0
VITE_ENABLE_CHAT=true
VITE_ENABLE_TRAVEL_PARTNERS=true
VITE_ENABLE_SUBSCRIPTIONS=true
VITE_DEBUG_MODE=false
VITE_FIREBASE_API_KEY=AIzaSyD2RQGDQWj6uv5zZfcNOwjbi8wX6vv61Ss
VITE_FIREBASE_AUTH_DOMAIN=abjee-travel-4fc38.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=abjee-travel-4fc38
VITE_FIREBASE_STORAGE_BUCKET=abjee-travel-4fc38.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1042055167342
VITE_FIREBASE_APP_ID=1:1042055167342:web:4c9e26116cd60e9459d57f
VITE_FIREBASE_MEASUREMENT_ID=G-VCZ3KW7NY1
VITE_FIREBASE_DATABASE_URL=https://abjee-travel-4fc38-default-rtdb.asia-southeast1.firebasedatabase.app
VITE_CLOUDINARY_CLOUD_NAME=dsz7jjxxk
VITE_CLOUDINARY_API_KEY=857131254533357
VITE_CLOUDINARY_UPLOAD_PRESET=chat_rooms
```

4. Click **Import variables**
5. Trigger a new deploy

---

**After adding these variables, trigger a redeploy for changes to take effect.**
