import { adminDb } from '../src/lib/server/firebaseAdminFirestore';

async function main() {
  try {
    const snap = await adminDb.collection('stories').get();
    console.log(`Found ${snap.size} total stories.`);
    
    let deletedCount = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      const title = String(data.title || '');
      const destination = String(data.destination || '');
      const authorName = String(data.authorName || '');
      const description = String(data.description || '');

      // Check if it is a test story
      const isTest = 
        title.toLowerCase().includes('test') || 
        destination.toLowerCase().includes('test') || 
        authorName.toLowerCase().includes('test') ||
        description.toLowerCase().includes('test');
        
      if (isTest) {
        console.log(`Deleting story: ${doc.id} - "${title}" by "${authorName}"`);
        await doc.ref.delete();
        deletedCount++;
      }
    }
    
    console.log(`🎉 Deleted ${deletedCount} test stories.`);
  } catch (err) {
    console.error('Error running story cleanup:', err);
  }
  process.exit(0);
}

main();
