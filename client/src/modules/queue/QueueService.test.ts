import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/redis', () => ({
  getRedis: () => null,
}));

vi.mock('./localQueue', () => ({
  enqueueLocalJob: vi.fn(),
  processOneLocalJob: vi.fn(async () => true),
  getLocalQueueLength: vi.fn(async () => 1),
}));

import { QueueService } from './QueueService';
import { processOneLocalJob } from './localQueue';

describe('QueueService.processNext', () => {
  it('returns true when a local queue job is processed', async () => {
    const processor = vi.fn(async () => undefined);

    const result = await QueueService.processNext(processor);

    expect(result).toBe(true);
    expect(processOneLocalJob).toHaveBeenCalledTimes(1);
  });
});