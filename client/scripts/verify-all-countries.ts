import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { default: client } = await import('../src/modules/search/typesenseClient.js');

const pageSize = 250;

// Fetch page 1 to get total
const firstPage = await client.collections('tourist_places').documents().search({
  q: '*', query_by: 'name', filter_by: 'isActive:=true',
  per_page: pageSize, page: 1, include_fields: 'country,state,city,area',
});

const totalFound: number = (firstPage as any).found ?? 0;
const totalPages = Math.ceil(totalFound / pageSize);

// Fetch remaining pages in parallel
const remainingPages = totalPages > 1
  ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, i) =>
      client.collections('tourist_places').documents().search({
        q: '*', query_by: 'name', filter_by: 'isActive:=true',
        per_page: pageSize, page: i + 2, include_fields: 'country,state,city,area',
      })
    ))
  : [];

const allHits = [...(firstPage.hits || []), ...remainingPages.flatMap((r) => r.hits || [])] as any[];

// Apply the fixed buildLocations logic (area fallback to state)
const normalize = (v: unknown) => String(v ?? '').trim();
const deduped = new Map<string, { country: string; state: string; area: string }>();
for (const hit of allHits) {
  const country = normalize(hit.document.country);
  const state = normalize(hit.document.state);
  const area = normalize(hit.document.area || hit.document.city) || state;
  if (!country || !state) continue;
  const key = `${country.toLowerCase()}|${state.toLowerCase()}|${area.toLowerCase()}`;
  if (!deduped.has(key)) deduped.set(key, { country, state, area });
}

const locations = Array.from(deduped.values());
const countries = [...new Set(locations.map(l => l.country))].sort();

console.log(`\n✅ Total pages fetched: ${totalPages}`);
console.log(`✅ Total places fetched: ${allHits.length} / ${totalFound}`);
console.log(`✅ Unique locations (country+state+area combos): ${locations.length}`);
console.log(`✅ Unique countries: ${countries.length}`);
console.log('\n📋 All countries:');
console.log(countries.join(', '));

process.exit(0);
