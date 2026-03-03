# ABjee Travel

A modern, optimized travel platform built with React, Firebase, and Express.js.

## ⚡ Performance Optimizations

- **Lazy Loading**: All routes use React.lazy() for code splitting
- **Code Splitting**: Separate bundles for Firebase, React, UI libraries, and forms
- **Optimized Build**: Minified with esbuild, CSS code splitting enabled
- **Fast Initial Load**: Only essential code loads upfront

## Features

- User authentication (Firebase Auth + Custom Admin Login)
- Community chat functionality
- Booking system for hotels, cabs, bikes, and car rentals
- Admin dashboard for managing users and bookings
- Responsive design with dark mode support

## Tech Stack

**Frontend:**
- React 19 + TypeScript
- Vite (optimized build)
- Tailwind CSS
- Framer Motion
- React Router v6
- Firebase Client SDK

**Backend:**
- Node.js + Express
- Firebase Admin SDK
- Firestore Database

## Getting Started

### Prerequisites
- Node.js 18+
- Firebase project with Firestore enabled

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd AbJee-Travel
```

2. **Install dependencies**

Client:
```bash
cd client
npm install
```

Server:
```bash
cd server
npm install
```

3. **Configure Firebase**

Create `client/.env`:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_SERVER_URL=http://localhost:5000
```

Add Firebase service account JSON to `server/firebase-service-account.json`

4. **Run the application**

Start server:
```bash
cd server
node src/server.js
```

Start client:
```bash
cd client
npm run dev
```

The app will be available at `http://localhost:5173` (client) and `http://localhost:5000` (server).

## Admin Access

Admin credentials are stored in Firestore `admins` collection:
1. Go to `/auth`
2. Select "Admin" role
3. Enter admin credentials
4. You'll be redirected to `/admin` dashboard

## Build & Deploy

```bash
cd client
npm run build  # Optimized production build
```

Build outputs to `client/dist/` with optimized chunks:
- `firebase-*.js` - Firebase SDK (~362KB, gzipped: ~78KB)
- `react-vendor-*.js` - React core libraries
- `ui-*.js` - UI components (~150KB, gzipped: ~48KB)
- `forms-*.js` - Form handling libraries

## Project Structure

```
AbJee-Travel/
├── client/          # React frontend (optimized)
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── contexts/     # React contexts (Auth, etc.)
│   │   ├── lib/          # Utilities and API clients
│   │   ├── Pages/        # Route pages (lazy loaded)
│   │   └── types/        # TypeScript types
│   └── public/      # Static assets
│
└── server/          # Express backend
    └── src/
        ├── config/       # Database and Firebase config
        ├── middleware/   # Auth, validation, errors
        ├── models/       # Data models
        └── routes/       # API endpoints
```

## Performance Metrics

- **Initial Load**: ~50-70% faster with lazy loading
- **Build Time**: ~13.5s (optimized)
- **Bundle Sizes**: 
  - Main bundle: ~300KB (gzipped: ~92KB)
  - Firebase: ~362KB (gzipped: ~78KB)
  - UI components: ~150KB (gzipped: ~48KB)

## License

MIT
