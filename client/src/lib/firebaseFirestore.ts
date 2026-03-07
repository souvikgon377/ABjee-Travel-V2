import { getFirestore } from 'firebase/firestore';
import app from './firebase';

// Initialized lazily — only loaded when admin/reporting components are imported
export const firestoreDb = getFirestore(app);
