import { getDatabase } from 'firebase-admin/database';

import { app } from './firebaseAdminApp';

export const getAdminRtdb = () => getDatabase(app);