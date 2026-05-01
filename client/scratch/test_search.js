
const { adminSearch } = require('./src/lib/server/touristSearchUtils');
const { getSharedPlacesCache } = require('./src/lib/server/sharedPlacesCache');

async function test() {
  try {
    console.log("Testing adminSearch...");
    const results = await adminSearch({ search: 'Kolkata', page: 1, limit: 5 });
    console.log("Results count:", results.data.length);
    console.log("First result ID:", results.data[0]?.id);
  } catch (e) {
    console.error("Test failed:", e);
  }
}

test();
