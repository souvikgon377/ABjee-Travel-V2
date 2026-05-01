import fs from 'fs';

function normalize(str = '') {
  return String(str).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildMinimal(p) {
  const id = p.id || p.Id || p._id || (p.name && p.area ? `tp_${normalize(p.name + p.area)}` : null);
  
  if (!id) {
    return null;
  }

  return {
    id: String(id),
    name: p.name || p.Name || 'Unnamed',
    // ...
  };
}

async function testMapping() {
  const raw = fs.readFileSync('places_backup.json', 'utf-8');
  // Manual parse to handle duplicates if needed, but JSON.parse usually takes the last one
  const parsed = JSON.parse(raw);
  const places = parsed.data;
  
  console.log(`Total places in backup: ${places.length}`);
  
  const minBatch = places.map(buildMinimal).filter(p => p !== null && !!(p.id && p.id !== "undefined"));
  console.log(`Places after buildMinimal: ${minBatch.length}`);
  
  if (minBatch.length < places.length) {
    const failed = places.find(p => !buildMinimal(p));
    console.log('Sample failed place:', JSON.stringify(failed, null, 2));
  }
}

testMapping().catch(console.error);
