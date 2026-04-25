import { normalize, fuzzyMatch, getScore, performFuzzySearch } from '../lib/server/touristSearchUtils';

const mockPlaces = [
  {
    id: '1',
    Name: 'Mysore Palace',
    Area: 'Mysore',
    State: 'Karnataka',
    Country: 'India',
    Category: 'Heritage',
    Description: 'A historical palace in the city of Mysore.'
  },
  {
    id: '2',
    Name: 'Bangalore Fort',
    Area: 'Bangalore',
    State: 'Karnataka',
    Country: 'India',
    Category: 'Heritage',
    Description: 'A historical fort in Bangalore.'
  },
  {
    id: '3',
    Name: 'Taj Mahal',
    Area: 'Agra',
    State: 'Uttar Pradesh',
    Country: 'India',
    Category: 'Heritage',
    Description: 'A white marble mausoleum.'
  }
];

function test() {
  console.log("--- TEST START ---");

  const queries = [
    { q: "mysore", expected: "Mysore Palace" },
    { q: "karnataka", expected: "Mysore Palace" },
    { q: "india", expected: "Mysore Palace" },
    { q: "heritage", expected: "Mysore Palace" },
    { q: "mysor", expected: "Mysore Palace" }, // fuzzy
    { q: "karntk", expected: "Mysore Palace" } // fuzzy
  ];

  for (const { q, expected } of queries) {
    const results = performFuzzySearch(mockPlaces, q);
    const topResult = results[0];
    const score = topResult ? getScore(topResult, q) : 0;
    
    console.log(`Query: "${q}" -> Top: "${topResult?.Name}" (Score: ${score})`);
    
    if (topResult?.Name.includes(expected) || (q === "karnataka" && topResult?.State === "Karnataka")) {
       // success
    } else {
       console.error(`FAILED: Expected ${expected} for query ${q}`);
    }
  }

  console.log("--- TEST END ---");
}

test();
