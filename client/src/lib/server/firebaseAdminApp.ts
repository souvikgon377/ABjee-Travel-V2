import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';

type ServiceAccountShape = {
  project_id: string;
  client_email: string;
  private_key: string;
};

const isValidServiceAccount = (value: Partial<ServiceAccountShape> | null | undefined): value is ServiceAccountShape => {
  return Boolean(
    value &&
      typeof value.project_id === 'string' && value.project_id.trim() &&
      typeof value.client_email === 'string' && value.client_email.trim() &&
      typeof value.private_key === 'string' && value.private_key.trim()
  );
};

const getServiceAccount = (): ServiceAccountShape | null => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as Partial<ServiceAccountShape>;
      if (!isValidServiceAccount(parsed)) {
        return null;
      }

      return {
        project_id: parsed.project_id,
        client_email: parsed.client_email,
        private_key: parsed.private_key.replace(/\\n/g, "\n"),
      };
    } catch {
      return null;
    }
  }

  const project_id = process.env.FIREBASE_PROJECT_ID;
  const client_email = process.env.FIREBASE_CLIENT_EMAIL;
  const private_key = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!project_id || !client_email || !private_key) {
    return null;
  }

  return { project_id, client_email, private_key };
};

const globalForFirebase = globalThis as unknown as { firebaseAdminApp?: App };

const serviceAccount = getServiceAccount();
const databaseUrl = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

export const app =
  globalForFirebase.firebaseAdminApp ||
  initializeApp(
    serviceAccount
      ? {
          credential: cert({
            projectId: serviceAccount.project_id,
            clientEmail: serviceAccount.client_email,
            privateKey: serviceAccount.private_key,
          }),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
          databaseURL: databaseUrl,
        }
      : {
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
          databaseURL: databaseUrl,
        }
  );

if (!globalForFirebase.firebaseAdminApp) {
  globalForFirebase.firebaseAdminApp = app;
}