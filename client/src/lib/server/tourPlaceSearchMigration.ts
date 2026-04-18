import { randomUUID } from 'node:crypto';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

const COLLECTION = 'touristPlaces';
const BATCH_SIZE = 400;

type MigrationStatus = 'queued' | 'running' | 'completed' | 'failed';

export type TourPlaceMigrationProgress = {
  jobId: string;
  status: MigrationStatus;
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  startedAt: string;
  finishedAt?: string;
  error?: string;
};

const jobs = new Map<string, TourPlaceMigrationProgress>();
let runningJobId: string | null = null;

const normalizeField = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const getExpectedSearchFields = (doc: Record<string, unknown>) => ({
  searchName: normalizeField(doc.name),
  searchArea: normalizeField(doc.area),
  searchState: normalizeField(doc.state),
  searchCountry: normalizeField(doc.country),
});

const getMissingSearchFieldPatch = (doc: Record<string, unknown>) => {
  const expected = getExpectedSearchFields(doc);
  const patch: Record<string, string> = {};

  for (const [field, value] of Object.entries(expected)) {
    const existing = doc[field];
    if (typeof existing !== 'string') {
      patch[field] = value;
    }
  }

  return patch;
};

const resolveTotalCount = async () => {
  try {
    const aggregate = await adminDb.collection(COLLECTION).count().get();
    return Number(aggregate.data().count || 0);
  } catch {
    return 0;
  }
};

const runMigration = async (jobId: string) => {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'running';
  runningJobId = jobId;

  try {
    job.total = await resolveTotalCount();

    let lastDocId: string | null = null;

    while (true) {
      let ref = adminDb.collection(COLLECTION).orderBy(FieldPath.documentId()).limit(BATCH_SIZE);
      if (lastDocId) {
        ref = ref.startAfter(lastDocId);
      }

      const snapshot = await ref.get();
      if (snapshot.empty) break;

      const batch = adminDb.batch();
      let pendingWrites = 0;

      for (const docSnap of snapshot.docs) {
        const docData = docSnap.data() as Record<string, unknown>;
        const patch = getMissingSearchFieldPatch(docData);

        if (Object.keys(patch).length > 0) {
          batch.update(docSnap.ref, {
            ...patch,
            updatedAt: FieldValue.serverTimestamp(),
          });
          pendingWrites += 1;
          job.updated += 1;
        } else {
          job.skipped += 1;
        }

        job.processed += 1;
      }

      if (pendingWrites > 0) {
        await batch.commit();
      }

      lastDocId = snapshot.docs[snapshot.docs.length - 1]?.id || null;

      if (snapshot.size < BATCH_SIZE) {
        break;
      }
    }

    job.status = 'completed';
    job.finishedAt = new Date().toISOString();
  } catch (error) {
    job.status = 'failed';
    job.finishedAt = new Date().toISOString();
    job.error = error instanceof Error ? error.message : 'Migration failed';
  } finally {
    runningJobId = null;
  }
};

export const startTourPlaceSearchMigration = () => {
  if (runningJobId) {
    const current = jobs.get(runningJobId);
    if (current) {
      return { jobId: current.jobId, alreadyRunning: true, progress: current };
    }
  }

  const jobId = randomUUID();
  const progress: TourPlaceMigrationProgress = {
    jobId,
    status: 'queued',
    total: 0,
    processed: 0,
    updated: 0,
    skipped: 0,
    startedAt: new Date().toISOString(),
  };

  jobs.set(jobId, progress);
  void runMigration(jobId);

  return { jobId, alreadyRunning: false, progress };
};

export const getTourPlaceSearchMigrationProgress = (jobId: string) => jobs.get(jobId) || null;
