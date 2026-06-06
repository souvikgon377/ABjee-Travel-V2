import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { default: client, TYPESENSE_ENABLED } = await import('../src/modules/search/typesenseClient.js');
const { adminDb } = await import('../src/lib/server/firebaseAdminFirestore.js');

console.log('\n=== TYPESENSE CHECK ===');
if (TYPESENSE_ENABLED) {
  // Check Egypt with isActive filter
  const withFilter = await client.collections('tourist_places').documents().search({
    q: 'egypt',
    query_by: 'country,name',
    per_page: 10,
    include_fields: 'country,state,area,city,isActive,name',
  });
  console.log(`Egypt in Typesense (any): found=${withFilter.found}`);
  if (withFilter.hits?.length) {
    withFilter.hits.forEach((h: any) => console.log('  -', JSON.stringify({ country: h.document.country, state: h.document.state, area: h.document.area, isActive: h.document.isActive, name: h.document.name })));
  }

  // Check total active vs total
  const allInfo = await client.collections('tourist_places').retrieve();
  console.log(`\nTotal docs in tourist_places: ${allInfo.num_documents}`);

  // Check how many are active
  const activeCheck = await client.collections('tourist_places').documents().search({
    q: '*',
    query_by: 'name',
    filter_by: 'isActive:=true',
    per_page: 1,
  });
  console.log(`Active places (isActive:=true): ${(activeCheck as any).found}`);

  const inactiveCheck = await client.collections('tourist_places').documents().search({
    q: '*',
    query_by: 'name',
    filter_by: 'isActive:=false',
    per_page: 1,
  });
  console.log(`Inactive places (isActive:=false): ${(inactiveCheck as any).found}`);
}

console.log('\n=== FIRESTORE CHECK ===');
const snap = await adminDb.collection('touristPlaces')
  .where('country', '==', 'Egypt')
  .limit(5)
  .get();
console.log(`Egypt docs in Firestore: ${snap.size}`);
snap.docs.forEach(d => {
  const data = d.data();
  console.log('  -', JSON.stringify({ country: data.country, state: data.state, area: data.area, isActive: data.isActive }));
});

process.exit(0);
