import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serviceAccount;
const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');

try {
  console.log('[Firebase-Admin] Initializing Firebase Admin SDK...');
  console.log('[Firebase-Admin] Service account path:', serviceAccountPath);
  
  // Try to load from file
  if (fs.existsSync(serviceAccountPath)) {
    console.log('[Firebase-Admin] Loading service account from file');
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    console.log('[Firebase-Admin] Service account loaded:', {
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email
    });
  } 
  // If file doesn't exist, try environment variables
  else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('[Firebase-Admin] Loading service account from environment variable');
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      console.log('[Firebase-Admin] Service account loaded from env:', {
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email
      });
    } catch (parseError) {
      console.error('[Firebase-Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT:', parseError);
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable contains invalid JSON');
    }
  } 
  // If neither exists, throw error
  else {
    console.error('[Firebase-Admin] No service account configuration found');
    throw new Error('Firebase service account not found. Please add firebase-service-account.json to the server root directory or set FIREBASE_SERVICE_ACCOUNT environment variable.');
  }

  // Initialize Firebase Admin
  console.log('[Firebase-Admin] Initializing app with service account');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`,
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://abjee-travel-4fc38-default-rtdb.asia-southeast1.firebasedatabase.app'
  });
  console.log('[Firebase-Admin] Firebase Admin SDK initialized successfully');

  // Test the initialization
  const testAuth = admin.auth();
  console.log('[Firebase-Admin] Auth service ready:', !!testAuth);

} catch (error) {
  console.error('[Firebase-Admin] Failed to initialize:', {
    error: error.message,
    code: error.code,
    stack: error.stack
  });
  process.exit(1); // Exit if we can't initialize Firebase Admin
}

export const auth = admin.auth();
export const db = admin.firestore();
export const storage = admin.storage();
export const realtimeDb = admin.database();

export default admin;