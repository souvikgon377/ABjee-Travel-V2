import { getDatabase } from 'firebase-admin/database';

import { app } from './firebaseAdminApp';

type NoopRtdbSnapshot = {
	val: () => null;
	exists: boolean;
};

type NoopRtdbRef = {
	child: (path: string) => NoopRtdbRef;
	endAt: (value: unknown) => NoopRtdbRef;
	get: () => Promise<NoopRtdbSnapshot>;
	limitToFirst: (limit: number) => NoopRtdbRef;
	limitToLast: (limit: number) => NoopRtdbRef;
	once: (_eventType: string) => Promise<NoopRtdbSnapshot>;
	orderByChild: (field: string) => NoopRtdbRef;
	push: () => NoopRtdbRef;
	set: (value: unknown) => Promise<void>;
	startAt: (value: unknown) => NoopRtdbRef;
	update: (value: unknown) => Promise<void>;
};

const createNoopSnapshot = (): NoopRtdbSnapshot => ({
	val: () => null,
	exists: false,
});

const createNoopRef = (): NoopRtdbRef => {
	const ref: NoopRtdbRef = {
		child: () => ref,
		endAt: () => ref,
		get: async () => createNoopSnapshot(),
		limitToFirst: () => ref,
		limitToLast: () => ref,
		once: async () => createNoopSnapshot(),
		orderByChild: () => ref,
		push: () => ref,
		set: async () => undefined,
		startAt: () => ref,
		update: async () => undefined,
	};

	return ref;
};

const createNoopDatabase = () => ({
	ref: () => createNoopRef(),
});

const hasDatabaseUrl = Boolean(
	process.env.FIREBASE_DATABASE_URL?.trim() ||
	process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.trim() ||
	process.env.FIREBASE_SERVICE_ACCOUNT?.trim() ||
	process.env.FIREBASE_PROJECT_ID?.trim() ||
	process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
);

export const getAdminRtdb = () => (hasDatabaseUrl ? getDatabase(app) : createNoopDatabase() as ReturnType<typeof createNoopDatabase>);