import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables FIRST before any module imports
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const userId = 'RYuOXa66SQWMYjstS9qKt75eypI3';

async function run() {
  console.log(`Deleting user ${userId} from Typesense...`);
  try {
    const { SyncService } = await import('../src/modules/search/SyncService');
    const { SearchService } = await import('../src/modules/search/SearchService');

    await SyncService.delete("users", userId);
    console.log('User deleted from Typesense successfully.');
    
    console.log('Invalidating search cache...');
    await SearchService.invalidateSearchCache("user-deleted");
    console.log('Search cache invalidated successfully.');
  } catch (err) {
    console.error('Failed to clean up from Typesense:', err);
  }
  process.exit(0);
}

run();
