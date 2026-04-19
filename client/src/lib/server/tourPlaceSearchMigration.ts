import { randomUUID } from 'node:crypto';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

const COLLECTION = 'touristPlaces';
const BATCH_SIZE = 400;
const JOB_TTL_SECONDS = 24 * 60 * 60;
const LOCK_TTL_SECONDS = 2 * 60 * 60;
const RUNNING_LOCK_KEY = 'tourPlaces:migration:runningJobId';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;
const canUseRedis = Boolean(REDIS_URL && REDIS_TOKEN);

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

const getJobKey = (jobId: string) => `tourPlaces:migration:job:${jobId}`;

const redisRequest = async (command: string, args: Array<string | number>) => {
  if (!canUseRedis) return null;

  const response = await fetch(`${REDIS_URL}/${command}/${args.map((arg) => encodeURIComponent(String(arg))).join('/')}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Redis ${command} failed with status ${response.status}`);
  }

  return response.json() as Promise<{ result?: unknown }>;
};

const setJob = async (job: TourPlaceMigrationProgress) => {
  jobs.set(job.jobId, job);

  if (!canUseRedis) return;
  try {
    await redisRequest('setex', [getJobKey(job.jobId), JOB_TTL_SECONDS, JSON.stringify(job)]);
  } catch {
    // Memory fallback is already updated.
  }
};

const getJob = async (jobId: string): Promise<TourPlaceMigrationProgress | null> => {
  const memoryJob = jobs.get(jobId);
  if (memoryJob) {
    return memoryJob;
  }

  if (!canUseRedis) {
    return null;
  }

  try {
    const payload = await redisRequest('get', [getJobKey(jobId)]);
    const raw = payload?.result;
    if (typeof raw !== 'string' || raw.length === 0) {
      return null;
    }
    const parsed = JSON.parse(raw) as TourPlaceMigrationProgress;
    jobs.set(jobId, parsed);
    return parsed;
  } catch {
    return null;
  }
};

const getRunningLockValue = async (): Promise<string | null> => {
  if (runningJobId) {
    return runningJobId;
  }

  if (!canUseRedis) {
    return null;
  }

  try {
    const payload = await redisRequest('get', [RUNNING_LOCK_KEY]);
    return typeof payload?.result === 'string' && payload.result.length > 0 ? payload.result : null;
  } catch {
    return null;
  }
};

const tryAcquireRunningLock = async (jobId: string) => {
  if (!canUseRedis) {
    if (runningJobId) return false;
    runningJobId = jobId;
    return true;
  }

  try {
    const payload = await redisRequest('set', [RUNNING_LOCK_KEY, jobId, 'EX', LOCK_TTL_SECONDS, 'NX']);
    const acquired = payload?.result === 'OK';
    if (acquired) {
      runningJobId = jobId;
    }
    return acquired;
  } catch {
    // If Redis fails, fall back to in-memory lock.
    if (runningJobId) return false;
    runningJobId = jobId;
    return true;
  }
};

const refreshRunningLock = async (jobId: string) => {
  if (!canUseRedis) {
    runningJobId = jobId;
    return;
  }

  try {
    await redisRequest('setex', [RUNNING_LOCK_KEY, LOCK_TTL_SECONDS, jobId]);
  } catch {
    runningJobId = jobId;
  }
};

const releaseRunningLock = async (jobId: string) => {
  if (runningJobId === jobId) {
    runningJobId = null;
  }

  if (!canUseRedis) return;

  try {
    const payload = await redisRequest('get', [RUNNING_LOCK_KEY]);
    const current = typeof payload?.result === 'string' ? payload.result : null;
    if (current === jobId) {
      await redisRequest('del', [RUNNING_LOCK_KEY]);
    }
  } catch {
    // Best-effort lock release.
  }
};

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
  const job = await getJob(jobId);
  if (!job) return;

  job.status = 'running';
  await setJob(job);
  await refreshRunningLock(jobId);

  try {
    job.total = await resolveTotalCount();
    await setJob(job);

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

      await setJob(job);
      await refreshRunningLock(jobId);

      lastDocId = snapshot.docs[snapshot.docs.length - 1]?.id || null;

      if (snapshot.size < BATCH_SIZE) {
        break;
      }
    }

    job.status = 'completed';
    job.finishedAt = new Date().toISOString();
    await setJob(job);
  } catch (error) {
    job.status = 'failed';
    job.finishedAt = new Date().toISOString();
    job.error = error instanceof Error ? error.message : 'Migration failed';
    await setJob(job);
  } finally {
    await releaseRunningLock(jobId);
  }
};

export const startTourPlaceSearchMigration = async () => {
  const existingJobId = await getRunningLockValue();
  if (existingJobId) {
    const current = await getJob(existingJobId);
    if (current) {
      return { jobId: current.jobId, alreadyRunning: true, progress: current };
    }

    // Stale lock with no persisted job: best effort cleanup.
    await releaseRunningLock(existingJobId);
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

  const acquired = await tryAcquireRunningLock(jobId);
  if (!acquired) {
    const currentJobId = await getRunningLockValue();
    if (currentJobId) {
      const current = await getJob(currentJobId);
      if (current) {
        return { jobId: current.jobId, alreadyRunning: true, progress: current };
      }
    }
  }

  await setJob(progress);
  void runMigration(jobId);

  return { jobId, alreadyRunning: false, progress };
};

export const getTourPlaceSearchMigrationProgress = async (jobId: string) => getJob(jobId);
