import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SyncService } from '../src/modules/search/SyncService';
import { healthCheckTypesense } from '../src/modules/search/typesenseClient';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

// ─── Worker State ──────────────────────────────────────────────────────────
let isRunning = true;
let totalProcessed = 0;
let totalErrors = 0;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30_000; // 30 seconds

// ─── Signal Handlers ──────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('\n[Worker] SIGTERM received. Gracefully shutting down...');
  isRunning = false;
});

process.on('SIGINT', () => {
  console.log('\n[Worker] SIGINT received. Gracefully shutting down...');
  isRunning = false;
});

process.on('uncaughtException', (err) => {
  console.error('[Worker] Uncaught exception:', err);
  totalErrors++;
});

process.on('unhandledRejection', (reason) => {
  console.error('[Worker] Unhandled rejection:', reason);
  totalErrors++;
});

async function startWorker() {
  console.log('👷 Search Sync Worker Started');
  console.log(`📋 Configuration:`);
  console.log(`   - Typesense: ${process.env.TYPESENSE_HOST || 'localhost'}:${process.env.TYPESENSE_PORT || 8108}`);
  console.log(`   - Health Check Interval: ${HEALTH_CHECK_INTERVAL / 1000}s`);
  console.log(`   - Process ID: ${process.pid}\n`);

  // Initial health check
  const isHealthy = await healthCheckTypesense(10_000);
  if (!isHealthy) {
    console.warn('⚠️  Typesense is not reachable. Worker will wait for it to come online and process queued jobs.');
  }

  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 10;

  while (isRunning) {
    try {
      const now = Date.now();
      
      // Periodic health check
      if (now - lastHealthCheck > HEALTH_CHECK_INTERVAL) {
        const healthy = await healthCheckTypesense(5_000);
        lastHealthCheck = now;
        if (!healthy) {
          console.warn('[Worker] ⚠️  Typesense is unavailable. Will retry after delay...');
          await new Promise((resolve) => setTimeout(resolve, 5_000)); // 5s wait before retry
          continue;
        } else {
          console.log('[Worker] ✅ Typesense is healthy');
          if (consecutiveErrors > 0) {
            console.log(`[Worker] 🔄 Recovered from ${consecutiveErrors} errors. Resuming processing.`);
            consecutiveErrors = 0;
          }
        }
      }

      // Process one job from the queue
      const jobStartTime = Date.now();
      const jobProcessed = await processOneJob();
      const jobDuration = Date.now() - jobStartTime;

      if (jobProcessed) {
        totalProcessed++;
        consecutiveErrors = 0; // Reset error counter on success
        
        if (totalProcessed % 10 === 0) {
          console.log(`[Worker] 📊 Progress: ${totalProcessed} jobs processed, ${totalErrors} errors`);
        }
      } else {
        // Queue is empty, wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 1_000)); // 1s idle wait
      }
    } catch (err: any) {
      consecutiveErrors++;
      totalErrors++;
      
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.error(`[Worker] ❌ Max consecutive errors (${maxConsecutiveErrors}) reached. Exiting.`);
        isRunning = false;
      } else {
        console.error(`[Worker] ❌ Error processing queue (${consecutiveErrors}/${maxConsecutiveErrors}):`, err.message);
        
        // Exponential backoff on errors (1s, 2s, 4s, 8s, etc.)
        const waitMs = Math.min(1000 * Math.pow(2, consecutiveErrors - 1), 30_000);
        console.log(`[Worker] ⏳ Waiting ${waitMs}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  // Graceful shutdown
  console.log(`\n[Worker] 🛑 Worker Shutdown Summary:`);
  console.log(`   - Total Jobs Processed: ${totalProcessed}`);
  console.log(`   - Total Errors: ${totalErrors}`);
  console.log(`   - Success Rate: ${totalProcessed > 0 ? ((totalProcessed / (totalProcessed + totalErrors)) * 100).toFixed(1) : 0}%`);
  process.exit(0);
}

async function processOneJob(): Promise<boolean> {
  try {
    // Try to process one job from the queue
    // If queue is empty, this should return without doing anything
    const result = await SyncService.processQueue();
    return !!result; // Returns true if a job was processed
  } catch (err: any) {
    throw new Error(`Failed to process job: ${err.message}`);
  }
}

startWorker().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
