import admin from "firebase-admin";

type ServiceAccountShape = {
  project_id: string;
  client_email: string;
  private_key: string;
};

const getServiceAccount = (): ServiceAccountShape | null => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccountShape;
    return {
      ...parsed,
      private_key: parsed.private_key?.replace(/\\n/g, "\n"),
    };
  }

  const project_id = process.env.FIREBASE_PROJECT_ID;
  const client_email = process.env.FIREBASE_CLIENT_EMAIL;
  const private_key = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!project_id || !client_email || !private_key) {
    return null;
  }

  return { project_id, client_email, private_key };
};

const globalForFirebase = globalThis as unknown as { firebaseAdminApp?: admin.app.App };

const serviceAccount = getServiceAccount();

const app =
  globalForFirebase.firebaseAdminApp ||
  admin.initializeApp(
    serviceAccount
      ? {
          credential: admin.credential.cert({
            projectId: serviceAccount.project_id,
            clientEmail: serviceAccount.client_email,
            privateKey: serviceAccount.private_key,
          }),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
          databaseURL: process.env.FIREBASE_DATABASE_URL,
        }
      : {
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
          databaseURL: process.env.FIREBASE_DATABASE_URL,
        }
  );

if (!globalForFirebase.firebaseAdminApp) {
  globalForFirebase.firebaseAdminApp = app;
}

export const adminAuth = admin.auth(app);
export const adminDb = admin.firestore(app);
export const getAdminRtdb = () => admin.database(app);
export const getAdminStorage = () => admin.storage(app);
export { admin };
