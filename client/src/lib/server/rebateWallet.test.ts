import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/firebaseAdminFirestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'SERVER_TS',
  },
  adminDb: {
    collection: (name: string) => ({
      doc: (id?: string) => {
        const docId = id ?? `doc-${Math.random().toString(36).slice(2, 8)}`;
        const path = `${name}/${docId}`;
        return {
          id: docId,
          __path: path,
          get: async () => ({
            exists: true,
            data: () => ({})
          }),
          collection: (childName: string) => ({
            doc: (childId?: string) => {
              const nestedId = childId ?? `doc-${Math.random().toString(36).slice(2, 8)}`;
              const nestedPath = `${path}/${childName}/${nestedId}`;
              return {
                id: nestedId,
                __path: nestedPath,
                collection: (nextName: string) => ({
                  doc: (nextId?: string) => ({
                    id: nextId ?? `doc-${Math.random().toString(36).slice(2, 8)}`,
                    __path: `${nestedPath}/${nextName}/${nextId ?? `doc-${Math.random().toString(36).slice(2, 8)}`}`,
                  }),
                }),
              };
            },
          }),
        };
      },
    }),
    runTransaction: async (cb: (tx: any) => Promise<any>) => {
      const transaction = {
        get: async (ref: { __path?: string }) => {
          if ((ref.__path ?? '').startsWith('users/')) {
            return {
              exists: true,
              data: () => ({
                wallet: {
                  availablePoints: 0,
                  lifetimeEarnedPoints: 0,
                  lifetimeRedeemedPoints: 0,
                  lifetimeRedeemedRupees: 0,
                  monthly: {
                    monthKey: '2099-01',
                    redeemedPoints: 0,
                    redeemedRupees: 0,
                    monthlyCapRupees: 30,
                  },
                },
                subscription: {
                  type: 'premium',
                  isActive: true,
                  endDate: '2099-12-31T00:00:00.000Z',
                },
              }),
            };
          }
          return { exists: false, data: () => ({}) };
        },
        set: () => undefined,
        delete: () => undefined,
      };

      return cb(transaction);
    },
  },
}));

import { awardReviewRebate, calculateReviewRebate, awardPlaceRequestRebate } from './rebateWallet';

describe('calculateReviewRebate', () => {
  it('returns 2 points for free user with text and media', () => {
    const result = calculateReviewRebate({ subscription: { type: 'free', isActive: false }, text: 'hello', mediaCount: 1 });
    expect(result.textPoints).toBe(1);
    expect(result.mediaPoints).toBe(1);
    expect(result.totalPoints).toBe(2);
  });

  it('returns 5 points for premium user with text and media', () => {
    const result = calculateReviewRebate({ subscription: { type: 'premium', isActive: true }, text: 'hello', mediaCount: 2 });
    expect(result.textPoints).toBe(2);
    expect(result.mediaPoints).toBe(3);
    expect(result.totalPoints).toBe(5);
  });

  it('returns text points only when no media', () => {
    const result = calculateReviewRebate({ subscription: { type: 'pro', isActive: true }, text: 'some', mediaCount: 0 });
    expect(result.textPoints).toBe(2);
    expect(result.mediaPoints).toBe(0);
    expect(result.totalPoints).toBe(2);
  });

  it('returns 0 for empty text and mediaCount 0', () => {
    const result = calculateReviewRebate({ subscription: { type: 'free', isActive: false }, text: '', mediaCount: 0 });
    expect(result.textPoints).toBe(0);
    expect(result.mediaPoints).toBe(0);
    expect(result.totalPoints).toBe(0);
  });
});

describe('awardReviewRebate', () => {
  it('awards 5 points for active premium user with text and media', async () => {
    const result = await awardReviewRebate({
      userId: 'user-1',
      placeId: 'place-1',
      reviewData: {
        text: 'Great place',
        rating: 5,
        media: [{ type: 'image' }],
        author: 'Traveller',
        userId: 'user-1',
        createdAt: new Date('2099-01-01T00:00:00.000Z'),
      },
    });

    expect(result.ABJee.textPoints).toBe(2);
    expect(result.ABJee.mediaPoints).toBe(3);
    expect(result.ABJee.totalPoints).toBe(5);
    expect(result.wallet.availablePoints).toBe(5);
  });
});

describe('awardPlaceRequestRebate', () => {
  it('awards 5 points for requesting a place', async () => {
    const result = await awardPlaceRequestRebate({
      userId: 'user-1',
      placeId: 'place-1',
    });

    expect(result.points).toBe(5);
    expect(result.wallet.availablePoints).toBe(5);
  });
});
