import { getAuth } from 'firebase-admin/auth';

import { app } from './firebaseAdminApp';

export const adminAuth = getAuth(app);