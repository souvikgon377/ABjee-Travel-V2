import { getFirestore, initializeFirestore, setLogLevel } from 'firebase/firestore';
import app from './firebase';

// Suppress noisy network transient connectivity errors in the console
try {
	setLogLevel('silent');
} catch (e) {
	console.warn('Failed to set Firestore log level:', e);
}

// Use resilient transport settings for networks/proxies where WebChannel can intermittently fail.
export const firestoreDb = (() => {
	try {
		return initializeFirestore(app, {
			experimentalAutoDetectLongPolling: true,
		});
	} catch {
		return getFirestore(app);
	}
})();
