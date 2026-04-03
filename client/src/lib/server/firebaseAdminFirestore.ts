import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

import { app } from './firebaseAdminApp';

export const adminDb = getFirestore(app);
export { FieldValue, Timestamp };