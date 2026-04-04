import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

const envOrPlaceholder = (value: string | undefined, fallback: string) =>
  (value && value.trim()) || fallback;

const firebaseConfig = {
  apiKey: envOrPlaceholder(firebaseEnv.NEXT_PUBLIC_FIREBASE_API_KEY, "build-placeholder"),
  authDomain: envOrPlaceholder(firebaseEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, "build-placeholder.firebaseapp.com"),
  projectId: envOrPlaceholder(firebaseEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "build-placeholder"),
  storageBucket: envOrPlaceholder(firebaseEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, "build-placeholder.appspot.com"),
  messagingSenderId: envOrPlaceholder(firebaseEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, "000000000000"),
  appId: envOrPlaceholder(firebaseEnv.NEXT_PUBLIC_FIREBASE_APP_ID, "1:000000000000:web:buildplaceholder"),
  databaseURL: envOrPlaceholder(firebaseEnv.NEXT_PUBLIC_FIREBASE_DATABASE_URL, "https://build-placeholder.firebaseio.com"),
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Google Auth Provider
export const googleProvider = new GoogleAuthProvider();

// Initialize Realtime Database (for messages only)
export const database = getDatabase(app);

export default app;

