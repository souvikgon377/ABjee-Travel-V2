import { getFirestore, initializeFirestore } from 'firebase/firestore';
import app from './firebase';

// Use resilient transport settings for networks/proxies where WebChannel can intermittently fail.
export const firestoreDb = (() => {
	try {
		return initializeFirestore(app, {
			experimentalAutoDetectLongPolling: true,
			useFetchStreams: false,
		});
	} catch {
		return getFirestore(app);
	}
})();
