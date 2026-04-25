const POPULAR_SEARCHES = ['goa', 'thailand', 'kolkata', 'manali', 'kerala', 'bali'];
const API_URL = 'http://localhost:3000/api/places';

async function warmCache() {
  console.log('🚀 Starting Cache Warming...');
  
  for (const term of POPULAR_SEARCHES) {
    try {
      console.log(`🔍 Warming: ${term}...`);
      const res = await fetch(`${API_URL}?search=${term}&limit=12`);
      const data = await res.json();
      
      if (data.success) {
        console.log(`✅ ${term} warmed. Results: ${data.data.results.length}`);
      } else {
        console.error(`❌ Failed to warm ${term}:`, data.message);
      }
    } catch (e) {
      console.error(`❌ Error warming ${term}:`, e.message);
    }
  }
  
  console.log('✨ Cache Warming Complete!');
}

warmCache();
