import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables FIRST
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function run() {
  const { SearchService } = await import('../src/modules/search/SearchService');
  
  console.log('Searching for "sulagna24400122042" via SearchService...');
  const res = await SearchService.searchUsers({ query: 'sulagna24400122042', forceRefresh: true });
  console.log('Search Results:', res.results);
  console.log('Search Source:', res.source);
  console.log('Search Total Count:', res.totalCount);
  
  process.exit(0);
}

run();
