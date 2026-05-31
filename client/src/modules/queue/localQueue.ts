import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import type { QueueJob } from './QueueService';

const QUEUE_DIR = path.join(process.cwd(), '.local_queue', 'search_sync');

async function ensureDir() {
  try {
    await fs.mkdir(QUEUE_DIR, { recursive: true });
  } catch (err) {
    // ignore
  }
}

export async function enqueueLocalJob(job: QueueJob): Promise<string> {
  await ensureDir();
  const filename = `${Date.now()}-${randomBytes(6).toString('hex')}.json`;
  const filepath = path.join(QUEUE_DIR, filename);
  await fs.writeFile(filepath, JSON.stringify(job), 'utf8');
  console.info('[LocalQueue] Enqueued job to local queue', filepath);
  return filepath;
}

export async function listLocalJobs(): Promise<{ filename: string; path: string; job: QueueJob }[]> {
  try {
    await ensureDir();
    const files = await fs.readdir(QUEUE_DIR);
    const jobs: { filename: string; path: string; job: QueueJob }[] = [];
    for (const file of files.sort()) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(QUEUE_DIR, file);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const job = JSON.parse(content) as QueueJob;
        jobs.push({ filename: file, path: filePath, job });
      } catch (err) {
        console.warn('[LocalQueue] Skipping corrupt job file', filePath, err);
      }
    }
    return jobs;
  } catch (err) {
    return [];
  }
}

export async function processOneLocalJob(processor: (job: QueueJob) => Promise<void>): Promise<boolean> {
  const jobs = await listLocalJobs();
  if (jobs.length === 0) return false;
  const first = jobs[0];
  try {
    await processor(first.job);
    await fs.unlink(first.path);
    console.info(`[LocalQueue] Processed and removed ${first.filename}`);
    return true;
  } catch (err) {
    console.error('[LocalQueue] Processing local job failed:', err);

    // Detect Typesense "collection not found" (ObjectNotFound) and attempt to
    // initialize the collections, then retry the job once. This helps recover
    // when the Typesense instance was recently created but collections are
    // missing (common when pointing the app to a new VPS).
    const isTypesenseNotFound =
      (err && (err as any).httpStatus === 404) || (err && (err as any).status === 404) ||
      String((err && (err as any).message) || '').includes('Collection not found') ||
      String((err && (err as any).message) || '').includes('ObjectNotFound');

    if (isTypesenseNotFound) {
      try {
        console.info('[LocalQueue] Detected Typesense collection missing — attempting initializeTypesense() and retry.');
        const { initializeTypesense } = await import('../search/typesenseClient');
        const initResult = await initializeTypesense();
        console.info('[LocalQueue] initializeTypesense result:', initResult);
      } catch (initErr) {
        console.error('[LocalQueue] initializeTypesense() failed:', initErr);
      }

      // Retry the job once after attempting initialization
      try {
        await processor(first.job);
        await fs.unlink(first.path);
        console.info(`[LocalQueue] Processed and removed ${first.filename} after initialize`);
        return true;
      } catch (retryErr) {
        console.error('[LocalQueue] Retry after initialize failed:', retryErr);
        // leave the file for later retry
        return false;
      }
    }

    // leave the file for later retry
    return false;
  }
}

export async function getLocalQueueLength(): Promise<number> {
  try {
    await ensureDir();
    const files = await fs.readdir(QUEUE_DIR);
    return files.filter((f) => f.endsWith('.json')).length;
  } catch (err) {
    return 0;
  }
}

export default {
  enqueueLocalJob,
  listLocalJobs,
  processOneLocalJob,
  getLocalQueueLength,
};
